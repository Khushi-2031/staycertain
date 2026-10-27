// Business logic on top of the model: deposits, reconfirmation rules, nightly forecast,
// safe overbooking, channel view and savings estimate.
// The probability always comes from predict(); everything here is arithmetic on it.
import { predict } from "./predict.js";
import { bookingToFeatures, toDay, isoDay } from "./features.js";
import { explain } from "./explain.js";

export const DAY = 86400000;

export const DEFAULT_SETTINGS = {
  hotelName: "Coastal Stay Resort (sample)",
  rooms: 20,
  upiId: "coastalstay@upi",
  inrPerEur: 90,
  depositPct: { Low: 0, Medium: 25, High: 50 },
  walkRisk: 5,            // max % chance of having to walk a guest when overbooking
  horizon: 30,            // days shown in forecast and action list
  // ASSUMPTIONS used only for the savings estimate and status rules (editable in Settings)
  depositPayRate: 50,     // % of asked guests who pay the deposit
  rebookRate: 25,         // % of flagged cancellations that can be resold when known early
  reminderSaveRate: 15,   // % of High-risk cancellations avoided by reconfirmation
  noReplyBump: 15,        // percentage points added when a guest ignores the reconfirmation
  confirmedFactor: 60,    // % of risk kept after the guest confirms
  depositPaidFactor: 50,  // % of risk kept after the deposit is paid
  subscription: 4999,     // ₹ per month, to compare with the savings
};

export function tierOf(p) { return p < 0.3 ? "Low" : p < 0.6 ? "Medium" : "High"; }

export const ACTIONS = {
  Low: "No action needed: keep the booking as normal.",
  Medium: "Send a WhatsApp reconfirmation 7 days before arrival and ask for the suggested deposit.",
  High: "Ask for the suggested deposit now; WhatsApp at 7 and 2 days before; AI voice call if no reply.",
};

// status: "" | "sent" | "confirmed" | "noreply" | "paid" | "cancelled"
export function adjust(p, status, s) {
  if (status === "noreply") return { p: Math.min(0.95, p + s.noReplyBump / 100), rule: `No reply to reconfirmation: +${s.noReplyBump} points (business rule)` };
  if (status === "confirmed") return { p: p * s.confirmedFactor / 100, rule: `Guest confirmed: risk x ${s.confirmedFactor / 100} (business rule)` };
  if (status === "paid") return { p: p * s.depositPaidFactor / 100, rule: `Deposit paid: risk x ${s.depositPaidFactor / 100} (business rule)` };
  return { p, rule: "" };
}

export function todayUTC() {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

export function scoreBookings(rows, settings, statuses = {}, today = todayUTC()) {
  const out = [], skipped = [];
  rows.forEach((b, i) => {
    const st = String(b.status ?? "confirmed").trim().toLowerCase() || "confirmed";
    if (st !== "confirmed") return;
    const ci = toDay(b.checkin_date), co = toDay(b.checkout_date);
    if (isNaN(ci) || ci < today) return;
    const ref = String(b.booking_ref || `Row ${i + 2}`);
    const { features: f, errors, warnings } = bookingToFeatures(b, { inrPerEur: settings.inrPerEur });
    if (errors.length) { skipped.push(`${ref}: ${errors.join(", ")}`); return; }
    const model = predict(f);
    const status = statuses[ref] || "";
    if (status === "cancelled") return;
    const adj = adjust(model.probability, status, settings);
    const p = Math.round(adj.p * 1000) / 1000;
    const tier = tierOf(p);
    const nights = Math.max(0, Math.round((co - ci) / DAY));
    const rateInr = b.adr_inr !== undefined && b.adr_inr !== "" ? Number(b.adr_inr) : Math.round(f.adr * settings.inrPerEur);
    const value = rateInr * nights;
    const depPct = settings.depositPct[tier];
    const deposit = Math.round((value * depPct) / 100 / 100) * 100;
    out.push({
      ref, guest: String(b.guest_name || ""), phone: String(b.guest_phone || "").replace(/\D/g, ""),
      checkin: ci, checkout: co, nights, rateInr, value, features: f, warnings,
      modelP: model.probability, p, tier, rule: adj.rule, status, depPct, deposit,
      atRisk: Math.round(p * value), explanation: explain(f, tier),
    });
  });
  out.sort((a, b) => a.checkin - b.checkin || b.p - a.p);
  return { bookings: out, skipped };
}

export function upiLink(s, bk) {
  const q = new URLSearchParams({ pa: s.upiId, pn: s.hotelName, am: String(bk.deposit), cu: "INR", tn: `Deposit ${bk.ref}` });
  return `upi://pay?${q.toString()}`;
}

// ---------- nightly forecast + safe overbooking ----------
// Distribution of how many booked guests actually arrive (each booking independent).
function showDistribution(probsShow) {
  let dist = [1];
  for (const q of probsShow) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) { next[k] += dist[k] * (1 - q); next[k + 1] += dist[k] * q; }
    dist = next;
  }
  return dist;
}

export function walkProbability(cancelProbs, extra, extraCancelP, rooms) {
  const show = cancelProbs.map((p) => 1 - p).concat(new Array(extra).fill(1 - extraCancelP));
  const dist = showDistribution(show);
  let pw = 0;
  for (let k = rooms + 1; k < dist.length; k++) pw += dist[k];
  return pw;
}

export function nightly(bookings, settings, today = todayUTC(), days = settings.horizon) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = today + i * DAY;
    const staying = bookings.filter((b) => b.checkin <= d && d < b.checkout);
    const n = staying.length;
    const probs = staying.map((b) => b.p);
    const expCancel = probs.reduce((a, b) => a + b, 0);
    const avgP = n ? expCancel / n : 0.275;
    const atRisk = staying.reduce((a, b) => a + b.p * b.rateInr, 0);
    const expOcc = n - expCancel;
    // Safe overbooking: how many bookings beyond the room count keep P(walk) <= target
    let extra = 0, pw = 0;
    if (n >= settings.rooms) {
      const base = n - settings.rooms;       // already over capacity
      for (let k = 0; k <= 10; k++) {
        const p = walkProbability(probs, k, avgP, settings.rooms);
        if (p <= settings.walkRisk / 100) { extra = base + k; pw = p; } else break;
      }
      extra = Math.max(0, extra - base);
      if (extra === 0) pw = walkProbability(probs, 0, avgP, settings.rooms);
    }
    const occPct = expOcc / settings.rooms;
    rows.push({
      date: d, booked: n, free: Math.max(0, settings.rooms - n), expCancel, expOcc, occPct, atRisk,
      extra, walkP: pw, signal: occPct < 0.6 ? "Push sales" : occPct > 0.9 ? "Hold rates" : "Steady",
    });
  }
  return rows;
}

// ---------- channels ----------
export function channels(bookings) {
  const m = {};
  for (const b of bookings) {
    const k = b.features.market_segment;
    m[k] ||= { channel: k, n: 0, expCancel: 0, value: 0, atRisk: 0 };
    m[k].n++; m[k].expCancel += b.p; m[k].value += b.value; m[k].atRisk += b.atRisk;
  }
  return Object.values(m).map((c) => ({ ...c, rate: c.expCancel / c.n })).sort((a, b) => b.rate - a.rate);
}

// ---------- savings estimate (next N days) ----------
export function savings(bookings, nights, settings) {
  const s = settings;
  const flagged = bookings.filter((b) => b.tier !== "Low");
  const high = bookings.filter((b) => b.tier === "High");
  const atRisk = bookings.reduce((a, b) => a + b.atRisk, 0);
  const depositsAsked = flagged.reduce((a, b) => a + b.deposit, 0);
  const depositsKept = flagged.reduce((a, b) => a + b.deposit * (s.depositPayRate / 100) * b.p, 0);
  const rebooked = flagged.reduce((a, b) => a + b.atRisk, 0) * (s.rebookRate / 100);
  const avoided = high.reduce((a, b) => a + b.atRisk, 0) * (s.reminderSaveRate / 100);
  const avgRate = bookings.length ? bookings.reduce((a, b) => a + b.rateInr, 0) / bookings.length : 0;
  const extraNights = nights.reduce((a, n) => a + n.extra, 0);
  const overbook = extraNights * avgRate * 0.9;
  const total = depositsKept + rebooked + avoided + overbook;
  return { atRisk, depositsAsked, depositsKept, rebooked, avoided, overbook, extraNights, total,
    roi: s.subscription ? total / s.subscription : 0, flagged: flagged.length, high: high.length };
}

export { isoDay };
