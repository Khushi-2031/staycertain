// Turns one raw booking (as stored by the hotel) into the 13 model inputs, and rejects impossible bookings.
// Same rules as staycertain_features() in supabase_daily_scoring.sql.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DAY = 86400000;

// Accepts "YYYY-MM-DD", a Date, or an Excel serial number. Returns a UTC timestamp at midnight, or NaN.
export function toDay(v) {
  if (v instanceof Date && !isNaN(v)) {
    const r = new Date(v.getTime() + 12 * 3600 * 1000);
    return Date.UTC(r.getFullYear(), r.getMonth(), r.getDate());
  }
  if (typeof v === "number" && isFinite(v)) return Date.UTC(1899, 11, 30) + Math.round(v) * DAY;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(v);
    if (!isNaN(d)) return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return NaN;
}
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

export const ALLOWED = {
  meal: ["BB", "HB", "FB", "SC"],
  market_segment: ["Online TA", "Offline TA/TO", "Direct", "Groups", "Corporate", "Complementary", "Aviation"],
  customer_type: ["Transient", "Transient-Party", "Contract", "Group"],
};

// Business limits for a believable booking (the model was trained within these).
export const LIMITS = {
  adults: [1, 10], children: [0, 6], nights: [1, 30], lead_time: [0, 737],
  previous_cancellations: [0, 26], previous_bookings_not_canceled: [0, 72],
  rate_inr: [500, 45000],   // = about 5-500 EUR at the assumed Rs 90 per EUR
};

function int(v, dflt) {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

// Shared validation of the model inputs (used by both pages). Returns a list of plain-English problems.
export function checkInputs(f, nights) {
  const e = [];
  const range = (k, label, [lo, hi], v = f[k]) => {
    if (isNaN(v)) e.push(`${label} must be a whole number.`);
    else if (v < lo || v > hi) e.push(`${label} must be between ${lo} and ${hi}.`);
  };
  range("adults", "Adults", LIMITS.adults);
  range("children", "Children", LIMITS.children);
  range("nights", "Number of nights", LIMITS.nights, nights);
  range("lead_time", "Days between booking and arrival", LIMITS.lead_time);
  range("previous_cancellations", "Previous cancellations", LIMITS.previous_cancellations);
  range("previous_bookings_not_canceled", "Previous stays", LIMITS.previous_bookings_not_canceled);
  if (isNaN(f.rate_inr)) e.push("Room rate must be a number in rupees.");
  else if (f.rate_inr < LIMITS.rate_inr[0] || f.rate_inr > LIMITS.rate_inr[1]) e.push(`Room rate must be between ₹${LIMITS.rate_inr[0]} and ₹${LIMITS.rate_inr[1].toLocaleString("en-IN")} per night.`);
  for (const [col, allowed] of Object.entries(ALLOWED)) if (!allowed.includes(f[col])) e.push(`${col.replace(/_/g, " ")} "${f[col]}" is not one of the allowed values.`);
  return e;
}

// opts.inrPerEur converts the rupee rate to EUR for the model (trained on EUR rates). ASSUMPTION: 90.
export function bookingToFeatures(b, opts = {}) {
  const inrPerEur = opts.inrPerEur || 90;
  const errors = [];
  const bd = toDay(b.booking_date), ci = toDay(b.checkin_date), co = toDay(b.checkout_date);
  if (isNaN(bd)) errors.push("booking date missing or not a date");
  if (isNaN(ci)) errors.push("check-in date missing or not a date");
  if (isNaN(co)) errors.push("check-out date missing or not a date");
  if (!errors.length && co <= ci) errors.push("check-out must be after check-in");
  if (!errors.length && ci < bd) errors.push("check-in is before the booking date");

  let weekend = 0, week = 0;
  if (!errors.length) {
    for (let t = ci; t < co; t += DAY) {
      const dow = new Date(t).getUTCDay();        // 0 = Sunday, 6 = Saturday
      if (dow === 0 || dow === 6) weekend++; else week++;
    }
  }
  const rateInr = b.adr_inr !== undefined && b.adr_inr !== "" && b.adr_inr !== null ? Number(b.adr_inr)
    : b.adr !== undefined && b.adr !== "" && b.adr !== null ? Number(b.adr) * inrPerEur : NaN;
  const prevKept = int(b.previous_bookings_not_canceled, 0);
  const f = {
    lead_time: Math.round((ci - bd) / DAY),
    arrival_date_month: isNaN(ci) ? "" : MONTHS[new Date(ci).getUTCMonth()],
    stays_in_weekend_nights: weekend,
    stays_in_week_nights: week,
    adults: int(b.adults, NaN),
    children: int(b.children, 0),
    meal: String(b.meal ?? "").trim() || "BB",
    market_segment: String(b.market_segment ?? "").trim(),
    // A repeat guest is one with at least one earlier completed stay (keeps the two inputs consistent).
    is_repeated_guest: prevKept > 0 ? "1" : "0",
    previous_cancellations: int(b.previous_cancellations, 0),
    previous_bookings_not_canceled: prevKept,
    customer_type: String(b.customer_type ?? "").trim() || "Transient",
    adr: Math.round((rateInr / inrPerEur) * 100) / 100,
    rate_inr: rateInr,
  };
  if (!errors.length) errors.push(...checkInputs(f, weekend + week));
  return { features: f, errors, warnings: [] };
}
