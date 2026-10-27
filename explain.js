// Explains a score using the model itself.
// Each input's contribution = weight x (value - average booking) / spread, exactly the terms predict() adds up.
// Positive contributions raise the risk, negative ones lower it. Patterns come from the training data.
import { MODEL } from "./predict.js";
import { PATTERNS, REFERENCE } from "./patterns.js";

const pct = (r) => `${Math.round(r * 100)}%`;
const SEG = {
  "Online TA": "an online travel agent (OTA)", "Offline TA/TO": "an offline travel agent / tour operator",
  Direct: "a direct booking", Groups: "a group booking", Corporate: "a corporate booking",
  Complementary: "a complimentary booking", Aviation: "an airline crew booking",
};
const DEP = { "No Deposit": "No deposit taken", "Non Refund": "Non-refundable rate", Refundable: "Refundable deposit taken" };
const CUST = {
  Transient: "Individual booking, not linked to others", "Transient-Party": "Linked to another booking",
  Contract: "Agency/company contract", Group: "Part of a group",
};
const MEAL = { BB: "bed & breakfast", HB: "half board", FB: "full board", SC: "room only" };

function binRate(bins, v) {
  const b = bins.find(([lo, hi]) => v >= lo && v <= hi);
  return b ? { rate: b[2], label: b[1] >= 69 ? `${b[0]}+` : `${b[0]}–${b[1]}` } : null;
}
const key01 = (v) => (Number(v) >= 1 ? "1+" : "0");
const key012 = (v) => (Number(v) >= 2 ? "2+" : String(v));

// One entry per input (categorical inputs are grouped). Returns text, short tag and data pattern.
function describe(name, f) {
  const P = PATTERNS;
  switch (name) {
    case "lead_time": {
      const b = binRate(P.lead_time, f.lead_time);
      return { short: `booked ${f.lead_time} days ahead`, text: `Booked ${f.lead_time} days before arrival (typical: ${REFERENCE.lead_time})`,
        pattern: b && `${pct(b.rate)} of bookings made ${b.label} days ahead were cancelled` };
    }
    case "market_segment": {
      const r = P.market_segment[f.market_segment];
      return { short: f.market_segment === "Online TA" ? "via OTA" : `via ${f.market_segment.toLowerCase()}`, text: `Came through ${SEG[f.market_segment] || f.market_segment}`,
        pattern: r && `${pct(r[0])} of ${f.market_segment} bookings were cancelled (all bookings: ${pct(P.overall)})` };
    }
    case "deposit_type": {
      const r = P.deposit_type[f.deposit_type];
      return { short: f.deposit_type === "No Deposit" ? "no deposit" : f.deposit_type.toLowerCase(), text: DEP[f.deposit_type],
        pattern: r && `${pct(r[0])} of “${f.deposit_type}” bookings were cancelled` };
    }
    case "customer_type": {
      const r = P.customer_type[f.customer_type];
      return { short: f.customer_type === "Transient" ? "individual booking" : f.customer_type.toLowerCase(), text: CUST[f.customer_type],
        pattern: r && `${pct(r[0])} of ${f.customer_type} bookings were cancelled` };
    }
    case "total_of_special_requests": {
      const r = P.total_of_special_requests[key012(f.total_of_special_requests)];
      return { short: f.total_of_special_requests ? `${f.total_of_special_requests} special request(s)` : "no special requests",
        text: f.total_of_special_requests ? `Made ${f.total_of_special_requests} special request(s), a sign of commitment` : "No special requests made",
        pattern: r && `${pct(r[0])} of bookings with ${f.total_of_special_requests === 0 ? "no" : key012(f.total_of_special_requests)} special request${f.total_of_special_requests === 1 ? "" : "s"} were cancelled` };
    }
    case "is_repeated_guest": {
      const r = P.is_repeated_guest[f.is_repeated_guest];
      return { short: f.is_repeated_guest === "1" ? "returning guest" : "first-time guest", text: f.is_repeated_guest === "1" ? "Returning guest" : "First-time guest",
        pattern: r && `${pct(r[0])} of ${f.is_repeated_guest === "1" ? "returning" : "first-time"} guests cancelled` };
    }
    case "previous_cancellations": {
      const r = P.previous_cancellations[key01(f.previous_cancellations)];
      return { short: f.previous_cancellations ? `cancelled ${f.previous_cancellations}x before` : "no past cancellations",
        text: f.previous_cancellations ? `Has cancelled ${f.previous_cancellations} booking(s) before` : "Never cancelled before",
        pattern: r && (f.previous_cancellations ? `${pct(r[0])} of guests who had cancelled before cancelled again` : `${pct(r[0])} of guests with no past cancellations cancelled`) };
    }
    case "previous_bookings_not_canceled": {
      const r = P.previous_bookings_not_canceled[key01(f.previous_bookings_not_canceled)];
      return { short: f.previous_bookings_not_canceled ? "has stayed before" : "no past stays",
        text: f.previous_bookings_not_canceled ? `Has completed ${f.previous_bookings_not_canceled} earlier stay(s)` : "No completed stays with us",
        pattern: r && `${pct(r[0])} of guests with ${f.previous_bookings_not_canceled ? "earlier stays" : "no earlier stays"} cancelled` };
    }
    case "booking_changes": {
      const r = P.booking_changes[key01(f.booking_changes)];
      return { short: f.booking_changes ? "booking was updated" : "never updated",
        text: f.booking_changes ? `Booking changed ${f.booking_changes} time(s) — the guest is actively planning` : "Booking never changed",
        pattern: r && `${pct(r[0])} of bookings ${f.booking_changes ? "that were changed" : "never changed"} were cancelled` };
    }
    case "required_car_parking_spaces": {
      const r = P.required_car_parking_spaces[key01(f.required_car_parking_spaces)];
      return { short: "requested parking", text: `Requested ${f.required_car_parking_spaces} parking space(s)`,
        pattern: r && `${pct(r[0])} of bookings with parking were cancelled (check: may be a quirk of the training data)` };
    }
    case "nights": {
      const n = f.stays_in_weekend_nights + f.stays_in_week_nights;
      const b = binRate(PATTERNS.nights, n);
      return { short: `${n}-night stay`, text: `${n}-night stay (${f.stays_in_weekend_nights} weekend, ${f.stays_in_week_nights} weekday)`,
        pattern: b && `${pct(b.rate)} of stays of ${b.label} nights were cancelled` };
    }
    case "adr":
      return { short: f.adr >= REFERENCE.adr ? "higher room rate" : "lower room rate", text: `Room rate ${f.adr >= REFERENCE.adr ? "above" : "below"} a typical booking`, pattern: "In the data, pricier stays were cancelled a little more often" };
    case "arrival_date_month": {
      const r = P.arrival_date_month[f.arrival_date_month];
      return { short: `${f.arrival_date_month} arrival`, text: `Arriving in ${f.arrival_date_month}`, pattern: r && `${pct(r[0])} of ${f.arrival_date_month} arrivals were cancelled` };
    }
    case "meal": {
      const r = P.meal[f.meal];
      return { short: MEAL[f.meal], text: `Meal plan: ${MEAL[f.meal]}`, pattern: r && `${pct(r[0])} of ${MEAL[f.meal]} bookings were cancelled` };
    }
    case "guests": {
      const r = P.children[key01(f.children)];
      return { short: f.children ? "travelling with children" : `${f.adults} adult${f.adults === 1 ? "" : "s"}`, text: `${f.adults} adult(s)${f.children ? `, ${f.children} child(ren)` : ""}`,
        pattern: r && `${pct(r[0])} of bookings with ${f.children ? "children" : "no children"} were cancelled` };
    }
    case "hotel":
      return { short: f.hotel, text: f.hotel, pattern: null };
    default:
      return { short: name, text: name, pattern: null };
  }
}

const GROUP = {
  stays_in_weekend_nights: "nights", stays_in_week_nights: "nights", adults: "guests", children: "guests",
};

export function contributions(f) {
  const sums = {};
  const add = (k, v) => { sums[k] = (sums[k] || 0) + v; };
  for (const [col, p] of Object.entries(MODEL.numeric)) {
    add(GROUP[col] || col, p.coef * (Number(f[col]) - p.offset) * p.factor);
  }
  for (const [col, cats] of Object.entries(MODEL.categorical)) {
    for (const [cat, p] of Object.entries(cats)) add(col, p.coef * ((String(f[col]) === cat ? 1 : 0) - p.offset) * p.factor);
  }
  // Parking: almost every booking has 0, so "no parking" is not a reason. Only show it when parking was requested.
  if (!Number(f.required_car_parking_spaces)) delete sums.required_car_parking_spaces;
  return sums;
}

export function explain(f, tier) {
  const c = contributions(f);
  const items = Object.entries(c)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => ({ key: k, impact: v, ...describe(k, f) }));
  const raises = items.filter((i) => i.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 4);
  const lowers = items.filter((i) => i.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3);
  const lead = tier === "Low" ? lowers : raises;
  const headline = `${tier} risk: ${(lead.length ? lead : raises).slice(0, 4).map((i) => i.short).join(", ")}.`;
  return { headline, raises, lowers };
}
