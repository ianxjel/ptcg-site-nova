const cfg = window.SITE_CONFIG || {};
const signupsReady = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

const listEl = document.getElementById("event-list");
const emptyEl = document.getElementById("empty");
const nextUpEl = document.getElementById("next-up");
const searchEl = document.getElementById("q");
const chips = [...document.querySelectorAll(".chip")];

const dialog = document.getElementById("signup");
const form = document.getElementById("signup-form");
const formMsg = document.getElementById("form-msg");
const submitBtn = document.getElementById("signup-submit");
const eventLabel = document.getElementById("signup-event");

let events = [];
let activeType = "all";
let activeEvent = null;
let supabase = null;

const fmtDay = new Intl.DateTimeFormat("en-US", { day: "numeric" });
const fmtMon = new Intl.DateTimeFormat("en-US", { month: "short" });
const fmtFull = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadEvents() {
  try {
    const res = await fetch("events.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const all = await res.json();
    const now = Date.now() - 6 * 60 * 60 * 1000; // keep events visible for a few hours after start
    events = all
      .filter((e) => new Date(e.start).getTime() >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  } catch {
    events = [];
    emptyEl.textContent = "Events couldn't load. Refresh the page to try again.";
  }
  render();
}

function actionFor(e) {
  if (e.type === "hosted") {
    return `<button class="button" type="button" data-signup="${esc(e.id)}">Sign up</button>`;
  }
  if (e.link) {
    return `<a class="button button-quiet" href="${esc(e.link)}" target="_blank" rel="noopener">Store details</a>`;
  }
  return "";
}

function typeLabel(e) {
  if (e.example) return `<span class="event-type example">Example listing. Replace it in events.json.</span>`;
  return e.type === "hosted"
    ? `<span class="event-type hosted">Sign up on this site</span>`
    : `<span class="event-type store">Register with the store</span>`;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const shown = events.filter((e) => {
    if (activeType !== "all" && e.type !== activeType) return false;
    if (!q) return true;
    return [e.title, e.venue, e.city, e.format].join(" ").toLowerCase().includes(q);
  });

  listEl.innerHTML = shown
    .map((e) => {
      const d = new Date(e.start);
      const meta = [`${fmtFull.format(d)}, ${fmtTime.format(d)}`, e.venue, e.city, e.format, e.fee].filter(Boolean).join(", ");
      return `<li class="event">
        <div class="event-date"><b>${fmtDay.format(d)}</b><span>${fmtMon.format(d)}</span></div>
        <div>
          <h3>${esc(e.title)}</h3>
          <p class="event-meta">${esc(meta)}</p>
          ${typeLabel(e)}
        </div>
        <div class="event-action">${actionFor(e)}</div>
      </li>`;
    })
    .join("");
  emptyEl.hidden = shown.length > 0;

  renderNextUp();
}

function renderNextUp() {
  const e = events[0];
  if (!e) {
    nextUpEl.innerHTML = `<div class="next-up-inner">
      <div class="next-up-when">Soon<small>New dates coming</small></div>
      <h3>No events on the calendar yet</h3>
      <p>Check back, or tell us about one you're running.</p>
      <a class="button" href="#host">List an event</a>
    </div>`;
    return;
  }
  const d = new Date(e.start);
  nextUpEl.innerHTML = `<div class="next-up-inner">
    <span class="next-up-tag">Next up</span>
    <div class="next-up-when">${fmtMon.format(d)} ${fmtDay.format(d)}<small>${fmtFull.format(d).split(",")[0]}, ${fmtTime.format(d)}</small></div>
    <h3>${esc(e.title)}</h3>
    <p>${esc([e.venue, e.city].filter(Boolean).join(", "))}</p>
    ${actionFor(e)}
  </div>`;
}

/* Filters */
searchEl.addEventListener("input", render);
document.getElementById("filters").addEventListener("submit", (ev) => ev.preventDefault());
chips.forEach((chip) =>
  chip.addEventListener("click", () => {
    activeType = chip.dataset.type;
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", String(on));
    });
    render();
  })
);

/* Sign-up dialog */
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-signup]");
  if (!btn) return;
  activeEvent = events.find((e) => e.id === btn.dataset.signup);
  if (!activeEvent) return;
  form.reset();
  formMsg.textContent = "";
  formMsg.className = "form-msg";
  submitBtn.disabled = false;
  submitBtn.hidden = false;
  const d = new Date(activeEvent.start);
  eventLabel.textContent = `${activeEvent.title}, ${fmtFull.format(d)} at ${fmtTime.format(d)}`;
  dialog.showModal();
});

document.getElementById("signup-cancel").addEventListener("click", () => dialog.close());

function showMsg(text, kind) {
  formMsg.textContent = text;
  formMsg.className = `form-msg ${kind}`;
}

async function getClient() {
  if (supabase) return supabase;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return supabase;
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.name = (data.name || "").trim();
  data.email = (data.email || "").trim();
  data.player_id = (data.player_id || "").trim() || null;

  if (!data.name) return showMsg("Enter your name.", "error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showMsg("Enter a valid email address.", "error");
  if (!signupsReady) return showMsg("Online sign-ups aren't switched on yet. Contact the organizer to save a seat.", "error");

  submitBtn.disabled = true;
  showMsg("Saving your seat…", "");
  try {
    const client = await getClient();
    const { error } = await client.from("signups").insert({ event_id: activeEvent.id, ...data });
    if (error) throw error;
    showMsg(`You're signed up, ${data.name}. See you there.`, "ok");
    submitBtn.hidden = true;
  } catch {
    submitBtn.disabled = false;
    showMsg("Your sign-up didn't save. Check your connection and try again.", "error");
  }
});

loadEvents();
