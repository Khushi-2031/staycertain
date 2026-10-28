import { DEFAULT_SETTINGS, scoreBookings, nightly, channels, savings, upiLink, todayUTC, DAY, isoDay } from "./engine.js";
import { whatsappMessages, waLink, voicePrompt, AUTOMATION_RULES, DEVELOPER_SPEC } from "./templates.js";
import { PATTERNS } from "./patterns.js";

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(2)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const inTen = (p) => `About ${Math.max(1, Math.round(p * 10))} in 10`;
const fmt = (t) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const badge = (tier) => h("span", { class: `badge ${tier.toLowerCase()}` }, tier);
function toast(msg) { const t = h("div", { class: "toast", role: "status" }, msg); document.body.append(t); setTimeout(() => t.remove(), 1800); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Select the text and copy it manually"); } }
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- state ----------
let settings = { ...DEFAULT_SETTINGS, ...store.get("sc2_settings", {}) };
let statuses = store.get("sc2_status", {});
let rawRows = [], sourceName = "", data = { bookings: [], skipped: [] }, nights = [];
let actionFilter = "action", activeTab = "actions";

// ---------- data ----------
async function loadBuffer(buf, name) {
  if (!window.XLSX) { $("dataStatus").textContent = "Could not load the Excel reader. Check your connection and reload."; return; }
  const wb = window.XLSX.read(buf, { type: "array", cellDates: false });
  const sheet = wb.Sheets["bookings"] || wb.Sheets[wb.SheetNames[0]];
  rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  sourceName = name;
  recompute();
}
async function loadSample() {
  $("dataStatus").textContent = "Loading sample hotel…";
  try {
    const r = await fetch("sample_hotel_bookings.xlsx");
    if (!r.ok) throw new Error(String(r.status));
    await loadBuffer(await r.arrayBuffer(), "Sample hotel (fictional, 20 rooms)");
  } catch { $("dataStatus").textContent = "Could not load the sample file — use “Upload bookings”."; }
}
$("loadSample").addEventListener("click", loadSample);
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  await loadBuffer(await f.arrayBuffer(), f.name);
  e.target.value = "";
});

function recompute() {
  data = scoreBookings(rawRows, settings, statuses);
  nights = nightly(data.bookings, settings);
  $("hotelLine").textContent = `${settings.hotelName} · ${settings.rooms} rooms`;
  $("dataStatus").textContent = `${sourceName}: ${data.bookings.length} upcoming bookings checked today (${isoDay(todayUTC())})`
    + (data.skipped.length ? ` · ${data.skipped.length} skipped because of data problems` : "");
  render();
}
const horizon = () => data.bookings.filter((b) => b.checkin < todayUTC() + settings.horizon * DAY);

// ---------- KPIs ----------
function renderKpis() {
  const bs = horizon();
  const sv = savings(bs, nights, settings);
  const high = bs.filter((b) => b.tier === "High").length;
  const action = bs.filter((b) => b.tier !== "Low" && b.held < b.value).length;
  $("kpis").replaceChildren(
    h("div", { class: "kpi" }, h("div", { class: "v" }, bs.length), h("div", { class: "l" }, `arrivals, next ${settings.horizon} days`)),
    h("div", { class: "kpi alert" }, h("div", { class: "v" }, `${inr(sv.atRisk)}*`), h("div", { class: "l" }, "revenue at risk")),
    h("div", { class: "kpi" }, h("div", { class: "v" }, action), h("div", { class: "l" }, `need action (${high} high)`)),
    h("div", { class: "kpi good" }, h("div", { class: "v" }, inr(sv.collected)), h("div", { class: "l" }, "advances collected")),
  );
  $("kpiNote").textContent = "* Estimate. The risk model learned from hotels in Portugal (2015–17) and is not yet tested on Indian hotels; rupee figures are a guide, not a guarantee.";
}

// ---------- Today's actions ----------
const STATUS = { "": ["Not contacted", ""], sent: ["WhatsApp sent", ""], confirmed: ["Confirmed", "ok"], noreply: ["No reply", "bad"], paid: ["Advance paid", "ok"] };
function renderActions() {
  const bs = horizon();
  const count = (f) => bs.filter((b) => (f === "all" ? true : f === "action" ? b.tier !== "Low" && b.held < b.value : b.tier === f)).length;
  const list = bs.filter((b) => (actionFilter === "all" ? true : actionFilter === "action" ? b.tier !== "Low" && b.held < b.value : b.tier === actionFilter));
  const chips = h("div", { class: "chips" }, [["action", "Needs action"], ["High", "High"], ["Medium", "Medium"], ["Low", "Low"], ["all", "All"]].map(([f, l]) =>
    h("button", { type: "button", class: `chip${actionFilter === f ? " active" : ""}`, onclick: () => { actionFilter = f; renderActions(); } }, `${l} (${count(f)})`)));
  const rows = list.length ? list.map((b) => h("tr", { class: "clickable", onclick: () => openDrawer(b.ref) },
    h("td", { class: "nowrap" }, fmt(b.checkin), h("span", { class: "sub" }, b.daysLeft === 0 ? "today" : `in ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"}`)),
    h("td", {}, b.guest || b.ref, h("span", { class: "sub" }, `${b.nights} night${b.nights === 1 ? "" : "s"} · ${inr(b.value)}`)),
    h("td", { class: "nowrap" }, badge(b.tier), " ", h("strong", {}, pct(b.p)),
      b.status ? h("span", { class: "sub" }, h("span", { class: `pill ${STATUS[b.status][1]}` }, STATUS[b.status][0])) : null),
    h("td", { class: "why" }, b.explanation.headline.replace(/^\w+ risk: /, "")),
    h("td", { class: "why" }, b.nextStep || b.action),
  )) : [h("tr", { class: "empty" }, h("td", { colspan: "5" }, "No bookings in this group."))];
  $("tab-actions").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Today's action list"), chips),
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Arrival", "Guest", "Risk today", "Why", "Next step"].map((t) => h("th", {}, t)))),
      h("tbody", {}, rows))),
    h("p", { class: "muted small" }, "Tap a booking to see the reasons, the messages and the payment link. Risk today falls as arrival gets closer without a cancellation."),
    data.skipped.length ? h("details", { class: "small" }, h("summary", {}, `${data.skipped.length} booking(s) skipped — show why`),
      h("ul", {}, data.skipped.slice(0, 20).map((s) => h("li", {}, s)))) : null));
}

// ---------- Booking panel ----------
function setStatus(ref, st) {
  if (st) statuses[ref] = st; else delete statuses[ref];
  store.set("sc2_status", statuses);
  recompute();
  if (st === "cancelled") { closeDrawer(); toast("Booking released for resale"); } else { openDrawer(ref); toast("Saved"); }
}
function openDrawer(ref) {
  const b = data.bookings.find((x) => x.ref === ref);
  if (!b) return;
  const e = b.explanation;
  const upi = b.advance ? upiLink(settings, b) : "";
  const msgs = whatsappMessages(b, settings);
  const prompt = voicePrompt(b, settings);
  const primary = b.held >= b.value ? null
    : b.advance && b.status !== "paid" ? h("a", { class: "btn primary-sm", href: b.phone ? waLink(b.phone, msgs[0].text) : upi, target: "_blank", rel: "noopener" }, `Request ₹${Math.round(b.advance).toLocaleString("en-IN")} advance on WhatsApp`)
    : b.tier !== "Low" && b.phone ? h("a", { class: "btn primary-sm", href: waLink(b.phone, msgs[0].text), target: "_blank", rel: "noopener" }, "Send WhatsApp reconfirmation") : null;
  const statusBtns = [["sent", "WhatsApp sent"], ["confirmed", "Guest confirmed"], ["noreply", "No reply"], ["paid", "Advance paid"], ["cancelled", "Guest cancelled"], ["", "Clear"]]
    .filter(([st]) => st !== "paid" || b.advance)
    .map(([st, l]) => h("button", { type: "button", class: `btn${b.status === st && st ? " on" : ""}`, onclick: () => setStatus(b.ref, st) }, l));
  $("drawer").replaceChildren(
    h("div", { class: "drawer-head" },
      h("div", {}, h("h2", { id: "drawerTitle" }, b.guest || b.ref),
        h("div", { class: "muted" }, `${fmt(b.checkin)} → ${fmt(b.checkout)} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${inr(b.value)}`)),
      h("button", { type: "button", class: "close", onclick: closeDrawer }, "Close")),
    h("div", { class: "drawer-body" },
      h("div", { class: "card" },
        h("div", { class: "score-row" }, h("span", { class: `pct ${b.tier.toLowerCase()}` }, pct(b.p)), badge(b.tier), h("span", { class: "muted" }, "chance of cancelling")),
        h("p", { style: "margin:8px 0 0" }, `${inTen(b.p)} bookings like this are cancelled from here. `,
          h("span", { class: "muted" }, b.daysLeft < b.features.lead_time ? `It was ${pct(b.modelP)} when booked; it falls as arrival gets closer (${b.daysLeft} days left).` : "Just booked.")),
        b.heldWhy ? h("p", { class: "callout good", style: "margin:10px 0 0" }, `${b.heldWhy}. Protected: ${inr(b.held)}.`) : null,
        h("div", { class: "next" }, h("strong", {}, "What to do"), h("span", {}, b.nextStep || b.action)),
        primary ? h("div", { class: "btn-row" }, primary) : null),
      h("div", { class: "card" }, h("h3", {}, "Why"),
        h("ul", { class: "reasons" },
          e.raises.slice(0, 3).map((r) => h("li", { class: "up" }, h("span", { class: "ico" }, "↑"), h("span", {}, r.text, r.pattern ? h("span", { class: "pattern" }, r.pattern) : null))),
          e.lowers.slice(0, 2).map((r) => h("li", { class: "down" }, h("span", { class: "ico" }, "↓"), h("span", {}, r.text, r.pattern ? h("span", { class: "pattern" }, r.pattern) : null))))),
      h("div", { class: "card" }, h("h3", {}, "What happened"), h("div", { class: "btn-row" }, statusBtns),
        h("p", { class: "muted small" }, "Recording a reply changes the next step, not the risk score.")),
      h("details", { class: "card more" }, h("summary", {}, "Messages, payment link and call script"),
        msgs.map((m) => [h("div", { class: "msg-when" }, m.when), h("div", { class: "msg" }, m.text),
          h("div", { class: "btn-row" }, b.phone ? h("a", { class: "btn wa", href: waLink(b.phone, m.text), target: "_blank", rel: "noopener" }, "Open in WhatsApp") : null,
            h("button", { type: "button", class: "btn", onclick: () => copy(m.text) }, "Copy"))]),
        upi ? [h("div", { class: "msg-when" }, "UPI payment link"), h("div", { class: "btn-row" }, h("a", { class: "btn", href: upi }, "Open payment link"), h("button", { type: "button", class: "btn", onclick: () => copy(upi) }, "Copy link"))] : null,
        h("div", { class: "msg-when" }, "Reminder call script (for the voice-call service)"),
        h("pre", { class: "prompt" }, prompt),
        h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: () => copy(prompt) }, "Copy script"))),
    ));
  $("drawer").hidden = false; $("drawerBackdrop").hidden = false;
  $("drawer").querySelector(".close").focus();
}
function closeDrawer() { $("drawer").hidden = true; $("drawerBackdrop").hidden = true; }
$("drawerBackdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// ---------- Revenue & forecast ----------
function renderRevenue() {
  const worst = [...nights].sort((a, b) => b.atRisk - a.atRisk).slice(0, 3);
  const push = nights.filter((n) => n.signal === "Push sales"), hold = nights.filter((n) => n.signal === "Hold rates");
  $("tab-revenue").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, `Revenue at risk and ${settings.horizon}-day occupancy`)),
    h("p", { class: "lead" }, "Expected occupancy = rooms booked minus the cancellations we expect. Prepaid, non-refundable rooms are not counted as at risk. Bookings that have not been made yet are not included."),
    h("div", { class: "cards" },
      h("div", { class: "callout warn" }, h("strong", {}, "Most at risk: "), worst.map((n) => `${fmt(n.date)} (${inr(n.atRisk)})`).join(", "), "."),
      h("div", { class: "callout" }, h("strong", {}, "Pricing signal: "),
        push.length ? `push sales on ${push.length} night(s), e.g. ${push.slice(0, 3).map((n) => fmt(n.date)).join(", ")}. ` : "no weak nights. ",
        hold.length ? `Hold rates on ${hold.length} night(s), e.g. ${hold.slice(0, 3).map((n) => fmt(n.date)).join(", ")}.` : "")),
    h("div", { class: "table-wrap", style: "margin-top:12px" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Night"), h("th", { class: "num" }, "Booked"), h("th", { class: "num" }, "Likely cancellations"), h("th", {}, "Expected occupancy"), h("th", { class: "num" }, "Revenue at risk"), h("th", {}, "Signal"))),
      h("tbody", {}, nights.map((n) => h("tr", {},
        h("td", { class: "nowrap" }, fmt(n.date)), h("td", { class: "num" }, `${n.booked} / ${settings.rooms}`), h("td", { class: "num" }, n.expCancel.toFixed(1)),
        h("td", {}, h("div", { class: `bar ${n.occPct < 0.6 ? "low" : n.occPct > 0.9 ? "high" : ""}` }, h("span", { style: `width:${Math.min(100, n.occPct * 100).toFixed(0)}%` })), h("div", { class: "bar-label" }, pct(n.occPct))),
        h("td", { class: "num" }, inr(n.atRisk)),
        h("td", {}, h("span", { class: `pill ${n.signal === "Push sales" ? "warn" : n.signal === "Hold rates" ? "ok" : ""}` }, n.signal)))))))));
}

// ---------- Safe overbooking ----------
function renderOverbook() {
  const full = nights.filter((n) => n.booked >= settings.rooms);
  const slider = h("input", { type: "range", min: "1", max: "15", value: String(settings.walkRisk), "aria-label": "Maximum chance of moving a guest",
    oninput: (e) => { settings.walkRisk = Number(e.target.value); store.set("sc2_settings", settings); nights = nightly(data.bookings, settings); renderOverbook(); } });
  $("tab-overbook").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Safe overbooking")),
    h("p", { class: "lead" }, "For each fully booked night we add up every guest's chance of cancelling and work out the chance that more guests arrive than you have rooms. Group bookings are treated as one unit because groups usually cancel together."),
    h("div", { class: "callout", style: "margin-bottom:12px" }, h("label", {}, h("strong", {}, `Accept at most a ${settings.walkRisk}% chance of having to move a guest `), slider)),
    h("ul", { class: "list-sentences" }, full.length ? full.map((n) => h("li", {}, n.extra > 0
      ? [h("strong", {}, `${fmt(n.date)}: you can safely accept ${n.extra} extra booking${n.extra === 1 ? "" : "s"}`), ` (about ${pct(n.walkP, 1)} chance of having to move a guest). ~${n.expCancel.toFixed(1)} of ${n.booked} bookings likely to cancel.`]
      : [h("strong", {}, `${fmt(n.date)}: don't overbook`), ` — only ~${n.expCancel.toFixed(1)} cancellations expected.`]))
      : [h("li", {}, "No fully booked nights in the next few weeks — sell remaining rooms normally.")]),
    h("p", { class: "muted small" }, "Moving a guest means placing them at a partner hotel at your cost. Treat this as a guide; check the nights before acting.")));
}

// ---------- Channels ----------
function renderChannels() {
  const ch = channels(horizon());
  const hist = Object.entries(PATTERNS.market_segment).filter(([, [, n]]) => n >= 1000).sort((a, b) => b[1][0] - a[1][0]);
  const ota = PATTERNS.market_segment["Online TA"], direct = PATTERNS.market_segment.Direct;
  $("tab-channels").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Cancellations by booking source")),
    h("div", { class: "callout warn", style: "margin-bottom:12px" },
      `In past data, online-travel-agent bookings were cancelled ${pct(ota[0])} of the time, against ${pct(direct[0])} for direct bookings. This shows which guests tend to cancel; it does not prove that moving guests to direct booking would reduce cancellations.`),
    h("div", { class: "cards" },
      h("div", {}, h("h3", { class: "group-title" }, "Your upcoming bookings"),
        h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Source"), h("th", { class: "num" }, "Bookings"), h("th", { class: "num" }, "Avg. risk today"), h("th", { class: "num" }, "At risk"))),
          h("tbody", {}, ch.map((c) => h("tr", {}, h("td", {}, c.channel), h("td", { class: "num" }, c.n), h("td", { class: "num" }, pct(c.rate)), h("td", { class: "num" }, inr(c.atRisk)))))))),
      h("div", {}, h("h3", { class: "group-title" }, "Past bookings (85,370)"),
        h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Source"), h("th", { class: "num" }, "Cancelled"), h("th", { class: "num" }, "Bookings"))),
          h("tbody", {}, hist.map(([k, [r, n]]) => h("tr", {}, h("td", {}, k), h("td", { class: "num" }, pct(r)), h("td", { class: "num" }, n.toLocaleString("en-IN")))))))))));
}

// ---------- Savings ----------
function renderSavings() {
  const sv = savings(horizon(), nights, settings);
  $("tab-savings").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, `Savings — next ${settings.horizon} days`)),
    h("div", { class: "cards" },
      h("div", { class: "card" }, h("h3", {}, "Advances collected so far"), h("div", { class: "big" }, inr(sv.collected)), h("div", { class: "how" }, "Money already received. The hotel keeps it if the guest cancels.")),
      h("div", { class: "card" }, h("h3", {}, "Estimated revenue protected"), h("div", { class: "big" }, `${inr(sv.low)} – ${inr(sv.high)}`),
        h("div", { class: "how" }, `Low end: advances we expect to keep from High-risk guests who later cancel (${settings.advancePayRate}% pay the advance). High end: plus ${settings.resaleRate}% of the remaining likely cancellations resold because you knew early. Each booking is counted once. Both rates are ASSUMPTIONS (Settings).`)),
      h("div", { class: "card" }, h("h3", {}, "Extra revenue from safe overbooking"), h("div", { class: "big" }, inr(sv.overbookRevenue)), h("div", { class: "how" }, `${sv.extraNights} extra room-night(s) at the average rate, within your ${settings.walkRisk}% limit. Not included in the range above.`)),
      h("div", { class: "card" }, h("h3", {}, "Pays for itself if…"), h("div", { class: "big" }, `${sv.breakEvenNights} room-night${sv.breakEvenNights === 1 ? "" : "s"}`), h("div", { class: "how" }, `are saved a month (${inr(settings.subscription)} subscription ÷ average rate ${inr(sv.avgRate)}).`))),
    h("p", { class: "muted small" }, "These are estimates until the hotel has a few months of real results; then this page shows actual advances received and rooms resold.")));
}

// ---------- Automations ----------
function renderAutomations() {
  $("tab-automations").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "What runs automatically")),
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "When"), h("th", {}, "What happens"))),
      h("tbody", {}, AUTOMATION_RULES.map(([w, t]) => h("tr", {}, h("td", { class: "nowrap" }, h("strong", {}, w)), h("td", {}, t)))))),
    h("p", { class: "muted small" }, "In this prototype, messages, payment links and call scripts are prepared for each booking; sending them automatically is the next step."),
    h("details", { class: "card more" }, h("summary", {}, "Set-up notes for your developer"), h("pre", { class: "prompt" }, DEVELOPER_SPEC))),
  h("div", { class: "panel" }, h("h2", {}, "Demo: simulate guest replies"),
    h("p", { class: "lead" }, "Fills in example replies for bookings that need action in the next 7 days, so you can see the list react. Clear removes them."),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary-sm", onclick: simulate }, "Simulate replies"),
      h("button", { type: "button", class: "btn", onclick: () => { statuses = {}; store.set("sc2_status", statuses); recompute(); toast("Cleared"); } }, "Clear all"))));
}
function simulate() {
  const soon = data.bookings.filter((b) => b.tier !== "Low" && b.daysLeft < 7);
  let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (const b of soon) { const r = rnd(); statuses[b.ref] = r < 0.5 ? "confirmed" : r < 0.75 ? "noreply" : b.advance && r < 0.9 ? "paid" : "sent"; }
  store.set("sc2_status", statuses); recompute(); toast(`Simulated replies for ${soon.length} bookings`);
}

// ---------- Settings ----------
function renderSettings() {
  const field = (label, key, type = "text", assume = false) => h("div", { class: "field" },
    h("label", { for: `set-${key}` }, h("span", {}, label), assume ? h("span", { class: "assume" }, "ASSUMPTION") : h("span", {})),
    h("input", { id: `set-${key}`, type, value: String(settings[key]), onchange: (e) => {
      settings[key] = type === "number" ? Number(e.target.value) : e.target.value; store.set("sc2_settings", settings); recompute(); toast("Saved"); } }));
  $("tab-settings").replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Settings")),
    h("div", { class: "settings-grid" }, field("Hotel name", "hotelName"), field("Rooms", "rooms", "number"), field("UPI ID for advances", "upiId"),
      field("Advance for High risk (% of stay)", "advancePct", "number"), field("Days shown", "horizon", "number"), field("Max chance of moving a guest (%)", "walkRisk", "number")),
    h("h3", { class: "group-title", style: "margin-top:18px" }, "Assumptions behind the estimates"),
    h("div", { class: "settings-grid" }, field("₹ per € (model learned euro prices)", "inrPerEur", "number", true), field("Guests who pay the advance (%)", "advancePayRate", "number", true),
      field("Flagged cancellations resold (%)", "resaleRate", "number", true), field("Subscription (₹ per month)", "subscription", "number", true)),
    h("p", { class: "muted small" }, "Risk levels are fixed by cost analysis: Low below 30%, Medium 30–54%, High 55% and above."),
    h("div", { class: "btn-row", style: "margin-top:12px" }, h("button", { type: "button", class: "btn", onclick: () => { settings = { ...DEFAULT_SETTINGS }; store.set("sc2_settings", settings); recompute(); toast("Defaults restored"); } }, "Restore defaults"))));
}

// ---------- tabs ----------
const RENDER = { actions: renderActions, revenue: renderRevenue, overbook: renderOverbook, channels: renderChannels, savings: renderSavings, automations: renderAutomations, settings: renderSettings };
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  activeTab = t.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => { x.classList.toggle("active", x === t); x.setAttribute("aria-selected", String(x === t)); });
  document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.id !== `tab-${activeTab}`; });
  RENDER[activeTab]();
}));
function render() { renderKpis(); RENDER[activeTab](); }
loadSample();
