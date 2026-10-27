import { DEFAULT_SETTINGS, ACTIONS, scoreBookings, nightly, channels, savings, upiLink, todayUTC, DAY, isoDay } from "./engine.js";
import { whatsappMessages, waLink, voicePrompt, AUTOMATION_RULES, WHATSAPP_TEMPLATE_SPEC } from "./templates.js";
import { PATTERNS } from "./patterns.js";

// ---------- small helpers ----------
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.setAttribute("style", v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const fmt = (t) => new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const badge = (tier) => h("span", { class: `badge ${tier.toLowerCase()}` }, tier);
function toast(msg) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Select the text and copy it manually"); }
}

// ---------- state (per-viewer conveniences in localStorage) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
let settings = { ...DEFAULT_SETTINGS, ...store.get("sc_settings", {}) };
settings.depositPct = { ...DEFAULT_SETTINGS.depositPct, ...(settings.depositPct || {}) };
let statuses = store.get("sc_status", {});
let rawRows = [];
let sourceName = "";
let data = { bookings: [], skipped: [] };
let nights = [];
let actionFilter = "action";
let activeTab = "actions";

// ---------- data loading ----------
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
  } catch {
    $("dataStatus").textContent = "Could not load the sample file — use “Upload bookings”.";
  }
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
  $("dataStatus").textContent = `${sourceName}: ${rawRows.length} bookings read · ${data.bookings.length} upcoming confirmed bookings scored today (${isoDay(todayUTC())})`
    + (data.skipped.length ? ` · ${data.skipped.length} skipped (data problems)` : "");
  render();
}

// ---------- KPIs ----------
function horizonBookings() {
  const end = todayUTC() + settings.horizon * DAY;
  return data.bookings.filter((b) => b.checkin < end);
}
function renderKpis() {
  const bs = horizonBookings();
  const sv = savings(bs, nights, settings);
  const high = bs.filter((b) => b.tier === "High").length;
  const expC = bs.reduce((a, b) => a + b.p, 0);
  const deposits = bs.filter((b) => b.deposit > 0 && b.status !== "paid").reduce((a, b) => a + b.deposit, 0);
  const avgOcc = nights.length ? nights.reduce((a, n) => a + n.occPct, 0) / nights.length : 0;
  const k = $("kpis");
  k.replaceChildren(
    h("div", { class: "kpi" }, h("div", { class: "v" }, bs.length), h("div", { class: "l" }, `arrivals in next ${settings.horizon} days`)),
    h("div", { class: "kpi alert" }, h("div", { class: "v" }, inr(sv.atRisk)), h("div", { class: "l" }, "revenue at risk (expected cancellations)")),
    h("div", { class: "kpi alert" }, h("div", { class: "v" }, high), h("div", { class: "l" }, "High-risk bookings")),
    h("div", { class: "kpi" }, h("div", { class: "v" }, expC.toFixed(0)), h("div", { class: "l" }, "bookings expected to cancel")),
    h("div", { class: "kpi" }, h("div", { class: "v" }, inr(deposits)), h("div", { class: "l" }, "advance deposits to request")),
    h("div", { class: `kpi${avgOcc >= 0.8 ? " good" : ""}` }, h("div", { class: "v" }, pct(avgOcc)), h("div", { class: "l" }, "expected occupancy after cancellations")),
  );
}

// ---------- Tab: actions ----------
const STATUS_LABEL = { "": "Not contacted", sent: "WhatsApp sent", confirmed: "Confirmed", noreply: "No reply", paid: "Deposit paid" };
const STATUS_CLASS = { "": "", sent: "", confirmed: "ok", noreply: "bad", paid: "ok" };

function renderActions() {
  const el = $("tab-actions");
  const bs = horizonBookings();
  const list = bs.filter((b) => actionFilter === "all" ? true : actionFilter === "action" ? b.tier !== "Low" : b.tier === actionFilter);
  const chips = h("div", { class: "chips" }, ...[["action", "Needs action"], ["High", "High"], ["Medium", "Medium"], ["Low", "Low"], ["all", "All"]].map(([f, label]) =>
    h("button", { type: "button", class: `chip${actionFilter === f ? " active" : ""}`, onclick: () => { actionFilter = f; renderActions(); } },
      `${label} (${f === "all" ? bs.length : f === "action" ? bs.filter((b) => b.tier !== "Low").length : bs.filter((b) => b.tier === f).length})`)));

  const rows = list.length ? list.map((b) => h("tr", { class: "clickable", onclick: () => openDrawer(b.ref) },
    h("td", { class: "nowrap" }, fmt(b.checkin), h("span", { class: "sub" }, b.checkin === todayUTC() ? "today" : `in ${Math.round((b.checkin - todayUTC()) / DAY)} days`)),
    h("td", {}, b.guest || b.ref, h("span", { class: "sub" }, `${b.ref} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.features.market_segment}`)),
    h("td", { class: "nowrap" }, badge(b.tier), " ", h("strong", {}, pct(b.p)),
      b.status ? h("span", { class: "sub" }, h("span", { class: `pill ${STATUS_CLASS[b.status]}` }, STATUS_LABEL[b.status])) : null),
    h("td", { class: "why" }, b.explanation.headline),
    h("td", { class: "num" }, inr(b.value), h("span", { class: "sub" }, `${inr(b.atRisk)} at risk`)),
    h("td", { class: "num" }, b.deposit ? inr(b.deposit) : "—", h("span", { class: "sub" }, `${b.depPct}% advance`)),
    h("td", { class: "nowrap" }, h("button", { type: "button", class: "btn primary-sm", onclick: (e) => { e.stopPropagation(); openDrawer(b.ref); } }, "Open")),
  )) : [h("tr", { class: "empty" }, h("td", { colspan: "7" }, "No bookings in this group."))];

  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Today's action list"), chips),
    h("p", { class: "lead" }, "Every upcoming booking is scored each day. Open a booking to see why it is risky, the suggested advance with a UPI link, the WhatsApp messages and the AI call script."),
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ...["Arrival", "Guest", "Risk", "Why", "Stay value", "Advance", ""].map((t, i) => h("th", { class: i >= 4 && i <= 5 ? "num" : "" }, t)))),
      h("tbody", {}, ...rows))),
    data.skipped.length ? h("p", { class: "muted small" }, `Skipped: ${data.skipped.slice(0, 3).join("; ")}${data.skipped.length > 3 ? "…" : ""}`) : null,
  ));
}

// ---------- Drawer: one booking ----------
function setStatus(ref, st) {
  if (st) statuses[ref] = st; else delete statuses[ref];
  store.set("sc_status", statuses);
  recompute();
  if (st !== "cancelled") openDrawer(ref); else closeDrawer();
  toast(st === "cancelled" ? "Booking released for resale" : "Status updated");
}

function openDrawer(ref) {
  const b = data.bookings.find((x) => x.ref === ref);
  if (!b) return;
  const upi = b.deposit ? upiLink(settings, b) : "";
  const msgs = whatsappMessages(b, settings, upi);
  const prompt = voicePrompt(b, settings);
  const e = b.explanation;
  const d7 = b.checkin - 7 * DAY, d2 = b.checkin - 2 * DAY, d1 = b.checkin - DAY;
  const when = (t) => (t < todayUTC() ? `${fmt(t)} (passed)` : t === todayUTC() ? "Today" : fmt(t));

  const statusBtns = [["sent", "WhatsApp sent"], ["confirmed", "Guest confirmed"], ["noreply", "No reply"], ["paid", "Deposit paid"], ["cancelled", "Guest cancelled"], ["", "Reset"]]
    .map(([st, label]) => h("button", { type: "button", class: `btn${b.status === st && st ? " on" : ""}`, onclick: () => setStatus(b.ref, st) }, label));

  const dr = $("drawer");
  dr.replaceChildren(
    h("div", { class: "drawer-head" },
      h("div", {}, h("h2", { id: "drawerTitle" }, b.guest || b.ref),
        h("div", { class: "muted" }, `${b.ref} · ${fmt(b.checkin)} → ${fmt(b.checkout)} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${inr(b.rateInr)}/night · ${b.features.market_segment}`)),
      h("button", { type: "button", class: "close", onclick: closeDrawer }, "Close")),
    h("div", { class: "drawer-body" },
      h("div", { class: "card" },
        h("div", { class: "score-row" }, h("span", { class: `pct ${b.tier.toLowerCase()}` }, pct(b.p)), badge(b.tier),
          h("span", { class: "muted" }, `chance of cancelling · stay value ${inr(b.value)} · ${inr(b.atRisk)} at risk`)),
        b.rule ? h("p", { class: "muted small" }, `Model score ${pct(b.modelP)} → ${pct(b.p)} after rule: ${b.rule}`) : null,
        h("p", { style: "margin:10px 0 0;font-weight:600" }, e.headline),
        h("p", { class: "muted small", style: "margin:4px 0 0" }, ACTIONS[b.tier])),

      h("div", { class: "card" }, h("h3", {}, "Why this score"),
        h("ul", { class: "reasons" },
          ...e.raises.map((r) => h("li", { class: "up" }, h("span", { class: "ico" }, "↑"), h("span", {}, r.text, r.pattern ? h("span", { class: "pattern" }, `Pattern: ${r.pattern}`) : null))),
          ...e.lowers.map((r) => h("li", { class: "down" }, h("span", { class: "ico" }, "↓"), h("span", {}, r.text, r.pattern ? h("span", { class: "pattern" }, `Pattern: ${r.pattern}`) : null)))),
        h("p", { class: "muted small", style: "margin:10px 0 0" }, `↑ raises the risk, ↓ lowers it, compared with an average booking (overall ${pct(PATTERNS.overall)} cancel). Each line is a term of the model's own formula; patterns are from 87,216 past bookings.`)),

      h("div", { class: "card" }, h("h3", {}, "Risk-based advance"),
        b.deposit
          ? [h("p", { style: "margin:0" }, h("strong", {}, inr(b.deposit)), ` advance (${b.depPct}% of ${inr(b.value)}) suggested for ${b.tier.toLowerCase()} risk.`),
             h("div", { class: "btn-row" }, h("a", { class: "btn primary-sm", href: upi }, "Open UPI payment link"), h("button", { type: "button", class: "btn", onclick: () => copy(upi) }, "Copy UPI link")),
             h("p", { class: "muted small" }, upi)]
          : h("p", { class: "muted", style: "margin:0" }, "Low risk — no advance needed. Keep the booking as normal.")),

      h("div", { class: "card" }, h("h3", {}, "Automated reconfirmation"),
        h("ul", { class: "timeline" },
          h("li", {}, h("span", { class: "d" }, "On booking"), h("span", {}, b.deposit ? `Send advance request (${inr(b.deposit)}) with UPI link` : "No message needed")),
          b.tier !== "Low" ? h("li", {}, h("span", { class: "d" }, when(d7)), h("span", {}, "WhatsApp reconfirmation (7 days before)")) : null,
          b.tier !== "Low" ? h("li", {}, h("span", { class: "d" }, "+48 hours"), h("span", {}, `No reply → risk +${settings.noReplyBump} points`)) : null,
          b.tier === "High" ? h("li", {}, h("span", { class: "d" }, when(d2)), h("span", {}, "Second WhatsApp (2 days before)")) : null,
          b.tier === "High" ? h("li", {}, h("span", { class: "d" }, when(d1)), h("span", {}, "AI voice call if still no reply (smallest.ai)")) : null),
        ...msgs.map((m) => [h("div", { class: "msg-when" }, m.when), h("div", { class: "msg" }, m.text),
          h("div", { class: "btn-row" }, b.phone ? h("a", { class: "btn wa", href: waLink(b.phone, m.text), target: "_blank", rel: "noopener" }, "Open in WhatsApp") : null,
            h("button", { type: "button", class: "btn", onclick: () => copy(m.text) }, "Copy"))])),

      h("div", { class: "card" }, h("h3", {}, "AI voice call — agent prompt (smallest.ai, to connect)"),
        h("pre", { class: "prompt" }, prompt),
        h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: () => copy(prompt) }, "Copy prompt"))),

      h("div", { class: "card" }, h("h3", {}, "Record what happened (demo)"),
        h("p", { class: "muted small", style: "margin:0" }, "In production these update automatically from WhatsApp replies, UPI payments and call outcomes."),
        h("div", { class: "btn-row" }, ...statusBtns)),
    ),
  );
  dr.hidden = false;
  $("drawerBackdrop").hidden = false;
  dr.querySelector(".close").focus();
}
function closeDrawer() { $("drawer").hidden = true; $("drawerBackdrop").hidden = true; }
$("drawerBackdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// ---------- Tab: revenue & forecast ----------
function renderRevenue() {
  const el = $("tab-revenue");
  const worst = [...nights].sort((a, b) => b.atRisk - a.atRisk).slice(0, 3);
  const push = nights.filter((n) => n.signal === "Push sales");
  const hold = nights.filter((n) => n.signal === "Hold rates");
  const totalRisk = nights.reduce((a, n) => a + n.atRisk, 0);
  const rows = nights.map((n) => h("tr", {},
    h("td", { class: "nowrap" }, fmt(n.date)),
    h("td", { class: "num" }, `${n.booked} / ${settings.rooms}`),
    h("td", { class: "num" }, n.expCancel.toFixed(1)),
    h("td", {}, h("div", { class: `bar ${n.occPct < 0.6 ? "low" : n.occPct > 0.9 ? "high" : ""}` }, h("span", { style: `width:${Math.min(100, n.occPct * 100).toFixed(0)}%` })),
      h("div", { class: "bar-label" }, `${pct(n.occPct)} expected (${n.expOcc.toFixed(1)} rooms)`)),
    h("td", { class: "num" }, inr(n.atRisk)),
    h("td", {}, h("span", { class: `pill ${n.signal === "Push sales" ? "warn" : n.signal === "Hold rates" ? "ok" : ""}` }, n.signal)),
  ));
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, `Revenue at risk & ${settings.horizon}-day occupancy forecast`)),
    h("p", { class: "lead" }, "Occupancy is forecast from expected cancellations, not raw bookings: each booking counts as (1 − its cancellation probability). Revenue at risk per night = sum of probability × nightly rate."),
    h("div", { class: "cards" },
      h("div", { class: "callout warn" }, h("strong", {}, `${inr(totalRisk)} of room revenue is at risk over the next ${settings.horizon} nights. `),
        `Biggest exposure: ${worst.map((n) => `${fmt(n.date)} (${inr(n.atRisk)})`).join(", ")}.`),
      h("div", { class: "callout" },
        h("strong", {}, "Pricing signal: "),
        push.length ? `push sales on ${push.length} night(s) — e.g. ${push.slice(0, 3).map((n) => fmt(n.date)).join(", ")} (expected occupancy below 60%). ` : "no weak nights. ",
        hold.length ? `Hold rates on ${hold.length} night(s) — e.g. ${hold.slice(0, 3).map((n) => fmt(n.date)).join(", ")} (above 90% even after cancellations).` : "")),
    h("div", { class: "table-wrap", style: "margin-top:12px" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Night"), h("th", { class: "num" }, "Booked"), h("th", { class: "num" }, "Exp. cancellations"), h("th", {}, "Expected occupancy"), h("th", { class: "num" }, "Revenue at risk"), h("th", {}, "Signal"))),
      h("tbody", {}, ...rows)))));
}

// ---------- Tab: safe overbooking ----------
function renderOverbook() {
  const el = $("tab-overbook");
  const full = nights.filter((n) => n.booked >= settings.rooms);
  const items = full.length ? full.map((n) => h("li", {},
    n.extra > 0
      ? [h("strong", {}, `${fmt(n.date)}: you can safely accept ${n.extra} extra booking${n.extra === 1 ? "" : "s"}`),
         ` (about ${pct(n.walkP, 1)} chance of having to walk a guest). ${n.booked} of ${settings.rooms} rooms booked, ~${n.expCancel.toFixed(1)} expected to cancel.`]
      : [h("strong", {}, `${fmt(n.date)}: do not overbook`), ` — only ~${n.expCancel.toFixed(1)} cancellations expected; even 1 extra booking would push the walk risk above ${settings.walkRisk}%.`]))
    : [h("li", {}, "No fully booked nights in the forecast window — sell remaining rooms normally.")];
  const slider = h("input", { type: "range", min: "1", max: "15", value: String(settings.walkRisk), "aria-label": "Maximum walk risk",
    oninput: (e) => { settings.walkRisk = Number(e.target.value); store.set("sc_settings", settings); nights = nightly(data.bookings, settings); renderOverbook(); renderKpis(); } });
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Safe overbooking calculator")),
    h("p", { class: "lead" }, "For each fully booked night we add up the cancellation probabilities of every guest staying that night and calculate the chance that more guests arrive than you have rooms. Extra bookings are assumed to behave like that night's average booking, and bookings are treated as independent."),
    h("div", { class: "callout", style: "margin-bottom:12px" }, h("label", {}, h("strong", {}, `Accept at most a ${settings.walkRisk}% chance of walking a guest `), slider)),
    h("ul", { class: "list-sentences" }, ...items),
    h("p", { class: "muted small" }, "Walking a guest = moving them to a partner hotel at your cost. Large chains do this every night; this gives a small hotel the same maths.")));
}

// ---------- Tab: channels ----------
function renderChannels() {
  const el = $("tab-channels");
  const ch = channels(horizonBookings());
  const hist = Object.entries(PATTERNS.market_segment).sort((a, b) => b[1][0] - a[1][0]);
  const worst = hist[0], direct = PATTERNS.market_segment.Direct;
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Channel behaviour")),
    h("div", { class: "callout warn", style: "margin-bottom:12px" },
      `In the training data, ${worst[0]} bookings cancelled ${pct(worst[1][0])} of the time — ${(worst[1][0] / direct[0]).toFixed(1)}× the rate of direct bookings (${pct(direct[0])}). Every booking you move from an OTA to direct lowers risk and saves commission.`),
    h("div", { class: "cards" },
      h("div", {}, h("h3", { class: "group-title" }, "Your upcoming bookings by channel"),
        h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Channel"), h("th", { class: "num" }, "Bookings"), h("th", { class: "num" }, "Avg. predicted cancel"), h("th", { class: "num" }, "Revenue at risk"))),
          h("tbody", {}, ...ch.map((c) => h("tr", {}, h("td", {}, c.channel), h("td", { class: "num" }, c.n), h("td", { class: "num" }, pct(c.rate)), h("td", { class: "num" }, inr(c.atRisk)))))))),
      h("div", {}, h("h3", { class: "group-title" }, "Cancellation rate in 87,216 past bookings"),
        h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Channel"), h("th", { class: "num" }, "Cancelled"), h("th", { class: "num" }, "Bookings"))),
          h("tbody", {}, ...hist.map(([k, [r, n]]) => h("tr", {}, h("td", {}, k), h("td", { class: "num" }, pct(r)), h("td", { class: "num" }, n.toLocaleString("en-IN")))))))),
    ),
    h("p", { class: "muted small" }, "Walk-ins are not in the training data. To track each OTA separately (Booking.com, MakeMyTrip, Agoda…), add a channel_name column to your export.")));
}

// ---------- Tab: savings ----------
function renderSavings() {
  const el = $("tab-savings");
  const sv = savings(horizonBookings(), nights, settings);
  const card = (title, value, how) => h("div", { class: "card" }, h("h3", {}, title), h("div", { class: "big" }, value), h("div", { class: "how" }, how));
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, `Savings report — projected for the next ${settings.horizon} days`)),
    h("div", { class: "callout good", style: "margin-bottom:12px" },
      h("strong", {}, `Estimated revenue protected: ${inr(sv.total)}`),
      settings.subscription ? ` — about ${sv.roi.toFixed(1)}× a ${inr(settings.subscription)}/month subscription.` : ""),
    h("div", { class: "cards" },
      card("Revenue at risk without action", inr(sv.atRisk), "Sum over upcoming bookings of cancellation probability × stay value."),
      card("Deposits kept on cancelled stays", inr(sv.depositsKept), `Advances asked ${inr(sv.depositsAsked)} × ${settings.depositPayRate}% who pay × each booking's cancellation probability. ASSUMPTION: pay rate.`),
      card("Rooms resold after early warning", inr(sv.rebooked), `Revenue at risk on ${sv.flagged} flagged bookings × ${settings.rebookRate}% resold because you knew early. ASSUMPTION: resale rate.`),
      card("Cancellations avoided by reconfirmation", inr(sv.avoided), `Revenue at risk on ${sv.high} High-risk bookings × ${settings.reminderSaveRate}% saved by WhatsApp + AI call. ASSUMPTION: save rate.`),
      card("Extra revenue from safe overbooking", inr(sv.overbook), `${sv.extraNights} extra room-nights × average rate × 90% (walk risk ≤ ${settings.walkRisk}%).`),
    ),
    h("p", { class: "muted small" }, "This is a projection from the model and the assumptions in Settings. Once live, the report switches to actuals: deposits received (UPI), rooms resold after cancellation, guests who confirmed and arrived.")));
}

// ---------- Tab: automations ----------
function renderAutomations() {
  const el = $("tab-automations");
  const sample = data.bookings.find((b) => b.tier === "High") || data.bookings[0];
  const prompt = sample ? voicePrompt(sample, settings) : "";
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Automations")),
    h("p", { class: "lead" }, "What runs by itself once WhatsApp Business and the voice agent are connected. In this prototype, messages and prompts are generated and can be sent manually from each booking."),
    h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "When"), h("th", {}, "What happens"))),
      h("tbody", {}, ...AUTOMATION_RULES.map(([w, t]) => h("tr", {}, h("td", { class: "nowrap" }, h("strong", {}, w)), h("td", {}, t))))))),
  h("div", { class: "panel" }, h("h2", {}, "WhatsApp Business templates"),
    h("pre", { class: "prompt" }, WHATSAPP_TEMPLATE_SPEC),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: () => copy(WHATSAPP_TEMPLATE_SPEC) }, "Copy"))),
  h("div", { class: "panel" }, h("h2", {}, "AI voice agent prompt (smallest.ai)"),
    h("p", { class: "lead" }, `Filled in for ${sample ? `${sample.guest} (${sample.ref})` : "a booking"}; each booking's own prompt is in its detail panel. Connect by creating an agent in smallest.ai, pasting this as its prompt, and triggering an outbound call with the booking's details.`),
    h("pre", { class: "prompt" }, prompt),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", onclick: () => copy(prompt) }, "Copy prompt"))),
  h("div", { class: "panel" }, h("h2", {}, "Demo: simulate this week's replies"),
    h("p", { class: "lead" }, "Fills in random outcomes for Medium/High bookings arriving in the next 7 days (confirmed, no reply, deposit paid) so you can see scores and lists react. Reset clears them."),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn primary-sm", onclick: simulate }, "Simulate replies"),
      h("button", { type: "button", class: "btn", onclick: () => { statuses = {}; store.set("sc_status", statuses); recompute(); toast("Statuses reset"); } }, "Reset all statuses"))));
}
function simulate() {
  const soon = data.bookings.filter((b) => b.tier !== "Low" && b.checkin < todayUTC() + 7 * DAY);
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (const b of soon) {
    const r = rnd();
    statuses[b.ref] = r < 0.45 ? "confirmed" : r < 0.7 ? "noreply" : r < 0.9 ? "paid" : "sent";
  }
  store.set("sc_status", statuses);
  recompute();
  toast(`Simulated replies for ${soon.length} bookings`);
}

// ---------- Tab: settings ----------
function renderSettings() {
  const el = $("tab-settings");
  const field = (label, key, type = "text", assume = false, sub = null) => {
    const val = sub ? settings[key][sub] : settings[key];
    return h("div", { class: "field" },
      h("label", { for: `set-${key}${sub || ""}` }, h("span", {}, label), assume ? h("span", { class: "assume" }, "ASSUMPTION") : h("span", {})),
      h("input", { id: `set-${key}${sub || ""}`, type, value: String(val), onchange: (e) => {
        const v = type === "number" ? Number(e.target.value) : e.target.value;
        if (sub) settings[key] = { ...settings[key], [sub]: v }; else settings[key] = v;
        store.set("sc_settings", settings); recompute(); toast("Saved");
      } }));
  };
  el.replaceChildren(h("div", { class: "panel" },
    h("div", { class: "section-head" }, h("h2", {}, "Settings")),
    h("h3", { class: "group-title" }, "Hotel"),
    h("div", { class: "settings-grid" }, field("Hotel name", "hotelName"), field("Rooms", "rooms", "number"), field("UPI ID for advances", "upiId"),
      field("₹ per € (model was trained in EUR)", "inrPerEur", "number", true), field("Forecast window (days)", "horizon", "number"), field("Max walk risk for overbooking (%)", "walkRisk", "number")),
    h("h3", { class: "group-title", style: "margin-top:18px" }, "Advance by risk (% of stay value)"),
    h("div", { class: "settings-grid" }, field("Low risk", "depositPct", "number", false, "Low"), field("Medium risk", "depositPct", "number", false, "Medium"), field("High risk", "depositPct", "number", false, "High")),
    h("h3", { class: "group-title", style: "margin-top:18px" }, "Rules and savings assumptions"),
    h("div", { class: "settings-grid" },
      field("No reply → add points to risk", "noReplyBump", "number", true), field("Confirmed → keep % of risk", "confirmedFactor", "number", true), field("Deposit paid → keep % of risk", "depositPaidFactor", "number", true),
      field("Guests who pay the advance (%)", "depositPayRate", "number", true), field("Flagged cancellations resold (%)", "rebookRate", "number", true), field("High-risk saves from reconfirmation (%)", "reminderSaveRate", "number", true),
      field("Subscription price (₹/month)", "subscription", "number", true)),
    h("div", { class: "btn-row", style: "margin-top:16px" }, h("button", { type: "button", class: "btn", onclick: () => { settings = structuredClone(DEFAULT_SETTINGS); store.set("sc_settings", settings); recompute(); toast("Defaults restored"); } }, "Restore defaults"))));
}

// ---------- tabs ----------
const RENDER = { actions: renderActions, revenue: renderRevenue, overbook: renderOverbook, channels: renderChannels, savings: renderSavings, automations: renderAutomations, settings: renderSettings };
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  activeTab = t.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.id !== `tab-${activeTab}`; });
  RENDER[activeTab]();
}));
function render() { renderKpis(); RENDER[activeTab](); }

loadSample();
