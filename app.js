import { predict } from "./predict.js";
import { logPrediction } from "./log.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// The 18 model inputs. `name` is the exact model column name.
const FIELDS = [
  { name: "hotel", label: "Hotel type", type: "select", options: ["City Hotel", "Resort Hotel"] },
  { name: "lead_time", label: "Days between booking and arrival", type: "int", min: 0, max: 737 },
  { name: "arrival_date_month", label: "Arrival month", type: "select", options: MONTHS },
  { name: "stays_in_weekend_nights", label: "Weekend nights", type: "int", min: 0, max: 19 },
  { name: "stays_in_week_nights", label: "Weekday nights", type: "int", min: 0, max: 50 },
  { name: "adults", label: "Adults", type: "int", min: 0, max: 55 },
  { name: "children", label: "Children (incl. babies)", type: "int", min: 0, max: 10 },
  { name: "meal", label: "Meal plan", type: "select", options: ["BB", "HB", "FB", "SC"],
    hint: "BB = bed & breakfast, HB = half board, FB = full board, SC = no meals" },
  { name: "market_segment", label: "Booking source", type: "select",
    options: ["Online TA", "Offline TA/TO", "Direct", "Groups", "Corporate", "Complementary", "Aviation"],
    hint: "TA = travel agent, TO = tour operator" },
  { name: "is_repeated_guest", label: "Repeat guest?", type: "select",
    options: [["0", "No"], ["1", "Yes"]], default: "0" },
  { name: "previous_cancellations", label: "Guest's previous cancellations", type: "int", min: 0, max: 26, default: 0 },
  { name: "previous_bookings_not_canceled", label: "Guest's previous kept bookings", type: "int", min: 0, max: 72, default: 0 },
  { name: "booking_changes", label: "Changes made to booking", type: "int", min: 0, max: 18, default: 0 },
  { name: "deposit_type", label: "Deposit type", type: "select", options: ["No Deposit", "Non Refund", "Refundable"] },
  { name: "customer_type", label: "Customer type", type: "select",
    options: ["Transient", "Transient-Party", "Contract", "Group"] },
  { name: "adr", label: "Room rate per night (EUR)", type: "decimal", min: 0, max: 510 },
  { name: "required_car_parking_spaces", label: "Parking spaces requested", type: "int", min: 0, max: 8, default: 0 },
  { name: "total_of_special_requests", label: "Special requests", type: "int", min: 0, max: 5, default: 0 },
];

const fieldsEl = document.getElementById("fields");
const form = document.getElementById("booking-form");
const formError = document.getElementById("form-error");
const resultEl = document.getElementById("result");

// ---------- render the form ----------
for (const f of FIELDS) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.id = `wrap-${f.name}`;

  const label = document.createElement("label");
  label.htmlFor = f.name;
  label.textContent = f.label;
  if (f.type !== "select" && f.min !== undefined) {
    const range = document.createElement("span");
    range.className = "hint";
    range.textContent = ` (${f.min}–${f.max})`;
    label.appendChild(range);
  }
  wrap.appendChild(label);

  let input;
  if (f.type === "select") {
    input = document.createElement("select");
    if (f.default === undefined) {
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "Choose…";
      input.appendChild(ph);
    }
    for (const opt of f.options) {
      const [value, text] = Array.isArray(opt) ? opt : [opt, opt];
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      if (f.default === value) o.selected = true;
      input.appendChild(o);
    }
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.inputMode = f.type === "int" ? "numeric" : "decimal";
    if (f.default !== undefined) input.value = String(f.default);
  }
  input.id = f.name;
  input.name = f.name;
  wrap.appendChild(input);

  if (f.hint) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = f.hint;
    wrap.appendChild(hint);
  }

  const err = document.createElement("p");
  err.className = "error";
  err.id = `err-${f.name}`;
  wrap.appendChild(err);

  fieldsEl.appendChild(wrap);
}

// ---------- validation ----------
function validate() {
  const inputs = {};
  let ok = true;

  for (const f of FIELDS) {
    const raw = document.getElementById(f.name).value.trim();
    let msg = "";

    if (f.type === "select") {
      const allowed = f.options.map((o) => (Array.isArray(o) ? o[0] : o));
      if (raw === "") msg = `Please choose ${f.label.toLowerCase()} from the list.`;
      else if (!allowed.includes(raw)) msg = `Please choose ${f.label.toLowerCase()} from the list.`;
      else inputs[f.name] = raw;
    } else if (raw === "") {
      msg = `Please fill in ${f.label.toLowerCase()}.`;
    } else if (f.type === "int") {
      if (!/^\d+$/.test(raw)) msg = `${f.label} must be a whole number.`;
      else {
        const n = Number(raw);
        if (n < f.min || n > f.max) msg = `${f.label} must be between ${f.min} and ${f.max}. Our model was trained on this range.`;
        else inputs[f.name] = n;
      }
    } else if (f.type === "decimal") {
      if (!/^\d+(\.\d+)?$/.test(raw)) msg = "Room rate must be a number in euros.";
      else {
        const n = Number(raw);
        if (n < f.min || n > f.max) msg = `${f.label} must be between ${f.min} and ${f.max}. Our model was trained on this range.`;
        else inputs[f.name] = n;
      }
    }

    document.getElementById(`err-${f.name}`).textContent = msg;
    document.getElementById(`wrap-${f.name}`).classList.toggle("invalid", msg !== "");
    if (msg) ok = false;
  }

  formError.textContent = "";
  if (ok && inputs.adults + inputs.children === 0) {
    formError.textContent = "A booking needs at least one guest.";
    document.getElementById("wrap-adults").classList.add("invalid");
    ok = false;
  }
  return ok ? inputs : null;
}

// ---------- show the result ----------
const SIMILAR = {
  Low: "About 1 in 8 similar bookings cancel.",
  Medium: "About 2 in 5 similar bookings cancel.",
  High: "About 4 in 5 similar bookings cancel.",
};

function showResult({ probability, tier, action }) {
  const pct = Math.round(probability * 100);
  resultEl.className = tier.toLowerCase();
  resultEl.innerHTML = "";
  const lines = [
    ["headline", `${tier} risk: ${pct}% chance this booking is cancelled.`],
    ["", SIMILAR[tier]],
    ["action", `What to do: ${action}`],
    ["note", "This is a rough guide from past bookings, not a guarantee."],
  ];
  for (const [cls, text] of lines) {
    const p = document.createElement("p");
    if (cls) p.className = cls;
    p.textContent = text;
    resultEl.appendChild(p);
  }
  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const inputs = validate();
  if (!inputs) {
    resultEl.hidden = true;
    const firstBad = form.querySelector(".invalid input, .invalid select");
    if (firstBad) firstBad.focus();
    return;
  }
  const result = predict(inputs); // called once per booking
  showResult(result);
  logPrediction(inputs, result); // optional: saves to Supabase if configured; never blocks the result
});
