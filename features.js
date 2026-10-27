// Turns one raw booking (as stored by the hotel) into the 18 model inputs.
// Same rules as staycertain_features() in supabase_daily_scoring.sql.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DAY = 86400000;

// Accepts "YYYY-MM-DD", a Date, or an Excel serial number. Returns a UTC timestamp at midnight, or NaN.
export function toDay(v) {
  if (v instanceof Date && !isNaN(v)) {
    // Spreadsheet readers can return midnight shifted by a few hours; round to the nearest day.
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

const ALLOWED = {
  hotel: ["City Hotel", "Resort Hotel"],
  meal: ["BB", "HB", "FB", "SC"],
  market_segment: ["Online TA", "Offline TA/TO", "Direct", "Groups", "Corporate", "Complementary", "Aviation"],
  customer_type: ["Transient", "Transient-Party", "Contract", "Group"],
  deposit_type: ["No Deposit", "Non Refund", "Refundable"],
};

const RANGES = {
  lead_time: 737, stays_in_weekend_nights: 19, stays_in_week_nights: 50, adults: 55, children: 10,
  previous_cancellations: 26, previous_bookings_not_canceled: 72, booking_changes: 18, adr: 510,
  required_car_parking_spaces: 8, total_of_special_requests: 5,
};

function int(v, dflt) {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

// Returns { features, errors[], warnings[] }. If errors is non-empty the booking cannot be scored.
// opts.inrPerEur: used when the file has adr_inr (rupees) instead of adr (EUR). The model was trained on EUR rates.
export function bookingToFeatures(b, opts = {}) {
  const inrPerEur = opts.inrPerEur || 90;
  const errors = [];
  const warnings = [];
  const bd = toDay(b.booking_date), ci = toDay(b.checkin_date), co = toDay(b.checkout_date);
  if (isNaN(bd)) errors.push("booking_date missing or not a date");
  if (isNaN(ci)) errors.push("checkin_date missing or not a date");
  if (isNaN(co)) errors.push("checkout_date missing or not a date");
  if (!errors.length && co < ci) errors.push("checkout before checkin");
  if (!errors.length && ci < bd) errors.push("checkin before booking date");

  for (const [col, allowed] of Object.entries(ALLOWED)) {
    const v = b[col] === undefined || b[col] === null ? "" : String(b[col]).trim();
    if (!allowed.includes(v)) errors.push(`${col} "${v}" not in list`);
  }

  let weekend = 0, week = 0;
  if (!errors.length) {
    for (let t = ci; t < co; t += DAY) {
      const dow = new Date(t).getUTCDay();          // 0 = Sunday, 6 = Saturday
      if (dow === 0 || dow === 6) weekend++; else week++;
    }
  }

  const f = {
    hotel: String(b.hotel ?? "").trim(),
    lead_time: Math.round((ci - bd) / DAY),
    arrival_date_month: isNaN(ci) ? "" : MONTHS[new Date(ci).getUTCMonth()],
    stays_in_weekend_nights: weekend,
    stays_in_week_nights: week,
    adults: int(b.adults, NaN),
    children: int(b.children, 0),
    meal: String(b.meal ?? "").trim(),
    market_segment: String(b.market_segment ?? "").trim(),
    is_repeated_guest: String(int(b.is_repeated_guest, 0)),
    previous_cancellations: int(b.previous_cancellations, 0),
    previous_bookings_not_canceled: int(b.previous_bookings_not_canceled, 0),
    booking_changes: int(b.booking_changes, 0),
    deposit_type: String(b.deposit_type ?? "").trim(),
    customer_type: String(b.customer_type ?? "").trim(),
    adr: (b.adr !== "" && b.adr !== undefined && b.adr !== null) ? Number(b.adr)
      : (b.adr_inr !== "" && b.adr_inr !== undefined && b.adr_inr !== null) ? Math.round(Number(b.adr_inr) / inrPerEur * 100) / 100
      : NaN,
    required_car_parking_spaces: int(b.required_car_parking_spaces, 0),
    total_of_special_requests: int(b.total_of_special_requests, 0),
  };

  for (const k of ["adults", "children", "previous_cancellations", "previous_bookings_not_canceled",
    "booking_changes", "required_car_parking_spaces", "total_of_special_requests"]) {
    if (isNaN(f[k])) errors.push(`${k} must be a whole number`);
  }
  if (!["0", "1"].includes(f.is_repeated_guest)) errors.push("is_repeated_guest must be 0 or 1");
  if (isNaN(f.adr) || f.adr < 0) errors.push("adr (room rate) must be a number");
  if (!errors.length && f.adults + f.children === 0) errors.push("no guests on booking");

  if (!errors.length) {
    for (const [k, max] of Object.entries(RANGES)) {
      if (f[k] > max) warnings.push(`${k} above training range (${max})`);
    }
  }
  return { features: f, errors, warnings };
}
