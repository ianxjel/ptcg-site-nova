import test from "node:test";
import assert from "node:assert/strict";
import { normalize, keep, startIso, wallClockToIso } from "./normalize.mjs";

const row = (over = {}, type = "Challenge") => ({
  EventTypeName: type,
  Events: {
    Guid: "abc-123",
    Name: "",
    Activity_type: "tournament",
    Start_date: "2026-11-14T13:00:00Z",
    Category: "tcg_std",
    Admission: "$10",
    Status: "approved",
    Products: { List: ["tcg"] },
    Address: {
      Name: "Example Games",
      Full_address: "10 Main St, Fairfax, VA 22030, USA",
      Latitude: "38.85",
      Longitude: "-77.30",
      Timezone: "America/New_York",
    },
    ...over,
  },
});

test("tournament times are local wall-clock despite the Z", () => {
  assert.equal(startIso("2026-11-14T13:00:00Z", "tournament", "America/New_York"), "2026-11-14T13:00:00-05:00");
  assert.equal(startIso("2026-10-24T13:00:00+00:00", "tournament", "America/New_York"), "2026-10-24T13:00:00-04:00");
});

test("league play sessions are real UTC instants", () => {
  // 23:00 UTC on Nov 12 is 6 PM Eastern
  assert.equal(startIso("2026-11-12T23:00:00Z", "play_session", "America/New_York"), "2026-11-12T18:00:00-05:00");
  // 22:30 UTC on Oct 22 is 6:30 PM Eastern (daylight time)
  assert.equal(startIso("2026-10-22T22:30:00Z", "play_session", "America/New_York"), "2026-10-22T18:30:00-04:00");
});

test("wallClockToIso handles the DST switch day", () => {
  assert.equal(wallClockToIso("2026-11-01T12:00:00", "America/New_York"), "2026-11-01T12:00:00-05:00");
});

test("normalize builds a site event", () => {
  const ev = normalize(row());
  assert.equal(ev.id, "official-abc-123");
  assert.equal(ev.type, "store");
  assert.equal(ev.title, "League Challenge at Example Games");
  assert.equal(ev.city, "Fairfax, VA");
  assert.equal(ev.format, "Standard");
  assert.equal(ev.link, "https://events.pokemon.com/en-us/events");
});

test("keep filters by product, distance, state and date", () => {
  const win = { from: "2026-11-01", to: "2026-12-31" };
  assert.equal(keep(normalize(row()), win), true);
  assert.equal(keep(normalize(row({ Products: { List: ["vg"] } })), win), false);
  assert.equal(keep(normalize(row({ Start_date: "2027-02-01T13:00:00Z" })), win), false);
  const richmond = row({ Address: { Name: "Far Store", Full_address: "1 Broad St, Richmond, VA 23219, USA", Latitude: "37.54", Longitude: "-77.44" } });
  assert.equal(keep(normalize(richmond), win), false);
  const dc = row({ Address: { Name: "DC Store", Full_address: "1 K St NW, Washington, DC 20001, USA", Latitude: "38.90", Longitude: "-77.03" } });
  assert.equal(keep(normalize(dc), win), false);
});
