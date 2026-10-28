// Business logic on top of the model. The model's probabilities are never changed by business rules:
// - modelP: the model's probability at booking (matches Orange)
// - p: risk today = modelP updated for the days left before arrival (timing.js, from past cancellation dates)
// Status (replied, paid, no reply) only changes the next step and the money protected, never the probability.
import { predict, tierOf, ACTIONS } from "./predict.js";
import { bookingToFeatures, toDay, isoDay } from "./features.js";
import { riskToday } from "./timing.js";
import { explain } from "./explain.js";

export const DAY = 86400000;
export { ACTIONS, tierOf, isoDay };

export const DEFAULT_SETTINGS = {
  hotelName: "Coastal Stay Resort (sample)",
  rooms: 20,
  upiId: "coastalstay@upi",
  inrPerEur: 90,          // ASSUMPTION: converts rupee rates to the EUR scale the model was trained on
  advancePct: 50,         // advance asked from High-risk guests (% of stay value)
  walkRisk: 5,            // max % chance of having to move a guest when overbooking
  horizon: 90,            // days in the forecast and action list
  // ASSUMPTIONS for the savings estimate (editable)
  advancePayRate: 50,     // % of asked guests who pay the advance
  resaleRate: 25,         // % of flagged cancellations whose room is resold because staff knew early
  subscription: 4999,     // Rs per month
};

export function todayUTC() {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

// What the booking already guarantees the hotel (kept even if the guest cancels).
function heldAmount(b, value, status, suggestedAdvance) {
  const dep = String(b.deposit_type || "").trim();
  if (dep === "Non Refund") return { held: value, why: "Non-refundable booking: the hotel keeps the full amount" };
  const paid = Number(b.advance_paid_inr || 0);
  if (paid > 0) return { held: Math.min(value, paid), why: `Advance of ₹${Math.round(paid).toLocaleString("en-IN")} already paid` };
  if (status === "paid" && suggestedAdvance > 0) return { held: suggestedAdvance, why: "Advance paid (recorded in the app)" };
  return { held: 0, why: "" };
}

export const NEXT_STEP = {
  "": null,
  sent: "Waiting for the guest's reply to the WhatsApp reconfirmation.",
  confirmed: "Guest confirmed — no further action.",
  noreply: "No reply to WhatsApp — call the guest (AI voice call or front desk).",
  paid: "Advance received — no further action.",
};

export function scoreBookings(rows, settings, statuses = {}, today = todayUTC()) {
  const out = [], skipped = [];
  rows.forEach((b, i) => {
    const st = String(b.status ?? "confirmed").trim().toLowerCase() || "confirmed";
    if (st !== "confirmed") return;
    const ci = toDay(b.checkin_date), co = toDay(b.checkout_date);
    if (isNaN(ci) || ci < today) return;
    const ref = String(b.booking_ref || `Row ${i + 2}`);
    const status = statuses[ref] || "";
    if (status === "cancelled") return;
    const { features: f, errors } = bookingToFeatures(b, { inrPerEur: settings.inrPerEur });
    if (errors.length) { skipped.push(`${ref}: ${errors.join("; ")}`); return; }
    const model = predict(f);
    const daysLeft = Math.round((ci - today) / DAY);
    const p = riskToday(model.probability, f.lead_time, daysLeft);
    const tier = tierOf(p);
    const nights = Math.round((co - ci) / DAY);
    const value = f.rate_inr * nights;
    const nonRefund = String(b.deposit_type || "").trim() === "Non Refund";
    const alreadyPaid = Number(b.advance_paid_inr || 0) > 0;
    const advance = tier === "High" && !nonRefund && !alreadyPaid ? Math.round((value * settings.advancePct) / 100 / 100) * 100 : 0;
    const h = heldAmount(b, value, status, advance);
    const exposed = Math.max(0, value - h.held);
    const group = f.market_segment === "Groups" || f.customer_type === "Group"
      ? `${isoDay(toDay(b.booking_date))}|${isoDay(ci)}|${f.market_segment}|${f.customer_type}` : null;
    out.push({
      ref, guest: String(b.guest_name || ""), phone: String(b.guest_phone || "").replace(/\D/g, ""),
      checkin: ci, checkout: co, nights, daysLeft, rateInr: f.rate_inr, value, features: f,
      modelP: model.probability, p, tier, status, advance, held: h.held, heldWhy: h.why,
      atRisk: Math.round(p * exposed), protectedNow: h.held, group,
      action: h.held >= value ? "Fully prepaid — no action needed."
        : tier === "High" && h.held > 0 ? "Advance already received — send a WhatsApp reconfirmation 7 days before arrival."
        : ACTIONS[tier],
      nextStep: NEXT_STEP[status] || null,
      explanation: explain(f, tier),
    });
  });
  out.sort((a, b) => a.checkin - b.checkin || b.p - a.p);
  return { bookings: out, skipped };
}

export function upiLink(s, bk) {
  const q = new URLSearchParams({ pa: s.upiId, pn: s.hotelName, am: String(bk.advance), cu: "INR", tn: `Advance ${bk.ref}` });
  return `upi://pay?${q.toString()}`;
}

// ---------- safe overbooking ----------
// Units: a single booking (1 room) or a group booking (several rooms that cancel together).
function arrivalsDistribution(units) {
  let dist = [1];
  for (const u of units) {
    const next = new Array(dist.length + u.rooms).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * u.p;               // whole unit cancels
      next[k + u.rooms] += dist[k] * (1 - u.p); // whole unit arrives
    }
    dist = next;
  }
  return dist;
}
export function walkProbability(units, rooms) {
  const dist = arrivalsDistribution(units);
  let pw = 0;
  for (let k = rooms + 1; k < dist.length; k++) pw += dist[k];
  return pw;
}
function unitsFor(staying) {
  const m = new Map();
  for (const b of staying) {
    const key = b.group || b.ref;
    const u = m.get(key) || { rooms: 0, pSum: 0 };
    u.rooms += 1; u.pSum += b.p; m.set(key, u);
  }
  return [...m.values()].map((u) => ({ rooms: u.rooms, p: u.pSum / u.rooms }));
}

export function nightly(bookings, settings, today = todayUTC(), days = settings.horizon) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = today + i * DAY;
    const staying = bookings.filter((b) => b.checkin <= d && d < b.checkout);
    const n = staying.length;
    const expCancel = staying.reduce((a, b) => a + b.p, 0);
    const avgP = n ? expCancel / n : 0.2;
    const atRisk = staying.reduce((a, b) => a + b.p * b.rateInr * (b.held >= b.value ? 0 : 1), 0);
    const expOcc = n - expCancel;
    let extra = 0, walkP = 0;
    if (n >= settings.rooms) {
      const units = unitsFor(staying);
      walkP = walkProbability(units, settings.rooms);
      for (let k = 1; k <= 10; k++) {
        const pw = walkProbability(units.concat(Array.from({ length: k }, () => ({ rooms: 1, p: avgP }))), settings.rooms);
        if (pw <= settings.walkRisk / 100) { extra = k; walkP = pw; } else break;
      }
    }
    const occPct = expOcc / settings.rooms;
    rows.push({ date: d, booked: n, expCancel, expOcc, occPct, atRisk, extra, walkP,
      signal: occPct < 0.6 ? "Push sales" : occPct > 0.9 ? "Hold rates" : "Steady" });
  }
  return rows;
}

// ---------- channels ----------
export function channels(bookings) {
  const m = {};
  for (const b of bookings) {
    const k = b.features.market_segment;
    m[k] ||= { channel: k, n: 0, expCancel: 0, atRisk: 0 };
    m[k].n++; m[k].expCancel += b.p; m[k].atRisk += b.atRisk;
  }
  return Object.values(m).map((c) => ({ ...c, rate: c.expCancel / c.n })).sort((a, b) => b.rate - a.rate);
}

// ---------- savings: a cautious range, each booking counted once ----------
export function savings(bookings, nights, s) {
  const collected = bookings.filter((b) => b.status === "paid").reduce((a, b) => a + b.held, 0);
  const atRisk = bookings.reduce((a, b) => a + b.atRisk, 0);
  let low = 0, high = 0;
  for (const b of bookings) {
    if (b.tier === "Low") continue;
    // Expected money kept from the advance if the guest cancels (only for High, not yet paid)
    const kept = b.status === "paid" ? 0 : b.advance * (s.advancePayRate / 100) * b.p;
    // Remaining expected loss after the advance; part of it is resold because staff knew early
    const remaining = Math.max(0, b.atRisk - kept);
    low += kept;
    high += kept + remaining * (s.resaleRate / 100);
  }
  const avgRate = bookings.length ? bookings.reduce((a, b) => a + b.rateInr, 0) / bookings.length : 0;
  const extraNights = nights.reduce((a, n) => a + n.extra, 0);
  return { atRisk, collected, low, high, extraNights, overbookRevenue: extraNights * avgRate,
    breakEvenNights: avgRate ? Math.ceil(s.subscription / avgRate) : 0, avgRate };
}
