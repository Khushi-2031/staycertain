import { predict } from "./predict.js";
import { logPrediction } from "./log.js";
import { EXAMPLES } from "./examples.js";
import { checkInputs, ALLOWED, LIMITS } from "./features.js";

const INR_PER_EUR = 90; // ASSUMPTION: the model learned euro room rates
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const GROUPS = [
  { title: "Stay", fields: [
    { name: "arrival_date_month", label: "Arrival month", type: "select", options: MONTHS },
    { name: "lead_time", label: "Days between booking and arrival", type: "int", min: LIMITS.lead_time[0], max: LIMITS.lead_time[1] },
    { name: "stays_in_weekend_nights", label: "Weekend nights", type: "int", min: 0, max: 19, hint: "Saturday and Sunday nights" },
    { name: "stays_in_week_nights", label: "Weekday nights", type: "int", min: 0, max: 30, hint: "Monday to Friday nights" },
    { name: "rate_inr", label: "Room rate per night (₹)", type: "decimal", min: LIMITS.rate_inr[0], max: LIMITS.rate_inr[1] },
  ] },
  { title: "Guests", fields: [
    { name: "adults", label: "Adults", type: "int", min: 1, max: 10 },
    { name: "children", label: "Children (incl. babies)", type: "int", min: 0, max: 6, default: 0 },
    { name: "meal", label: "Meal plan", type: "select", options: [["BB", "Bed & breakfast"], ["HB", "Half board"], ["FB", "Full board"], ["SC", "Room only"]] },
    { name: "customer_type", label: "Type of booking", type: "select",
      options: [["Transient", "Single booking"], ["Transient-Party", "Linked to another booking"], ["Contract", "Agency/company contract"], ["Group", "Part of a group"]] },
  ] },
  { title: "Booking source", fields: [
    { name: "market_segment", label: "Where the booking came from", type: "select",
      options: [["Online TA", "Online travel agent"], ["Offline TA/TO", "Offline travel agent / tour operator"], ["Direct", "Direct (phone, walk-in, website)"],
        ["Groups", "Group"], ["Corporate", "Corporate"], ["Complementary", "Complimentary"], ["Aviation", "Airline crew"]] },
  ] },
  { title: "Guest history", note: "Fill in if this guest has booked with you before — it changes the result a lot.", fields: [
    { name: "previous_bookings_not_canceled", label: "Earlier stays with you", type: "int", min: 0, max: 72, default: 0 },
    { name: "previous_cancellations", label: "Earlier cancellations", type: "int", min: 0, max: 26, default: 0 },
  ] },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);
const $ = (id) => document.getElementById(id);
const pairs = (f) => f.options.map((o) => (Array.isArray(o) ? o : [o, o]));
const resultEl = $("result");
const intro = resultEl.innerHTML;

// ---------- render form ----------
for (const g of GROUPS) {
  const box = document.createElement("div");
  box.className = "group";
  const t = document.createElement("h3"); t.className = "group-title"; t.textContent = g.title; box.appendChild(t);
  if (g.note) { const n = document.createElement("p"); n.className = "group-note"; n.textContent = g.note; box.appendChild(n); }
  const grid = document.createElement("div"); grid.className = "grid";
  for (const f of g.fields) {
    const w = document.createElement("div"); w.className = "field"; w.id = `wrap-${f.name}`;
    const l = document.createElement("label"); l.htmlFor = f.name;
    const s1 = document.createElement("span"); s1.textContent = f.label; l.appendChild(s1);
    if (f.type !== "select") { const s2 = document.createElement("span"); s2.className = "range"; s2.textContent = `${f.min.toLocaleString("en-IN")}–${f.max.toLocaleString("en-IN")}`; l.appendChild(s2); }
    w.appendChild(l);
    let input;
    if (f.type === "select") {
      input = document.createElement("select");
      const ph = document.createElement("option"); ph.value = ""; ph.textContent = "Choose…"; input.appendChild(ph);
      for (const [v, txt] of pairs(f)) { const o = document.createElement("option"); o.value = v; o.textContent = txt; input.appendChild(o); }
    } else {
      input = document.createElement("input"); input.type = "text"; input.inputMode = f.type === "int" ? "numeric" : "decimal"; input.autocomplete = "off";
    }
    input.id = f.name; input.name = f.name; w.appendChild(input);
    if (f.hint) { const hd = document.createElement("div"); hd.className = "hint"; hd.textContent = f.hint; w.appendChild(hd); }
    const err = document.createElement("p"); err.className = "error"; err.id = `err-${f.name}`; w.appendChild(err);
    grid.appendChild(w);
  }
  box.appendChild(grid);
  $("groups").appendChild(box);
}
function clearResult() { resultEl.className = "panel result empty"; resultEl.innerHTML = intro; }
function setDefaults() {
  for (const f of FIELDS) { $(f.name).value = f.default !== undefined ? String(f.default) : ""; $(`err-${f.name}`).textContent = ""; $(`wrap-${f.name}`).classList.remove("invalid"); }
  $("form-error").textContent = "";
}
setDefaults();

// ---------- test bookings ----------
for (const ex of EXAMPLES) {
  const o = document.createElement("option"); o.value = String(ex.id);
  o.textContent = `Test booking ${ex.id} (Orange: ${ex.expected.toFixed(3)})`; $("example").appendChild(o);
}
$("example").addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => String(e.id) === $("example").value);
  if (!ex) return;
  setDefaults(); clearResult();
  for (const f of FIELDS) {
    if (f.name === "rate_inr") $(f.name).value = String(Math.round(ex.inputs.adr * INR_PER_EUR * 100) / 100);
    else if (ex.inputs[f.name] !== undefined) $(f.name).value = String(ex.inputs[f.name]);
  }
});
$("reset").addEventListener("click", () => { $("example").value = ""; setDefaults(); clearResult(); });

// ---------- validation ----------
function validate() {
  const v = {}; let ok = true;
  for (const f of FIELDS) {
    const raw = $(f.name).value.trim(); let msg = "";
    if (f.type === "select") { if (!pairs(f).some(([x]) => x === raw)) msg = `Please choose ${f.label.toLowerCase()}.`; else v[f.name] = raw; }
    else if (raw === "") msg = `Please fill in ${f.label.toLowerCase()}.`;
    else if (f.type === "int" && !/^\d+$/.test(raw)) msg = `${f.label} must be a whole number.`;
    else if (f.type === "decimal" && !/^\d+(\.\d+)?$/.test(raw)) msg = "Room rate must be a number in rupees.";
    else { const n = Number(raw); if (n < f.min || n > f.max) msg = `${f.label} must be between ${f.min.toLocaleString("en-IN")} and ${f.max.toLocaleString("en-IN")}.`; else v[f.name] = n; }
    $(`err-${f.name}`).textContent = msg; $(`wrap-${f.name}`).classList.toggle("invalid", msg !== ""); if (msg) ok = false;
  }
  $("form-error").textContent = "";
  if (!ok) { $("form-error").textContent = "Please fix the highlighted fields."; return null; }
  const nights = v.stays_in_weekend_nights + v.stays_in_week_nights;
  const inputs = { ...v, is_repeated_guest: v.previous_bookings_not_canceled > 0 ? "1" : "0", adr: Math.round((v.rate_inr / INR_PER_EUR) * 100) / 100 };
  const problems = checkInputs(inputs, nights);
  if (nights < 1) problems.unshift("A stay must be at least 1 night.");
  if (problems.length) { $("form-error").textContent = problems[0]; return null; }
  return inputs;
}

// ---------- result ----------
function showResult({ probability, tier, action }) {
  const pct = Math.round(probability * 100);
  resultEl.className = `panel result ${tier.toLowerCase()}`; resultEl.innerHTML = "";
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; resultEl.appendChild(e); return e; };
  add("h2", "result-title", "Risk at booking");
  const top = document.createElement("div"); top.className = "top";
  const left = document.createElement("div");
  const p1 = document.createElement("div"); p1.className = "pct"; p1.textContent = `${pct}%`;
  const p2 = document.createElement("div"); p2.className = "pct-label"; p2.textContent = "chance this booking is cancelled";
  left.append(p1, p2); top.appendChild(left);
  const b = document.createElement("span"); b.className = `badge ${tier.toLowerCase()}`; b.textContent = `${tier} risk`; top.appendChild(b);
  resultEl.appendChild(top);
  add("p", "similar", `About ${Math.max(1, Math.round(probability * 10))} in 10 similar bookings are cancelled.`);
  const act = document.createElement("div"); act.className = "action";
  const s = document.createElement("strong"); s.textContent = "What to do"; const t = document.createElement("span"); t.textContent = action;
  act.append(s, t); resultEl.appendChild(act);
  add("p", "note", `Score ${probability.toFixed(3)} · a rough guide from past bookings, not a guarantee.`);
}

$("booking-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const inputs = validate();
  if (!inputs) { clearResult(); const bad = document.querySelector(".invalid input, .invalid select"); if (bad) bad.focus(); return; }
  const r = predict(inputs);
  showResult(r);
  logPrediction(inputs, r);
});
