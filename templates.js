// Message and voice-call texts. In the prototype they are shown and copied;
// sending is done later through WhatsApp Business and a voice-call service (e.g. smallest.ai).
import { isoDay } from "./features.js";

const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const first = (name) => (name || "Guest").split(" ")[0];

export function whatsappMessages(bk, s) {
  const adv = bk.advance > 0
    ? `\n\nTo hold your room, please pay an advance of ${inr(bk.advance)} by UPI to ${s.upiId} with the note "${bk.ref}". The rest is paid at check-in.`
    : "";
  return [
    { when: "7 days before arrival",
      text: `Hi ${first(bk.guest)}, this is ${s.hotelName}. We're looking forward to hosting you from ${fmtDate(bk.checkin)} to ${fmtDate(bk.checkout)} (${bk.nights} night${bk.nights === 1 ? "" : "s"}).\n\nPlease reply YES to confirm you're still coming, or CHANGE if your plans have changed.${adv}` },
    { when: "2 days before arrival (if no reply)",
      text: `Hi ${first(bk.guest)}, a quick reminder from ${s.hotelName}: your stay starts ${fmtDate(bk.checkin)}. Reply YES to confirm, or let us know if you need to change dates — we'll happily help.` },
  ];
}

export function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function voicePrompt(bk, s) {
  return `ROLE
You are a friendly reservations assistant calling for ${s.hotelName}. Speak simply in English or Hindi (match the guest). Say you are an automated assistant if asked.

GOAL
Reconfirm booking ${bk.ref} for ${bk.guest || "the guest"}: ${bk.nights} night(s), check-in ${isoDay(bk.checkin)}, check-out ${isoDay(bk.checkout)}.

CALL FLOW
1. Greet, say you are calling from ${s.hotelName} about their upcoming stay, ask if it is a good time.
2. Ask: "Are you still planning to arrive on ${fmtDate(bk.checkin)}?"
3. If YES: thank them${bk.advance > 0 ? `; mention once that an advance of ${inr(bk.advance)} secures the room and the payment link is on WhatsApp` : ""}. Ask the expected arrival time.
4. If they want to CHANGE dates: note the new dates; the front desk will confirm on WhatsApp.
5. If they want to CANCEL: confirm politely and thank them. Do not pressure.
6. Keep the call under 90 seconds.

RULES
- Never ask for card numbers, OTPs or UPI PINs.
- If the guest is upset or asks for a person, offer a call back from the front desk.

RESULT (after the call)
{"booking_ref": "${bk.ref}", "outcome": "confirmed | changed | cancelled | no_answer | callback", "new_dates": "", "arrival_time": "", "notes": ""}`;
}

export const AUTOMATION_RULES = [
  ["Every morning", "All upcoming bookings are scored again (risk falls as arrival gets closer without a cancellation)."],
  ["High risk (55%+)", "Ask for a 50% advance with a UPI link, and send the WhatsApp reconfirmation 7 days before arrival."],
  ["Medium risk (30–54%)", "WhatsApp reconfirmation 7 days before arrival."],
  ["No reply after 2 days", "Second WhatsApp; if still no reply the day before arrival, a reminder call (AI voice call or front desk)."],
  ["Guest cancels", "Room is released for resale straight away."],
];

export const DEVELOPER_SPEC = `WhatsApp Business templates (category: Utility)
- stay_reconfirm_7d: "Hi {{1}}, this is {{2}}. We're looking forward to hosting you from {{3}} to {{4}}. Please reply YES to confirm, or CHANGE if your plans have changed."  Buttons: YES / Change dates / Pay advance -> {{5}}
- stay_reminder_2d: "Hi {{1}}, a quick reminder from {{2}}: your stay starts {{3}}. Reply YES to confirm, or let us know if you need to change dates."
Replies update the booking status: YES -> confirmed, Change -> change requested, no reply in 48h -> no reply (next step: call).
Voice: create an agent in smallest.ai with the call script from a booking and trigger it the day before arrival for unconfirmed High-risk guests.
Payments: replace the upi:// link with a payment-link service so paid advances are recorded automatically.
Consent: message only guests who shared their number for booking updates.`;
