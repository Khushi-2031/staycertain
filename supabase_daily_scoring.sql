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
  model_version text   not null default 'lr-orange-3.39-v1',
  scored_at     timestamptz not null default now(),
  unique (booking_id, score_date)
);

-- Private tables: only your team (dashboard / service key) can read or write.
alter table public.bookings enable row level security;
alter table public.booking_scores enable row level security;

-- 3. Turn a booking into the 18 model inputs
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
  )
  select jsonb_build_object(
    'hotel',                          b.hotel,
    'lead_time',                      b.checkin_date - b.booking_date,
    'arrival_date_month',             trim(to_char(b.checkin_date, 'FMMonth')),
    'stays_in_weekend_nights',        (select count(*) from nights where extract(dow from night) in (0,6)),
    'stays_in_week_nights',           (select count(*) from nights where extract(dow from night) between 1 and 5),
    'adults',                         b.adults,
    'children',                       b.children,
    'meal',                           b.meal,
    'market_segment',                 b.market_segment,
    'is_repeated_guest',              coalesce(b.is_repeated_guest, case when (select prev_kept from hist) > 0 then 1 else 0 end)::text,
    'previous_cancellations',         coalesce(b.previous_cancellations, (select prev_cancel from hist)),
    'previous_bookings_not_canceled', coalesce(b.previous_bookings_not_canceled, (select prev_kept from hist)),
    'booking_changes',                b.booking_changes,
    'deposit_type',                   b.deposit_type,
    'customer_type',                  b.customer_type,
    'adr',                            coalesce(b.adr, round(b.adr_inr / 90.0, 2)),
    'required_car_parking_spaces',    b.required_car_parking_spaces,
    'total_of_special_requests',      b.total_of_special_requests
  );
$$;

-- 4. The trained model: probability of cancellation from the 18 inputs
create or replace function public.staycertain_predict(f jsonb)
returns numeric
language sql immutable
as $$
  select round((1 / (1 + exp(-(
      -2.5961237760571767
      + 0.4648380468560496 * ((f->>'lead_time')::double precision - 79.97095716382316) * 0.011619714205334695
      + 0.02703001530277176 * ((f->>'stays_in_weekend_nights')::double precision - 1.0045404512933407) * 0.9733979505400026
      + 0.11788492568204516 * ((f->>'stays_in_week_nights')::double precision - 2.623956613465419) * 0.4902326830310385
      + 0.039967058305593904 * ((f->>'adults')::double precision - 1.8793684645019262) * 1.6083997609594993
      + 0.034982977874669724 * ((f->>'children')::double precision - 0.1497431663914878) * 2.1179887863076092
      + 0.6845895652128645 * ((f->>'previous_cancellations')::double precision - 0.030407264722069345) * 2.707299366696738
      + -0.5106544715714185 * ((f->>'previous_bookings_not_canceled')::double precision - 0.18406026417171162) * 0.5769840142366042
      + -0.22633007305789643 * ((f->>'booking_changes')::double precision - 0.26847138139790866) * 1.4071845045727045
      + 0.31474153247001146 * ((f->>'adr')::double precision - 106.46395466427616) * 0.019276482081173954
      + -5.061058643896006 * ((f->>'required_car_parking_spaces')::double precision - 0.08431939093744267) * 3.550158117439964
      + -0.5550141144668478 * ((f->>'total_of_special_requests')::double precision - 0.6989313887360118) * 1.201828205056056
      + -0.02485392054666744 * ((case when f->>'hotel' = 'City Hotel' then 1 else 0 end) - 0.6107365620986975) * 2.0509318664148575
      + 0.024853920546651524 * ((case when f->>'hotel' = 'Resort Hotel' then 1 else 0 end) - 0.3892634379013025) * 2.0509318664148575
      + 0.02968278609872693 * ((case when f->>'arrival_date_month' = 'April' then 1 else 0 end) - 0.09057971014492754) * 3.4841931051024297
      + -0.05121851090669218 * ((case when f->>'arrival_date_month' = 'August' then 1 else 0 end) - 0.1288639699137773) * 2.9846352127759856
      + 0.06714125430605905 * ((case when f->>'arrival_date_month' = 'December' then 1 else 0 end) - 0.05861309851403412) * 4.257146386982245
      + 0.045358246846567876 * ((case when f->>'arrival_date_month' = 'February' then 1 else 0 end) - 0.06972344523940562) * 3.926490424945547
      + 0.034296146100543407 * ((case when f->>'arrival_date_month' = 'January' then 1 else 0 end) - 0.05370574206567602) * 4.4358467810092135
      + -0.05603900895400245 * ((case when f->>'arrival_date_month' = 'July' then 1 else 0 end) - 0.11515088974500091) * 3.1327933030224977
      + -0.029523077299697765 * ((case when f->>'arrival_date_month' = 'June' then 1 else 0 end) - 0.08891717116125482) * 3.5134052869066448
      + 0.01618480732896793 * ((case when f->>'arrival_date_month' = 'March' then 1 else 0 end) - 0.08583287470188956) * 3.5699355140045372
      + -0.006390392381412118 * ((case when f->>'arrival_date_month' = 'May' then 1 else 0 end) - 0.09567051917079435) * 3.399754757375845
      + 0.026245893880401862 * ((case when f->>'arrival_date_month' = 'November' then 1 else 0 end) - 0.05700788846083287) * 4.3129904100699346
      + -0.0040816728140792 * ((case when f->>'arrival_date_month' = 'October' then 1 else 0 end) - 0.0793317739864245) * 3.700196938612221
      + -0.02917258696262135 * ((case when f->>'arrival_date_month' = 'September' then 1 else 0 end) - 0.07660291689598239) * 3.759958896572516
      + -0.011219457476244513 * ((case when f->>'meal' = 'BB' then 1 else 0 end) - 0.7784810126582279) * 2.4080777727913762
      + 0.010571928141987362 * ((case when f->>'meal' = 'FB' then 1 else 0 end) - 0.004116217207851771) * 15.618759150772558
      + -0.036321880040150696 * ((case when f->>'meal' = 'HB' then 1 else 0 end) - 0.1040978719501009) * 3.2745286170334005
      + 0.04755875040154195 * ((case when f->>'meal' = 'SC' then 1 else 0 end) - 0.11330489818381949) * 3.1549211016667984
      + 0.0059314463866960414 * ((case when f->>'market_segment' = 'Aviation' then 1 else 0 end) - 0.0025912676573105853) * 19.67013224216766
      + 0.04093918384095628 * ((case when f->>'market_segment' = 'Complementary' then 1 else 0 end) - 0.00793432397725188) * 11.27132112319003
      + -0.006229335861761545 * ((case when f->>'market_segment' = 'Corporate' then 1 else 0 end) - 0.048156301596037426) * 4.670792967215573
      + -0.12879059918901808 * ((case when f->>'market_segment' = 'Direct' then 1 else 0 end) - 0.13505549440469639) * 2.9258344510771632
      + -0.06265452147556891 * ((case when f->>'market_segment' = 'Groups' then 1 else 0 end) - 0.05642313337002385) * 4.3339386310734485
      + -0.31121505686171885 * ((case when f->>'market_segment' = 'Offline TA/TO' then 1 else 0 end) - 0.15882406897816914) * 2.7358886778377967
      + 0.3450201766335222 * ((case when f->>'market_segment' = 'Online TA' then 1 else 0 end) - 0.5910154100165107) * 2.03398209389766
      + 0.07372617292767487 * ((case when f->>'is_repeated_guest' = '0' then 1 else 0 end) - 0.9614405613648872) * 5.193658961731053
      + -0.07372617292767353 * ((case when f->>'is_repeated_guest' = '1' then 1 else 0 end) - 0.038559438635112825) * 5.193658961731053
      + -0.2016399927897389 * ((case when f->>'deposit_type' = 'No Deposit' then 1 else 0 end) - 0.986883140708127) * 8.78925784329276
      + 0.22642590044230118 * ((case when f->>'deposit_type' = 'Non Refund' then 1 else 0 end) - 0.011890020179783526) * 9.225843033058352
      + -0.04573461799696361 * ((case when f->>'deposit_type' = 'Refundable' then 1 else 0 end) - 0.001226839112089525) * 28.567534581830294
      + -0.061748418313042265 * ((case when f->>'customer_type' = 'Contract' then 1 else 0 end) - 0.03594523940561365) * 5.371906660448484
      + -0.028697100543988326 * ((case when f->>'customer_type' = 'Group' then 1 else 0 end) - 0.006202990277013392) * 12.736514869606111
      + 0.139510840960675 * ((case when f->>'customer_type' = 'Transient' then 1 else 0 end) - 0.8238511282333517) * 2.6250386167932054
      + -0.11565544842075613 * ((case when f->>'customer_type' = 'Transient-Party' then 1 else 0 end) - 0.1340006420840213) * 2.935538464376003
  ))))::numeric, 3);
$$;

-- 5. Inputs outside the range the model was trained on
create or replace function public.staycertain_warnings(f jsonb)
returns text[]
language sql immutable
as $$
  select array_remove(array[
    case when (f->>'lead_time')::int > 737 then 'lead_time above training range (737)' end,
    case when (f->>'stays_in_weekend_nights')::int > 19 then 'weekend nights above training range (19)' end,
    case when (f->>'stays_in_week_nights')::int > 50 then 'week nights above training range (50)' end,
    case when (f->>'adults')::int > 55 then 'adults above training range (55)' end,
    case when (f->>'children')::int > 10 then 'children above training range (10)' end,
    case when (f->>'adults')::int + (f->>'children')::int = 0 then 'no guests on booking' end,
    case when (f->>'previous_cancellations')::int > 26 then 'previous cancellations above training range (26)' end,
    case when (f->>'previous_bookings_not_canceled')::int > 72 then 'previous kept bookings above training range (72)' end,
    case when (f->>'booking_changes')::int > 18 then 'booking changes above training range (18)' end,
    case when (f->>'adr')::numeric > 510 then 'room rate above training range (510 EUR)' end,
    case when (f->>'required_car_parking_spaces')::int > 8 then 'parking above training range (8)' end,
    case when (f->>'total_of_special_requests')::int > 5 then 'special requests above training range (5)' end
  ], null);
$$;

-- 6. Score one booking (today) and store it
create or replace function public.score_booking(p_booking_id bigint)
returns void
language plpgsql
as $$
declare
  b public.bookings;
  f jsonb;
  p numeric;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status <> 'confirmed' or b.checkin_date < current_date then
    return;
  end if;
  f := public.staycertain_features(b);
  p := public.staycertain_predict(f);
  insert into public.booking_scores (booking_id, score_date, probability, tier, action, features, warnings)
  values (
    b.id, current_date, p,
    case when p < 0.30 then 'Low' when p < 0.60 then 'Medium' else 'High' end,
    case when p < 0.30 then 'No action needed: keep the booking as normal.'
         when p < 0.60 then 'Send a reminder one week before arrival asking the guest to confirm.'
         else 'Ask for a deposit, or phone to confirm, before arrival.' end,
    f, public.staycertain_warnings(f)
  )
  on conflict (booking_id, score_date) do update
    set probability = excluded.probability, tier = excluded.tier, action = excluded.action,
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

-- 9. Today's action list: upcoming Medium and High risk bookings
create or replace view public.todays_risk_list
with (security_invoker = true)
as
select b.booking_ref, b.guest_name, b.hotel, b.checkin_date, b.checkout_date,
       s.probability, s.tier, s.action, s.warnings, s.scored_at
from public.booking_scores s
join public.bookings b on b.id = s.booking_id
where s.score_date = current_date
  and s.tier in ('Medium','High')
  and b.status = 'confirmed'
  and b.checkin_date >= current_date
order by b.checkin_date, s.probability desc;

-- 10. Run it every day at 06:00 India time (00:30 UTC)
create extension if not exists pg_cron;
select cron.schedule(
  'staycertain-daily-score',
  '30 0 * * *',
  $cron$ select public.score_upcoming_bookings(60); $cron$
);

-- Check: select * from cron.job;          (the schedule)
-- Run now: select public.score_upcoming_bookings(60);
-- See results: select * from public.todays_risk_list;
