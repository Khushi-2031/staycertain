-- =====================================================================
-- StayCertain: automatic daily scoring of every booking in Supabase
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- The score comes ONLY from the trained Logistic Regression formula
-- (exported from Orange). No AI service is used.
-- =====================================================================

-- 1. The hotel's bookings (fill from the booking system, a CSV import, or the API)
create table if not exists public.bookings (
  id                          bigint generated always as identity primary key,
  booking_ref                 text unique,
  guest_name                  text,
  guest_email                 text,               -- used to find the guest's past bookings
  guest_phone                 text,               -- for WhatsApp / voice reconfirmation
  hotel                       text not null check (hotel in ('City Hotel','Resort Hotel')),
  booking_date                date not null,      -- day the booking was made
  checkin_date                date not null,
  checkout_date               date not null,
  adults                      int  not null default 2 check (adults >= 0),
  children                    int  not null default 0 check (children >= 0),   -- incl. babies
  meal                        text not null default 'BB' check (meal in ('BB','HB','FB','SC')),
  market_segment              text not null check (market_segment in ('Online TA','Offline TA/TO','Direct','Groups','Corporate','Complementary','Aviation')),
  customer_type               text not null default 'Transient' check (customer_type in ('Transient','Transient-Party','Contract','Group')),
  deposit_type                text not null default 'No Deposit' check (deposit_type in ('No Deposit','Non Refund','Refundable')),
  adr                         numeric(8,2) check (adr >= 0),                  -- room rate per night (EUR), or leave empty and fill adr_inr
  adr_inr                     numeric(10,2) check (adr_inr >= 0),             -- room rate per night (INR); converted at 90 INR per EUR
  booking_changes             int  not null default 0 check (booking_changes >= 0),
  required_car_parking_spaces int  not null default 0 check (required_car_parking_spaces >= 0),
  total_of_special_requests   int  not null default 0 check (total_of_special_requests >= 0),
  status                      text not null default 'confirmed' check (status in ('confirmed','cancelled','checked_out','no_show')),
  -- Optional manual overrides. Leave empty to calculate from guest_email history.
  is_repeated_guest           int check (is_repeated_guest in (0,1)),
  previous_cancellations      int check (previous_cancellations >= 0),
  previous_bookings_not_canceled int check (previous_bookings_not_canceled >= 0),
  created_at                  timestamptz not null default now(),
  constraint rate_given check (adr is not null or adr_inr is not null),
  constraint stay_dates_ok check (checkout_date >= checkin_date and checkin_date >= booking_date)
);

-- Upgrade a bookings table created by an earlier version of this script (safe to re-run)
alter table public.bookings add column if not exists guest_phone text;
alter table public.bookings add column if not exists adr_inr numeric(10,2);
alter table public.bookings alter column adr drop not null;
alter table public.bookings add column if not exists advance_paid_inr numeric(10,2) default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rate_given') then
    alter table public.bookings add constraint rate_given check (adr is not null or adr_inr is not null);
  end if;
end $$;

-- 2. One score per booking per day
create table if not exists public.booking_scores (
  id            bigint generated always as identity primary key,
  booking_id    bigint not null references public.bookings(id) on delete cascade,
  score_date    date   not null default current_date,
  probability   numeric(4,3) not null,
  tier          text   not null,
  action        text   not null,
  features      jsonb  not null,       -- the 18 model inputs used
  warnings      text[] not null default '{}',
  probability_at_booking numeric(4,3),
  days_to_arrival int,
  model_version text   not null default 'lr-orange-3.39-v1',
  scored_at     timestamptz not null default now(),
  unique (booking_id, score_date)
);

-- Private tables: only your team (dashboard / service key) can read or write.
alter table public.bookings enable row level security;
alter table public.booking_scores enable row level security;

alter table public.booking_scores add column if not exists probability_at_booking numeric(4,3);
alter table public.booking_scores add column if not exists days_to_arrival int;

-- 3. Turn a booking into the 13 model inputs (same rules as features.js in the app)
create or replace function public.staycertain_features(b public.bookings)
returns jsonb
language sql stable
as $$
  with nights as (
    select d::date as night
    from generate_series(b.checkin_date, b.checkout_date - 1, interval '1 day') as d
  ),
  hist as (
    select
      count(*) filter (where p.status = 'cancelled')                   as prev_cancel,
      count(*) filter (where p.status in ('checked_out','confirmed')
                         and p.checkout_date <= b.booking_date)          as prev_kept
    from public.bookings p
    where nullif(trim(b.guest_email), '') is not null
      and lower(p.guest_email) = lower(b.guest_email)
      and p.id <> b.id
      and p.booking_date < b.booking_date
  ),
  h as (select coalesce(b.previous_bookings_not_canceled, (select prev_kept from hist)) as kept,
               coalesce(b.previous_cancellations, (select prev_cancel from hist)) as cancels)
  select jsonb_build_object(
    'lead_time',                      b.checkin_date - b.booking_date,
    'arrival_date_month',             trim(to_char(b.checkin_date, 'FMMonth')),
    'stays_in_weekend_nights',        (select count(*) from nights where extract(dow from night) in (0,6)),
    'stays_in_week_nights',           (select count(*) from nights where extract(dow from night) between 1 and 5),
    'adults',                         b.adults,
    'children',                       b.children,
    'meal',                           b.meal,
    'market_segment',                 b.market_segment,
    'is_repeated_guest',              case when (select kept from h) > 0 then '1' else '0' end,
    'previous_cancellations',         (select cancels from h),
    'previous_bookings_not_canceled', (select kept from h),
    'customer_type',                  b.customer_type,
    'adr',                            coalesce(b.adr, round(b.adr_inr / 90.0, 2))
  );
$$;

-- 3b. Risk today: update the at-booking probability for the days left before arrival
--     (share of past cancellations that happened within the last d days, by lead-time group; Bayes' rule)
create or replace function public.staycertain_risk_today(p numeric, lead int, days_left int)
returns numeric
language plpgsql immutable
as $$
declare
  bins int[][] := '{{0,7},{8,30},{31,90},{91,180},{181,737}}';
  ds numeric[] := '{0,1,2,3,5,7,10,14,21,30,45,60,90,120,150,180,240,300,365,500,737}';
  curve numeric[][] := '{{0.4986,0.6309,0.7011,0.812,0.9256,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0},{0.0811,0.1021,0.1242,0.1625,0.2351,0.3298,0.4672,0.6417,0.8602,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0},{0.0442,0.0551,0.0651,0.0799,0.1075,0.1335,0.1736,0.2301,0.3166,0.4384,0.6728,0.835,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0},{0.0339,0.041,0.0484,0.0566,0.0728,0.0875,0.1103,0.1441,0.1892,0.2323,0.3061,0.3723,0.5085,0.7443,0.909,1.0,1.0,1.0,1.0,1.0,1.0},{0.021,0.026,0.0308,0.039,0.0511,0.0611,0.0748,0.1014,0.1329,0.1708,0.2215,0.2614,0.3405,0.4131,0.4879,0.5791,0.8268,0.9389,0.9853,0.9983,1.0}}';
  b int := 5; i int; f numeric := 1;
begin
  if days_left >= lead then return p; end if;
  for i in 1..5 loop
    if lead between bins[i][1] and bins[i][2] then b := i; exit; end if;
  end loop;
  if days_left <= ds[1] then f := curve[b][1];
  else
    for i in 2..array_length(ds,1) loop
      if days_left <= ds[i] then
        f := curve[b][i-1] + (curve[b][i] - curve[b][i-1]) * (days_left - ds[i-1]) / (ds[i] - ds[i-1]);
        exit;
      end if;
    end loop;
  end if;
  return round(p * f / (1 - p * (1 - f)), 3);
end;
$$;

-- 4. The trained model: probability of cancellation at booking, from the 13 inputs
create or replace function public.staycertain_predict(f jsonb)
returns numeric
language sql immutable
as $$
  select round((1 / (1 + exp(-(
      -1.13551875242133
      + 0.44244619842081234 * ((f->>'lead_time')::double precision - 80.6028701968135) * 0.011644386300050363
      + 0.02435405591009353 * ((f->>'stays_in_weekend_nights')::double precision - 1.0171274601686973) * 0.974179054131177
      + 0.09331727721889323 * ((f->>'stays_in_week_nights')::double precision - 2.652893626991565) * 0.49196054032515785
      + -0.028958244987841962 * ((f->>'adults')::double precision - 1.886082474226804) * 2.0268544022502315
      + 0.0067530158067291 * ((f->>'children')::double precision - 0.14611059044048735) * 2.15259460623797
      + 0.7503855209364455 * ((f->>'previous_cancellations')::double precision - 0.029006560449859418) * 2.7377894548742825
      + -0.6832072807263146 * ((f->>'previous_bookings_not_canceled')::double precision - 0.16914245548266166) * 0.5960453548455211
      + 0.2656897996102164 * ((f->>'adr')::double precision - 108.56757040767938) * 0.019907172493111597
      + 0.05046414157071463 * ((case when f->>'arrival_date_month' = 'April' then 1 else 0 end) - 0.09092080599812559) * 3.478303729165253
      + -0.05168807128054262 * ((case when f->>'arrival_date_month' = 'August' then 1 else 0 end) - 0.12962746016869728) * 2.977137572893121
      + 0.0495852403749262 * ((case when f->>'arrival_date_month' = 'December' then 1 else 0 end) - 0.05761480787253983) * 4.291594838887592
      + 0.05026565610641133 * ((case when f->>'arrival_date_month' = 'February' then 1 else 0 end) - 0.06955248359887535) * 3.9309519771735917
      + 0.02809507817487898 * ((case when f->>'arrival_date_month' = 'January' then 1 else 0 end) - 0.053350515463917524) * 4.449754886941305
      + -0.05028038812703858 * ((case when f->>'arrival_date_month' = 'July' then 1 else 0 end) - 0.11561621368322399) * 3.1273050255763595
      + -0.012950206291896096 * ((case when f->>'arrival_date_month' = 'June' then 1 else 0 end) - 0.08949156513589503) * 3.5032163692510907
      + 0.032601711812411345 * ((case when f->>'arrival_date_month' = 'March' then 1 else 0 end) - 0.08608247422680412) * 3.5652429236144987
      + 0.0037156520504299426 * ((case when f->>'arrival_date_month' = 'May' then 1 else 0 end) - 0.09597000937207123) * 3.3950080806909373
      + -0.005362696892046715 * ((case when f->>'arrival_date_month' = 'November' then 1 else 0 end) - 0.056677600749765696) * 4.324781770372493
      + -0.02019657168960657 * ((case when f->>'arrival_date_month' = 'October' then 1 else 0 end) - 0.07861996251171509) * 3.715473639950236
      + -0.043611302763864095 * ((case when f->>'arrival_date_month' = 'September' then 1 else 0 end) - 0.07647610121836926) * 3.762816684845263
      + -0.007484118927335022 * ((case when f->>'meal' = 'BB' then 1 else 0 end) - 0.7775070290534208) * 2.404305724300715
      + 0.0038428735616141832 * ((case when f->>'meal' = 'FB' then 1 else 0 end) - 0.004029990627928772) * 15.7842827262439
      + -0.06536634737207163 * ((case when f->>'meal' = 'HB' then 1 else 0 end) - 0.10460402999062793) * 3.2675197706928203
      + 0.0720130567941238 * ((case when f->>'meal' = 'SC' then 1 else 0 end) - 0.1138589503280225) * 3.148219354198315
      + 0.010731960790281872 * ((case when f->>'market_segment' = 'Aviation' then 1 else 0 end) - 0.002600749765698219) * 19.63433502912572
      + -0.016190151964232413 * ((case when f->>'market_segment' = 'Complementary' then 1 else 0 end) - 0.0007146204311152765) * 37.42118353853083
      + 0.03784756083458908 * ((case when f->>'market_segment' = 'Corporate' then 1 else 0 end) - 0.04845360824742268) * 4.6571685370412155
      + -0.19816038764163055 * ((case when f->>'market_segment' = 'Direct' then 1 else 0 end) - 0.13523898781630742) * 2.924159067682025
      + 0.1260415093804985 * ((case when f->>'market_segment' = 'Groups' then 1 else 0 end) - 0.055260074976569824) * 4.376612843581389
      + -0.1886815004408865 * ((case when f->>'market_segment' = 'Offline TA/TO' then 1 else 0 end) - 0.1595946579194002) * 2.730526669507982
      + 0.20361624122351948 * ((case when f->>'market_segment' = 'Online TA' then 1 else 0 end) - 0.5981373008434864) * 2.039673757353192
      + 0.07685957092428856 * ((case when f->>'is_repeated_guest' = '0' then 1 else 0 end) - 0.9658036551077788) * 5.502571993238144
      + -0.07685957092428945 * ((case when f->>'is_repeated_guest' = '1' then 1 else 0 end) - 0.03419634489222118) * 5.502571993238144
      + -0.06322099359622123 * ((case when f->>'customer_type' = 'Contract' then 1 else 0 end) - 0.03648078725398313) * 5.333812067315403
      + -0.035702384728618336 * ((case when f->>'customer_type' = 'Group' then 1 else 0 end) - 0.005962980318650422) * 12.988740277516044
      + 0.20291229039701594 * ((case when f->>'customer_type' = 'Transient' then 1 else 0 end) - 0.8255623242736645) * 2.6351474534105566
      + -0.18435328020550412 * ((case when f->>'customer_type' = 'Transient-Party' then 1 else 0 end) - 0.13199390815370196) * 2.954348128268754
  ))))::numeric, 3);
$$;

-- 5. Problems that make a booking impossible to score (same limits as the app)
create or replace function public.staycertain_warnings(f jsonb)
returns text[]
language sql immutable
as $$
  select array_remove(array[
    case when (f->>'adults')::int < 1 then 'no adults on the booking' end,
    case when (f->>'adults')::int > 10 then 'more than 10 adults' end,
    case when (f->>'children')::int > 6 then 'more than 6 children' end,
    case when (f->>'stays_in_weekend_nights')::int + (f->>'stays_in_week_nights')::int < 1 then 'stay of 0 nights' end,
    case when (f->>'stays_in_weekend_nights')::int + (f->>'stays_in_week_nights')::int > 30 then 'stay longer than 30 nights' end,
    case when (f->>'lead_time')::int > 737 then 'booked more than 737 days ahead' end,
    case when (f->>'adr')::numeric * 90 < 500 or (f->>'adr')::numeric * 90 > 45000 then 'room rate outside Rs 500 - 45,000' end
  ], null);
$$;

-- 6. Score one booking (today) and store it. Impossible bookings are not scored.
create or replace function public.score_booking(p_booking_id bigint)
returns void
language plpgsql
as $$
declare
  b public.bookings;
  f jsonb;
  w text[];
  p0 numeric;
  p numeric;
  dleft int;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status <> 'confirmed' or b.checkin_date < current_date then
    return;
  end if;
  f := public.staycertain_features(b);
  w := public.staycertain_warnings(f);
  if array_length(w, 1) > 0 then
    delete from public.booking_scores where booking_id = b.id and score_date = current_date;
    return;
  end if;
  p0 := public.staycertain_predict(f);
  dleft := b.checkin_date - current_date;
  p := public.staycertain_risk_today(p0, (f->>'lead_time')::int, dleft);
  insert into public.booking_scores (booking_id, score_date, probability, probability_at_booking, days_to_arrival, tier, action, features, warnings)
  values (
    b.id, current_date, p, p0, dleft,
    case when p < 0.30 then 'Low' when p < 0.55 then 'Medium' else 'High' end,
    case when b.deposit_type = 'Non Refund' then 'Fully prepaid - no action needed.'
         when p < 0.30 then 'No action needed - keep the booking as normal.'
         when p < 0.55 then 'Send a WhatsApp reconfirmation 7 days before arrival.'
         else 'Ask for a 50% advance and send a WhatsApp reconfirmation; call if there is no reply.' end,
    f, w
  )
  on conflict (booking_id, score_date) do update
    set probability = excluded.probability, probability_at_booking = excluded.probability_at_booking,
        days_to_arrival = excluded.days_to_arrival, tier = excluded.tier, action = excluded.action,
        features = excluded.features, warnings = excluded.warnings, scored_at = now();
end;
$$;

-- 7. Score every upcoming confirmed booking (runs daily)
create or replace function public.score_upcoming_bookings(days_ahead int default 60)
returns int
language plpgsql
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.bookings
    where status = 'confirmed'
      and checkin_date between current_date and current_date + days_ahead
  loop
    perform public.score_booking(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 8. Score immediately when a booking is added or changed
create or replace function public.bookings_score_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.score_booking(new.id);
  return new;
end;
$$;

drop trigger if exists score_on_change on public.bookings;
create trigger score_on_change
  after insert or update on public.bookings
  for each row execute function public.bookings_score_trigger();

-- 9. Today's action list: upcoming Medium and High risk bookings that are not prepaid
drop view if exists public.todays_risk_list;
create view public.todays_risk_list
with (security_invoker = true)
as
select b.booking_ref, b.guest_name, b.checkin_date, b.checkout_date, s.days_to_arrival,
       s.probability as risk_today, s.probability_at_booking, s.tier, s.action, s.scored_at
from public.booking_scores s
join public.bookings b on b.id = s.booking_id
where s.score_date = current_date
  and s.tier in ('Medium','High')
  and b.status = 'confirmed'
  and coalesce(b.deposit_type, '') <> 'Non Refund'
  and b.checkin_date >= current_date
order by b.checkin_date, s.probability desc;

-- 10. Run it every day at 06:00 India time (00:30 UTC)
create extension if not exists pg_cron;
select cron.schedule(
  'staycertain-daily-score',
  '30 0 * * *',
  $cron$ select public.score_upcoming_bookings(120); $cron$
);

-- Check: select * from cron.job;          (the schedule)
-- Run now: select public.score_upcoming_bookings(120);
-- See results: select * from public.todays_risk_list;
