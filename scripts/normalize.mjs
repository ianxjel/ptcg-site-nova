// Turns raw rows from the official Play! Pokémon Event Locator into the shape
// the site uses in events.json. Pure functions only, so they can be tested
// without a browser.

export const TZ = "America/New_York";

// Center of Northern Virginia (Fairfax) and how far out to keep events.
export const CENTER = { lat: 38.8462, lon: -77.3064 };
export const MAX_MILES = 35;

const TYPE_LABELS = {
  Cup: "League Cup",
  Challenge: "League Challenge",
  Prerelease: "Prerelease",
  League: "League night",
  "Friendly Tournament": "Friendly tournament",
};

const FORMATS = { tcg_std: "Standard", tcg_lim: "Limited", tcg_glc: "Gym Leader Challenge" };

const LOCATOR_URL = "https://events.pokemon.com/en-us/events";

export function milesBetween(a, b) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// UTC offset (e.g. "-05:00") that a time zone uses at a given instant.
function offsetAt(date, timeZone) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name || "");
  return m ? `${m[1]}:${m[2] || "00"}` : "+00:00";
}

// "2026-11-12T18:00:00" as wall-clock time in `timeZone` -> ISO string with offset.
export function wallClockToIso(wall, timeZone) {
  const base = wall.replace(/(Z|[+-]\d{2}:\d{2})$/, "").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(base)) return "";
  // Guess with the offset at that moment treated as UTC, then correct once.
  const guess = new Date(base + "Z");
  let off = offsetAt(guess, timeZone);
  const corrected = new Date(base + off);
  off = offsetAt(corrected, timeZone);
  return base + off;
}

// The locator stores times two different ways:
// - tournaments: the venue's local wall-clock time, wrongly suffixed with "Z"
// - league play sessions: a real UTC instant
export function startIso(raw, activityType, timeZone) {
  if (!raw) return "";
  if (activityType === "play_session") {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d).reduce((o, p) => ((o[p.type] = p.value), o), {});
    const hour = local.hour === "24" ? "00" : local.hour;
    return wallClockToIso(`${local.year}-${local.month}-${local.day}T${hour}:${local.minute}:${local.second}`, timeZone);
  }
  return wallClockToIso(raw, timeZone);
}

export function normalize(item) {
  const e = item?.Events ?? {};
  const addr = e.Address ?? {};
  const tz = addr.Timezone || TZ;
  const typeLabel = TYPE_LABELS[item?.EventTypeName] || item?.EventTypeName || "Event";
  const venue = (addr.Name || "").trim();
  const name = (e.Name || "").trim();
  const attrs = (e.Attributes?.List ?? []).map((a) => a?.Display_name).filter(Boolean);
  const format = FORMATS[e.Category] || (attrs.includes("Gym Leader Challenge") ? "Gym Leader Challenge" : "");
  const link =
    (e.Third_party_registration_website || "").trim() ||
    (e.Event_website || "").trim() ||
    LOCATOR_URL;

  return {
    id: `official-${e.Guid}`,
    type: "store",
    source: "official",
    category: typeLabel,
    title: name && name !== venue ? name : `${typeLabel} at ${venue || "a local store"}`,
    start: startIso(e.Start_date, e.Activity_type, tz),
    venue,
    city: cityFrom(addr),
    address: (addr.Full_address || "").trim(),
    lat: Number(addr.Latitude) || null,
    lon: Number(addr.Longitude) || null,
    format,
    fee: (e.Admission || "").trim(),
    link,
    products: e.Products?.List ?? [],
    status: e.Status || "",
  };
}

function cityFrom(addr) {
  if (addr.City && addr.State) return `${addr.City}, ${addr.State}`;
  // Fall back to "City, ST" from the end of a US street address.
  const m = /,\s*([^,]+),\s*([A-Z]{2})\b[^,]*(,\s*(USA|United States))?\s*$/.exec(addr.Full_address || "");
  return m ? `${m[1].trim()}, ${m[2]}` : "";
}

// Keep TCG events in Virginia within MAX_MILES of Fairfax, in the date window.
export function keep(ev, { from, to }) {
  if (!ev.start || !ev.products.includes("tcg")) return false;
  if (/cancel/i.test(ev.status)) return false;
  const day = ev.start.slice(0, 10);
  if (day < from || day > to) return false;
  if (ev.lat == null || ev.lon == null) return false;
  if (milesBetween(CENTER, ev) > MAX_MILES) return false;
  return /\bVA\b|Virginia/.test(`${ev.city} ${ev.address}`);
}

// What gets written to official-events.json for the site.
export function forSite(ev) {
  const { products, status, lat, lon, ...rest } = ev;
  return rest;
}
