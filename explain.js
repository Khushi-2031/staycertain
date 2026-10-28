// Explains a score using the model itself.
// Each input's contribution = weight x (value - average booking) / spread: exactly the terms predict() adds up.
// Positive contributions raise the risk, negative ones lower it. Patterns come from the training data.
import { MODEL } from "./predict.js";
import { PATTERNS, REFERENCE } from "./patterns.js";

const pct = (r) => `${Math.round(r * 100)}%`;
const SEG = {
  "Online TA": "an online travel agent", "Offline TA/TO": "an offline travel agent or tour operator",
  Direct: "a direct booking", Groups: "a group booking", Corporate: "a corporate booking",
  Complementary: "a complimentary booking", Aviation: "an airline crew booking",
};
const SEG_SHORT = { "Online TA": "via online travel agent", "Offline TA/TO": "via offline agent", Direct: "direct booking", Groups: "group booking", Corporate: "corporate booking", Complementary: "complimentary", Aviation: "airline crew" };
const CUST = { Transient: "Single booking, not linked to others", "Transient-Party": "Linked to another booking", Contract: "Agency or company contract", Group: "Part of a group" };
const MEAL = { BB: "bed & breakfast", HB: "half board", FB: "full board", SC: "room only" };

function bin(bins, v) {
  const b = bins.find(([lo, hi]) => v >= lo && v <= hi);
  return b ? { rate: b[2], label: b[1] >= 69 ? `${b[0]}+` : `${b[0]}–${b[1]}` } : null;
}

function describe(key, f) {
  const P = PATTERNS;
  switch (key) {
    case "lead_time": {
      const b = bin(P.lead_time, f.lead_time);
      return { short: `booked ${f.lead_time} days ahead`, text: `Booked ${f.lead_time} days before arrival (typical: ${REFERENCE.lead_time})`,
        pattern: b && `${pct(b.rate)} of bookings made ${b.label} days ahead were cancelled` };
    }
    case "market_segment": {
      const r = P.market_segment[f.market_segment];
      return { short: SEG_SHORT[f.market_segment] || f.market_segment, text: `Came through ${SEG[f.market_segment] || f.market_segment}`,
        pattern: r && `${pct(r[0])} of these bookings were cancelled (all bookings: ${pct(P.overall)})` };
    }
    case "customer_type": {
      const r = P.customer_type[f.customer_type];
      return { short: f.customer_type === "Transient" ? "single booking" : CUST[f.customer_type].toLowerCase(), text: CUST[f.customer_type],
        pattern: r && `${pct(r[0])} of these bookings were cancelled` };
    }
    case "guest_history": {
      if (f.previous_cancellations > 0) {
        const r = P.previous_cancellations["1+"];
        return { short: `cancelled ${f.previous_cancellations}× before`, text: `This guest has cancelled ${f.previous_cancellations} booking(s) before`,
          pattern: r && `${pct(r[0])} of guests who had cancelled before cancelled again` };
      }
      if (f.previous_bookings_not_canceled > 0) {
        const r = P.previous_bookings_not_canceled["1+"];
        return { short: "returning guest", text: `Returning guest with ${f.previous_bookings_not_canceled} completed stay(s)`,
          pattern: r && `${pct(r[0])} of returning guests cancelled` };
      }
      const r = P.is_repeated_guest["0"];
      return { short: "first-time guest", text: "First-time guest", pattern: r && `${pct(r[0])} of first-time guests cancelled` };
    }
    case "nights": {
      const n = f.stays_in_weekend_nights + f.stays_in_week_nights;
      const b = bin(P.nights, n);
      return { short: `${n}-night stay`, text: `${n}-night stay (${f.stays_in_weekend_nights} weekend, ${f.stays_in_week_nights} weekday)`,
        pattern: b && `${pct(b.rate)} of stays of ${b.label} nights were cancelled` };
    }
    case "adr":
      return { short: f.adr >= REFERENCE.adr ? "higher room rate" : "lower room rate", text: `Room rate ${f.adr >= REFERENCE.adr ? "above" : "below"} a typical booking`,
        pattern: "Pricier stays were cancelled a little more often" };
    case "arrival_date_month": {
      const r = P.arrival_date_month[f.arrival_date_month];
      return { short: `${f.arrival_date_month} arrival`, text: `Arriving in ${f.arrival_date_month}`, pattern: r && `${pct(r[0])} of ${f.arrival_date_month} arrivals were cancelled` };
    }
    case "meal": {
      const r = P.meal[f.meal];
      return { short: MEAL[f.meal], text: `Meal plan: ${MEAL[f.meal]}`, pattern: r && `${pct(r[0])} of ${MEAL[f.meal]} bookings were cancelled` };
    }
    case "guests": {
      const r = P.children[f.children ? "1+" : "0"];
      return { short: f.children ? "travelling with children" : `${f.adults} adult${f.adults === 1 ? "" : "s"}`,
        text: `${f.adults} adult(s)${f.children ? `, ${f.children} child(ren)` : ""}`,
        pattern: r && `${pct(r[0])} of bookings ${f.children ? "with" : "without"} children were cancelled` };
    }
    default:
      return { short: key, text: key, pattern: null };
  }
}

const GROUP = {
  stays_in_weekend_nights: "nights", stays_in_week_nights: "nights", adults: "guests", children: "guests",
  is_repeated_guest: "guest_history", previous_cancellations: "guest_history", previous_bookings_not_canceled: "guest_history",
};

export function contributions(f) {
  const sums = {};
  const add = (k, v) => { sums[k] = (sums[k] || 0) + v; };
  for (const [col, p] of Object.entries(MODEL.numeric)) add(GROUP[col] || col, p.coef * (Number(f[col]) - p.offset) * p.factor);
  for (const [col, cats] of Object.entries(MODEL.categorical)) {
    for (const [cat, p] of Object.entries(cats)) add(GROUP[col] || col, p.coef * ((String(f[col]) === cat ? 1 : 0) - p.offset) * p.factor);
  }
  return sums;
}

export function explain(f, tier) {
  const items = Object.entries(contributions(f))
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => ({ key: k, impact: v, ...describe(k, f) }));
  const raises = items.filter((i) => i.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 4);
  const lowers = items.filter((i) => i.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3);
  const lead = tier === "Low" && lowers.length ? lowers : raises.length ? raises : lowers;
  return { headline: `${tier} risk: ${lead.slice(0, 3).map((i) => i.short).join(", ")}.`, raises, lowers };
}
