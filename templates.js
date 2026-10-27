// Message and voice-agent prompts. In the prototype these are shown and copied;
// sending is done later through the WhatsApp Business API and a voice-agent provider (e.g. smallest.ai).
import { isoDay } from "./features.js";

const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const first = (name) => (name || "Guest").split(" ")[0];

export function whatsappMessages(bk, s, upi) {
  const dep = bk.deposit > 0
    ? `\n\nTo hold your room, please pay an advance of ${inr(bk.deposit)} (${bk.depPct}% of your stay) by UPI to ${s.upiId} with the note "${bk.ref}", or tap the payment link we send next.`
    : "";
  return [
    {
      when: "7 days before arrival",
      text: `Hi ${first(bk.guest)}, this is ${s.hotelName}. We're looking forward to hosting you from ${fmtDate(bk.checkin)} to ${fmtDate(bk.checkout)} (${bk.nights} night${bk.nights === 1 ? "" : "s"}).\n\nPlease reply YES to confirm you're still coming, or CHANGE if your plans have changed.${dep}`,
    },
    {
      when: "2 days before arrival",
      text: `Hi ${first(bk.guest)}, a quick reminder from ${s.hotelName}: your stay starts ${fmtDate(bk.checkin)}. Reply YES to confirm, or let us know if you need to change dates — we'll happily help.`,
    },
    {
      when: "If the guest cancels or changes",
      text: `Thanks for letting us know, ${first(bk.guest)}. We've updated your booking ${bk.ref}. Reply here anytime if you'd like to rebook.`,
    },
  ];
}

export function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function voicePrompt(bk, s) {
  return `ROLE
You are a friendly reservations assistant calling on behalf of ${s.hotelName}. You speak politely in simple English or Hindi (match the guest). You are an AI assistant and must say so if asked.

GOAL
Reconfirm booking ${bk.ref} for ${bk.guest || "the guest"}: ${bk.nights} night(s), check-in ${isoDay(bk.checkin)}, check-out ${isoDay(bk.checkout)}.

CALL FLOW
1. Greet, say you are calling from ${s.hotelName} about their upcoming stay, and ask if it is a good time (if not, ask for a better time and end).
2. Confirm the dates. Ask: "Are you still planning to arrive on ${fmtDate(bk.checkin)}?"
3. If YES: thank them${bk.deposit > 0 ? `; mention that an advance of ${inr(bk.deposit)} secures the room and that a UPI link will come on WhatsApp` : ""}. Ask for expected arrival time.
4. If they want to CHANGE dates: note the new dates and say the front desk will confirm availability on WhatsApp.
5. If they want to CANCEL: confirm politely, thank them, do not pressure.
6. Close politely. Keep the call under 90 seconds.

RULES
- Never ask for card numbers, OTPs or UPI PINs. Payments only via the official UPI link on WhatsApp.
- Do not argue or push; one gentle mention of the advance only.
- If the guest is upset or asks for a human, offer a callback from the front desk.

OUTPUT (return as JSON after the call)
{"booking_ref": "${bk.ref}", "outcome": "confirmed | changed | cancelled | no_answer | callback", "new_dates": "", "arrival_time": "", "notes": ""}`;
}

export const AUTOMATION_RULES = [
  ["Every day, 06:00", "Score all confirmed bookings arriving in the next 60 days (Supabase scheduled job)."],
  ["On booking", "Suggest a deposit by risk: Low 0%, Medium 25%, High 50% of the stay value, with a UPI link."],
  ["7 days before arrival", "WhatsApp reconfirmation to Medium and High risk guests (with the deposit link if unpaid)."],
  ["No reply within 48 hours", "Raise the guest's risk by 15 points (business rule) and move them up the list."],
  ["2 days before arrival", "Second WhatsApp to High-risk guests who have not confirmed."],
  ["1 day before, still no reply", "AI voice call (smallest.ai) to reconfirm; outcome is written back to the booking."],
  ["Guest cancels", "Room is released for resale immediately; savings report counts it as rebooked if resold."],
];

export const WHATSAPP_TEMPLATE_SPEC = `WhatsApp Business API template (submit in Meta Business Manager, category: UTILITY)

Name: stay_reconfirm_7d
Body: Hi {{1}}, this is {{2}}. We're looking forward to hosting you from {{3}} to {{4}}. Please reply YES to confirm, or CHANGE if your plans have changed.
Buttons: Quick reply "YES, I'm coming" · Quick reply "Change dates" · URL "Pay advance" -> {{5}}

Name: stay_reminder_2d
Body: Hi {{1}}, a quick reminder from {{2}}: your stay starts {{3}}. Reply YES to confirm, or let us know if you need to change dates.

Webhook: on reply "YES" -> status = confirmed; "Change dates" -> status = change_requested; no reply in 48h -> status = noreply (risk +15).
Consent: only message guests who gave their number for booking updates (opt-in), and include the hotel name in every message.`;
