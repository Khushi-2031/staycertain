import { predict } from "./predict.js";
import { logPrediction } from "./log.js";
import { EXAMPLES } from "./examples.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// The 18 model inputs, grouped for the form. `name` is the exact model column name.
const GROUPS = [
  {
    title: "Stay",
    fields: [
      { name: "hotel", label: "Hotel type", type: "select", options: ["City Hotel", "Resort Hotel"] },
      { name: "arrival_date_month", label: "Arrival month", type: "select", options: MONTHS },
      { name: "lead_time", label: "Days between booking and arrival", type: "int", min: 0, max: 737 },
      { name: "adr", label: "Room rate per night (EUR)", type: "decimal", min: 0, max: 510 },
      { name: "stays_in_weekend_nights", label: "Weekend nights", type: "int", min: 0, max: 19, hint: "Saturday and Sunday nights" },
      { name: "stays_in_week_nights", label: "Weekday nights", type: "int", min: 0, max: 50, hint: "Monday to Friday nights" },
    ],
  },
  {
    title: "Guests",
    fields: [
      { name: "adults", label: "Adults", type: "int", min: 0, max: 55 },
      { name: "children", label: "Children (incl. babies)", type: "int", min: 0, max: 10 },
      { name: "meal", label: "Meal plan", type: "select",
        options: [["BB", "BB – bed & breakfast"], ["HB", "HB – half board"], ["FB", "FB – full board"], ["SC", "SC – room only"]] },
      { name: "customer_type", label: "Customer type", type: "select",
        options: [["Transient", "Transient – single booking"], ["Transient-Party", "Transient-Party – linked to another booking"],
                  ["Contract", "Contract – agency/company deal"], ["Group", "Group – group booking"]] },
    ],
  },
  {
    title: "Booking",
    fields: [
      { name: "market_segment", label: "Booking source", type: "select",
        options: [["Online TA", "Online travel agent"], ["Offline TA/TO", "Offline travel agent / tour operator"],
                  ["Direct", "Direct"], ["Groups", "Groups"], ["Corporate", "Corporate"],
                  ["Complementary", "Complementary"], ["Aviation", "Aviation"]] },
      { name: "deposit_type", label: "Deposit type", type: "select", options: ["No Deposit", "Non Refund", "Refundable"] },
      { name: "total_of_special_requests", label: "Special requests", type: "int", min: 0, max: 5, default: 0, prefilled: true },
      { name: "required_car_parking_spaces", label: "Parking spaces", type: "int", min: 0, max: 8, default: 0, prefilled: true },
      { name: "booking_changes", label: "Changes made to booking", type: "int", min: 0, max: 18, default: 0, prefilled: true },
    ],
  },
  {
    title: "Guest history",
    collapsible: true,
    note: "Pre-filled for a new guest. Change only if this guest has booked before.",
    fields: [
      { name: "is_repeated_guest", label: "Repeat guest?", type: "select", options: [["0", "No"], ["1", "Yes"]], default: "0", prefilled: true },
      { name: "previous_cancellations", label: "Previous cancellations", type: "int", min: 0, max: 26, default: 0, prefilled: true },
      { name: "previous_bookings_not_canceled", label: "Previous kept bookings", type: "int", min: 0, max: 72, default: 0, prefilled: true },
    ],
  },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);

const $ = (id) => document.getElementById(id);
const groupsEl = $("groups");
const form = $("booking-form");
const formError = $("form-error");
const resultEl = $("result");
const resultIntro = resultEl.innerHTML;

const optionPairs = (f) => f.options.map((o) => (Array.isArray(o) ? o : [o, o]));

// ---------- render the form ----------
function fieldEl(f) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.id = `wrap-${f.name}`;

  const label = document.createElement("label");
  label.htmlFor = f.name;
  const text = document.createElement("span");
  text.textContent = f.label;
  label.appendChild(text);
  const side = document.createElement("span");
  if (f.prefilled) { side.className = "tag"; side.textContent = "pre-filled"; }
  else if (f.type !== "select") { side.className = "range"; side.textContent = `${f.min}–${f.max}`; }
  label.appendChild(side);
  wrap.appendChild(label);

  let input;
  if (f.type === "select") {
    input = document.createElement("select");
    if (f.default === undefined) {
      const ph = document.createElement("option");
      ph.value = ""; ph.textContent = "Choose…";
      input.appendChild(ph);
    }
    for (const [value, txt] of optionPairs(f)) {
      const o = document.createElement("option");
      o.value = value; o.textContent = txt;
      input.appendChild(o);
    }
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.inputMode = f.type === "int" ? "numeric" : "decimal";
    input.autocomplete = "off";
  }
  input.id = f.name;
  input.name = f.name;
  input.setAttribute("aria-describedby", `err-${f.name}`);
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
  return wrap;
}

for (const g of GROUPS) {
  const box = document.createElement(g.collapsible ? "details" : "div");
  box.className = "group";
  const title = document.createElement("h3");
  title.className = "group-title";
  title.textContent = g.title;
  if (g.collapsible) {
    const summary = document.createElement("summary");
    summary.appendChild(title);
    box.appendChild(summary);
  } else {
    box.appendChild(title);
  }
  if (g.note) {
    const note = document.createElement("p");
    note.className = "group-note";
    note.textContent = g.note;
    box.appendChild(note);
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  g.fields.forEach((f) => grid.appendChild(fieldEl(f)));
  box.appendChild(grid);
  groupsEl.appendChild(box);
}

function setDefaults() {
  for (const f of FIELDS) {
    const el = $(f.name);
    el.value = f.default !== undefined ? String(f.default) : "";
    $(`err-${f.name}`).textContent = "";
    $(`wrap-${f.name}`).classList.remove("invalid");
  }
  formError.textContent = "";
}
setDefaults();

// ---------- test booking loader ----------
const exampleSel = $("example");
for (const ex of EXAMPLES) {
  const o = document.createElement("option");
  o.value = String(ex.id);
  o.textContent = `Test booking ${ex.id} (Orange: ${ex.expected.toFixed(3)})`;
  exampleSel.appendChild(o);
}
exampleSel.addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => String(e.id) === exampleSel.value);
  if (!ex) return;
  setDefaults();
  for (const [k, v] of Object.entries(ex.inputs)) $(k).value = String(v);
});
$("reset").addEventListener("click", () => {
  exampleSel.value = "";
  setDefaults();
  resultEl.className = "panel result empty";
  resultEl.innerHTML = resultIntro;
});

// ---------- validation ----------
function validate() {
  const inputs = {};
  let ok = true;
  for (const f of FIELDS) {
    const raw = $(f.name).value.trim();
    const lower = f.label.toLowerCase();
    let msg = "";
    if (f.type === "select") {
      const allowed = optionPairs(f).map(([v]) => v);
      if (raw === "" || !allowed.includes(raw)) msg = `Please choose ${lower} from the list.`;
      else inputs[f.name] = raw;
    } else if (raw === "") {
      msg = `Please fill in ${lower}.`;
    } else if (f.type === "int" && !/^\d+$/.test(raw)) {
      msg = `${f.label} must be a whole number.`;
    } else if (f.type === "decimal" && !/^\d+(\.\d+)?$/.test(raw)) {
      msg = "Room rate must be a number in euros.";
    } else {
      const n = Number(raw);
      if (n < f.min || n > f.max) msg = `${f.label} must be between ${f.min} and ${f.max}. Our model was trained on this range.`;
      else inputs[f.name] = n;
    }
    $(`err-${f.name}`).textContent = msg;
    $(`wrap-${f.name}`).classList.toggle("invalid", msg !== "");
    if (msg) ok = false;
  }
  formError.textContent = "";
  if (ok && inputs.adults + inputs.children === 0) {
    formError.textContent = "A booking needs at least one guest.";
    $("wrap-adults").classList.add("invalid");
    ok = false;
  }
  if (!ok && !formError.textContent) formError.textContent = "Please fix the highlighted fields.";
  return ok ? inputs : null;
}

// ---------- result ----------
const SIMILAR = {
  Low: "About 1 in 8 similar bookings cancel.",
  Medium: "About 2 in 5 similar bookings cancel.",
  High: "About 4 in 5 similar bookings cancel.",
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function showResult({ probability, tier, action }) {
  const pct = Math.round(probability * 100);
  resultEl.className = `panel result ${tier.toLowerCase()}`;
  resultEl.innerHTML = "";

  resultEl.appendChild(el("h2", "result-title", "Result"));
  const top = el("div", "top");
  const left = el("div");
  left.appendChild(el("div", "pct", `${pct}%`));
  left.appendChild(el("div", "pct-label", "chance this booking is cancelled"));
  top.appendChild(left);
  top.appendChild(el("span", `badge ${tier.toLowerCase()}`, `${tier} risk`));
  resultEl.appendChild(top);

  resultEl.appendChild(el("p", "similar", SIMILAR[tier]));
  const act = el("div", "action");
  act.appendChild(el("strong", "", "What to do"));
  act.appendChild(el("span", "", action));
  resultEl.appendChild(act);
  resultEl.appendChild(el("p", "note", `Model output: ${probability.toFixed(3)}. This is a rough guide from past bookings, not a guarantee.`));

  if (window.matchMedia && !window.matchMedia("(min-width: 960px)").matches) {
    resultEl.scrollIntoView({ block: "start" });
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const inputs = validate();
  if (!inputs) {
    const firstBad = form.querySelector(".invalid input, .invalid select");
    if (firstBad) {
      const det = firstBad.closest("details");
      if (det) det.open = true;
      firstBad.focus();
    }
    return;
  }
  const result = predict(inputs); // called once per booking
  showResult(result);
  logPrediction(inputs, result); // optional Supabase log; never blocks the result
});
