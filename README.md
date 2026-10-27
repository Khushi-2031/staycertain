# StayCertain — protect every booking

A cancellation-risk platform for small hotels. Plain HTML/CSS/JS, no build step; deploys on Vercel as a static site.
The risk score comes only from the Logistic Regression model trained in Orange (`predict.js`). No AI decides the score.

## Pages
- `index.html` — **Dashboard** (loads the sample hotel automatically; upload your own Excel/CSV)
  - **Today's actions**: every upcoming booking scored, with the reasons ("High risk: booked 244 days ahead, via OTA, …"),
    the suggested advance (Low 0% / Medium 25% / High 50%) and a booking panel with:
    why-this-score (each line is a term of the model's formula + the pattern from 87,216 past bookings),
    UPI payment link, WhatsApp reconfirmation messages (7 and 2 days before), AI voice-call prompt (smallest.ai),
    and buttons to record outcomes (confirmed / no reply / deposit paid / cancelled).
  - **Revenue & forecast**: per night — booked rooms, expected cancellations, expected occupancy, ₹ at risk, push-sales / hold-rates signal.
  - **Safe overbooking**: "You can safely accept 2 extra bookings on 24 Dec (≈4% chance of walking a guest)" — exact
    Poisson-binomial calculation from each guest's probability (checked against simulation).
  - **Channels**: cancellation rate by booking source, in the training data and for your upcoming bookings.
  - **Savings report**: projected revenue protected (deposits kept, rooms resold, cancellations avoided, overbooking) vs subscription.
  - **Automations**: the daily rules, WhatsApp Business template spec, voice-agent prompt; "Simulate replies" for demos.
  - **Settings**: rooms, UPI ID, ₹/€ rate, deposit %, walk-risk limit, and every business ASSUMPTION used in rules and savings.
- `check.html` — single-booking form (v1, used for the 10 Orange reference tests).

## Files
`predict.js` (model) · `features.js` (raw booking → 18 inputs) · `explain.js` (reasons + patterns) · `engine.js` (deposits, rules,
forecast, overbooking, savings) · `templates.js` (WhatsApp + voice prompts) · `patterns.js` (training-data patterns) ·
`app.js` / `app.css` (dashboard) · `check.js` (form) · `sample_hotel_bookings.xlsx` (fictional 20-room resort, 347 bookings).

## Your booking file
One row per booking. Required: `booking_ref, hotel, booking_date, checkin_date, checkout_date, adults, children, meal,
market_segment, customer_type, deposit_type, adr_inr (or adr in EUR), status`. Optional: `guest_name, guest_phone,
booking_changes, required_car_parking_spaces, total_of_special_requests, is_repeated_guest, previous_cancellations,
previous_bookings_not_canceled`. See the sample file.

## Business rules vs model
- Model (trained, tested): the cancellation probability.
- Business rules (ASSUMPTIONS, editable): deposit %, no reply → +15 points, confirmed → ×0.6, deposit paid → ×0.5,
  savings rates. The booking panel always shows the model score and the rule that changed it.

## Connecting later
- WhatsApp Business API (Meta Cloud API or a BSP such as Gupshup/Interakt): submit the templates in Automations; webhook replies set the status.
- Voice: create an agent in smallest.ai with the prompt from a booking panel; trigger outbound calls 1 day before for unconfirmed High-risk guests.
- UPI: replace the `upi://` intent with a payment-link API (e.g. Razorpay Payment Links) to auto-mark deposits as paid.
- Daily automation in Supabase: `supabase_daily_scoring.sql` (scores every booking at 06:00 IST).

## Deploy
Vercel → New Project → import the repo → Framework "Other", no build command → Deploy. Local: `npm run dev`.

## Verify
`node test_predict.js` → `10 of 10 match Orange.`
