// Collects Pokémon TCG events near Northern Virginia from the official
// Play! Pokémon Event Locator and writes official-events.json for the site.
//
// The locator has no public API, so this opens it in a normal headless
// browser, searches a few NoVA cities, and keeps the event data the page
// loads for itself. It runs once a day from GitHub Actions.
//
// If the locator blocks the run or changes its layout, this exits with an
// error and leaves the last good official-events.json in place.

import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, keep, forSite, TZ } from "./normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "official-events.json");
const LOCATOR_URL = "https://events.pokemon.com/en-us/events";
const SEARCHES = ["Fairfax, VA", "Leesburg, VA", "Woodbridge, VA"];
const WINDOW_DAYS = 60;

const log = (...a) => console.log(...a);
const pause = (page, ms) => page.waitForTimeout(ms);

async function closeCookieBanner(page) {
  const btn = page.locator('button:has-text("Reject All"):visible').first();
  try {
    await btn.click({ timeout: 15000 });
  } catch {
    /* no banner */
  }
}

// The locator can open in "Locations" mode, which lists stores instead of events.
async function switchToEvents(page) {
  const search = page
    .locator('button:has-text("Search Events"):visible, button:has-text("Search Locations"):visible')
    .first();
  await search.waitFor({ state: "visible", timeout: 60000 });
  for (let i = 0; i < 3; i++) {
    if (/Search Events/i.test(await search.innerText())) return;
    await page.locator('input[id$="DoubleSwitch"]').first().click({ force: true });
    await pause(1000);
  }
  throw new Error("Couldn't switch the locator to Events mode.");
}

async function searchCity(page, city) {
  const input = page.locator('input[placeholder="Enter your city"]:visible').first();
  await input.waitFor({ state: "visible", timeout: 45000 });
  await input.click();
  await input.fill("");
  // The city box only suggests places for real keystrokes.
  await input.pressSequentially(city, { delay: 80 });
  const suggestion = page.locator(".pac-container .pac-item").first();
  await suggestion.waitFor({ state: "visible", timeout: 20000 });
  await suggestion.click();
  await pause(700);
  await page.locator('button:has-text("Search Events"):visible').first().click();
}

// Results load 50 at a time as you scroll; scroll until nothing new arrives.
async function loadAllResults(page, rows) {
  let last = -1;
  let quiet = 0;
  for (let i = 0; i < 60 && quiet < 4; i++) {
    await page.mouse.wheel(0, 5000);
    await pause(1500);
    if (rows.size === last) quiet++;
    else {
      quiet = 0;
      last = rows.size;
    }
  }
}

async function collectCity(browser, city) {
  const context = await browser.newContext({ locale: "en-US", timezoneId: TZ, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const rows = new Map();

  page.on("response", async (res) => {
    if (!/DataActionGetEventList/.test(res.url())) return;
    try {
      const json = await res.json();
      for (const item of json?.data?.EventList?.List ?? []) {
        if (item?.Events?.Guid) rows.set(item.Events.Guid, item);
      }
    } catch {
      /* not JSON: usually a bot-check page */
    }
  });

  try {
    await page.goto(LOCATOR_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await closeCookieBanner(page);
    await switchToEvents(page);
    await searchCity(page, city);

    const deadline = Date.now() + 90000;
    while (rows.size === 0 && Date.now() < deadline) await pause(1000);
    if (rows.size === 0) throw new Error("no event data came back (the locator may have blocked the run)");

    await loadAllResults(page, rows);
    return [...rows.values()];
  } catch (err) {
    // Report what the page looked like, so a block page is easy to tell apart
    // from a layout change.
    let title = "", text = "";
    try {
      title = await page.title();
      text = (await page.locator("body").innerText({ timeout: 5000 })).replace(/\s+/g, " ").slice(0, 300);
    } catch {
      /* page gone */
    }
    err.message += ` | page title: "${title}" | page text: "${text}"`;
    throw err;
  } finally {
    await context.close();
  }
}

function ymd(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

async function main() {
  const now = new Date();
  const window = { from: ymd(now), to: ymd(new Date(now.getTime() + WINDOW_DAYS * 864e5)) };
  log(`Collecting TCG events ${window.from} to ${window.to}`);

  const browser = await chromium.launch({ headless: true });
  const byId = new Map();
  const failures = [];
  try {
    for (const city of SEARCHES) {
      try {
        const raw = await collectCity(browser, city);
        let kept = 0;
        for (const item of raw) {
          const ev = normalize(item);
          if (keep(ev, window)) {
            byId.set(ev.id, forSite(ev));
            kept++;
          }
        }
        log(`  ${city}: ${raw.length} rows, ${kept} kept`);
      } catch (err) {
        log(`  ${city}: failed, ${err.message}`);
        // Shows up as an annotation on the run summary page.
        log(`::error title=${city} failed::${err.message.replace(/\r?\n/g, " ")}`);
        failures.push(city);
      }
    }
  } finally {
    await browser.close();
  }

  if (byId.size === 0) {
    throw new Error("Found 0 events, so official-events.json was left unchanged.");
  }

  const events = [...byId.values()].sort((a, b) => a.start.localeCompare(b.start) || a.venue.localeCompare(b.venue));
  const payload = { updated: now.toISOString(), source: LOCATOR_URL, events };
  await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n");
  log(`Wrote ${events.length} events to official-events.json`);
  if (failures.length) {
    log(`Warning: some searches failed (${failures.join(", ")}), so this list may be missing events.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  console.log(`::error title=Collection failed::${err.message}`);
  process.exit(1);
});
