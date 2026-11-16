import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { STORY_SIT, STORY_TOP, groupMix, ledger, pct, sameSit, weigh } from "./story.ts";

const req = createRequire(import.meta.url);
const E = req("./engine.js");
E.init(req("./engine_data_d3.json"));     // the tables the browser loads (college D3)

test("the film's story is what the engine says: Fastball, outside on top", () => {
  const w = weigh(E, STORY_SIT);
  assert.equal(w.groups[0].name, STORY_TOP, "the film's watch reads FASTBALL / OUTSIDE");
  assert.ok(w.groups[0].p < 0.9, "it is a share of a mix, not the only call");
  assert.ok(Math.abs(w.groups.reduce((a, g) => a + g.p, 0) - 1) < 1e-6, "the groups are the whole mix");
});

test("the playground opens on the story: same run, same numbers, and the group's spots explain its share", () => {
  const film = weigh(E, STORY_SIT), playground = weigh(E, { ...STORY_SIT, bases: [...STORY_SIT.bases] });
  assert.deepEqual(playground, film, "one situation, one engine run, one answer");
  const top = film.groups[0];
  assert.ok(top.spots.length >= 2, "the top group opens into its exact spots");
  assert.deepEqual(top.spots.map((s) => s.phrase).sort(), ["high and outside", "low and outside"]);
  assert.ok(Math.abs(top.spots.reduce((a, s) => a + s.p, 0) - top.p) < 1e-9, "the spots add up to the group");
  assert.equal(top.spots.reduce((a, s) => a + pct(s.p), 0), pct(top.p), "and so do the whole percentages shown on the page");
  assert.equal(film.top.phrase, top.spots[0].phrase, "the watch's most likely call is the top group's first spot");
  // the same result from the full tables the game app ships
  const Full = (() => { delete req.cache[req.resolve("./engine.js")]; const F = req("./engine.js"); F.init(req("./engine_data.json")); return F; })();
  assert.deepEqual(weigh(Full, STORY_SIT).groups.map((g) => [g.name, pct(g.p)]), film.groups.map((g) => [g.name, pct(g.p)]), "trimmed tables match the full ones");
});

test("changing the situation changes the call, and the ledger reads the same situation", () => {
  const full = weigh(E, { ...STORY_SIT, b: 3 });
  assert.notDeepEqual(full.groups.map((g) => g.name), weigh(E, STORY_SIT).groups.map((g) => g.name));
  assert.ok(sameSit(STORY_SIT, { ...STORY_SIT }) && !sameSit(STORY_SIT, { ...STORY_SIT, outs: 2 }));
  const l = ledger(STORY_SIT);
  assert.deepEqual(l.situation.map((r) => r.v), ["2-2", "One out", "On third", "3rd, tied"]);
  assert.equal(groupMix([]).length, 0);
});
