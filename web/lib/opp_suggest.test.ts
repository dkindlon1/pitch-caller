// Build 2 proof 5 (the thresholds part): suggestions fire at their thresholds and not before; merged hitters' at-bats
// count for the hitter they joined; a dismissed suggestion stays quiet until the evidence clearly grows. And the
// opponent fields' normaliser keeps only clean values and never touches the engine's fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, type Ev } from "./opp_suggest.ts";
import { applyHitterScouting, cellOfSpot, cleanCustom, cleanHitterScouting, cleanTeamScouting, nextHeat, ratingText, type FieldDef } from "./opp_model.ts";

const hard = (h: string, cell: [number, number], g = "g1"): Ev => ({ hitterId: h, gameId: g, res: "play", contact: "hard", out: "2B", locCell: cell, paEnd: "hard" });
const whiff = (h: string, cell: [number, number]): Ev => ({ hitterId: h, gameId: "g1", res: "whiff", locCell: cell });
const pa = (h: string, end: string): Ev => ({ hitterId: h, gameId: "g1", res: end === "k" ? "whiff" : "play", contact: end === "k" ? undefined : "solid", out: "OUT", paEnd: end });

test("zone hot: not on 1 hard-hit ball at a cell, yes on 2 (across games)", () => {
  assert.equal(suggest([hard("h1", [1, 1])], [{ id: "h1" }]).length, 0);
  const s = suggest([hard("h1", [1, 1], "g1"), hard("h1", [1, 1], "g2")], [{ id: "h1" }]);
  assert.deepEqual(s.map((x) => [x.kind, x.key, x.value, x.n]), [["zone", "1,1", "hot", 2]]);
});
test("zone cold: not on 2 whiffs, yes on 3 (whiffs and weak contact count together)", () => {
  assert.equal(suggest([whiff("h1", [3, 3]), whiff("h1", [3, 3])], [{ id: "h1" }]).length, 0);
  const s = suggest([whiff("h1", [3, 3]), whiff("h1", [3, 3]), { hitterId: "h1", res: "play", contact: "weak", out: "OUT", locCell: [3, 3], paEnd: "out" }], [{ id: "h1" }]);
  assert.deepEqual(s.map((x) => [x.key, x.value]), [["3,3", "cold"]]);
});
test("no suggestion when the grid already says so; way-off cells and unlogged spots never count", () => {
  assert.equal(suggest([hard("h1", [1, 1]), hard("h1", [1, 1])], [{ id: "h1", zone: { "1,1": "hot" } }]).length, 0);
  assert.equal(suggest([hard("h1", [5, 2]), hard("h1", [5, 2]), { ...hard("h1", [1, 1]), locCell: undefined }, { ...hard("h1", [1, 1]), locCell: undefined }], [{ id: "h1" }]).length, 0);
});
test("ratings: nothing under 10 plate appearances, contact at 10", () => {
  const nine = Array.from({ length: 9 }, () => pa("h1", "k"));
  assert.equal(suggest(nine, [{ id: "h1" }]).filter((s) => s.kind === "rating").length, 0);
  const ten = [...nine, pa("h1", "k")];
  const s = suggest(ten, [{ id: "h1" }]).filter((x) => x.kind === "rating");
  assert.deepEqual(s.map((x) => [x.key, x.value, x.n]), [["contact", "1", 10]], "10 strikeouts in 10: contact 1");
  const fewK = [...Array(9)].map(() => pa("h1", "out")).concat(pa("h1", "out"));
  assert.equal(suggest(fewK, [{ id: "h1" }]).find((x) => x.key === "contact")!.value, "3");
});
test("power: only with 6+ logged balls in play (and 10+ PAs); hard share decides", () => {
  const evs = [...Array(10)].map((_, i) => ({ ...pa("h1", "out"), contact: i < 5 ? "hard" : "weak" }));
  assert.equal(suggest(evs, [{ id: "h1" }]).find((x) => x.key === "power")!.value, "3", "5 hard of 10");
  const fewBip = [...Array(5)].map(() => ({ ...pa("h1", "out"), contact: "hard" })).concat([...Array(5)].map(() => pa("h1", "k")));
  assert.equal(suggest(fewBip, [{ id: "h1" }]).find((x) => x.key === "power"), undefined, "5 balls in play: too few");
});
test("a rating that already matches isn't suggested", () => {
  const ten = [...Array(10)].map(() => pa("h1", "k"));
  assert.equal(suggest(ten, [{ id: "h1", ratings: { contact: 1 } }]).filter((x) => x.key === "contact").length, 0);
});
test("merges: at-bats of a hitter merged into another count for him; the merged one gets none", () => {
  const s = suggest([hard("dup", [1, 1]), hard("h1", [1, 1])], [{ id: "h1", aliases: ["dup"] }, { id: "dup", mergedInto: "h1", deletedAt: 1 }]);
  assert.deepEqual(s.map((x) => [x.hitterId, x.key, x.n]), [["h1", "1,1", 2]]);
});
test("dismissed: quiet until the evidence doubles and grows by 2; a different value asks again", () => {
  const evs3 = [hard("h1", [1, 1]), hard("h1", [1, 1]), hard("h1", [1, 1])];
  const prior = [{ hitter_id: "h1", kind: "zone", key: "1,1", value: "hot", status: "dismissed", decided_n: 2 }];
  assert.equal(suggest(evs3, [{ id: "h1" }], prior).length, 0, "3 vs 2 at dismissal: quiet");
  assert.equal(suggest([...evs3, hard("h1", [1, 1])], [{ id: "h1" }], prior).length, 1, "4 = double and +2: asks again");
  assert.equal(suggest([hard("h1", [1, 1]), hard("h1", [1, 1])], [{ id: "h1" }], [{ ...prior[0], value: "cold" }]).length, 1, "a different value is a new question");
});

test("ratings 1 / 2 / 3 and Unknown: Unknown is stored as unknown and shown as Unknown", () => {
  const s = cleanHitterScouting({ ratings: { power: 3, contact: "unknown", speed: "2", junk: 5 } });
  assert.deepEqual(s.ratings, { power: 3, contact: "unknown", speed: 2 });
  assert.equal(ratingText("unknown"), "Unknown"); assert.equal(ratingText(undefined), "Unknown"); assert.equal(ratingText(1), "1");
  assert.equal(cleanHitterScouting({ ratings: { power: 4 } }).ratings, undefined, "4 isn't a rating");
});
test("zone grid: 5x5 keys only, neutral dropped; a tap cycles hot, cold, neutral", () => {
  assert.deepEqual(cleanHitterScouting({ zone: { "1,1": "hot", "4,4": "cold", "2,2": "neutral", "9,9": "hot" } }).zone, { "1,1": "hot", "4,4": "cold" });
  assert.equal(nextHeat(undefined), "hot"); assert.equal(nextHeat("hot"), "cold"); assert.equal(nextHeat("cold"), undefined);
});
test("spots to cells follow the hitter's side (inside is his side)", () => {
  assert.equal(cellOfSpot("up-in", "R"), "1,1"); assert.equal(cellOfSpot("up in", "L"), "1,3"); assert.equal(cellOfSpot("down-away", "L"), "3,1");
  assert.equal(cellOfSpot("chase-down", "R"), "4,2"); assert.equal(cellOfSpot("nowhere", "R"), null);
});
test("custom fields: only defined, unarchived fields, checked by kind", () => {
  const defs: FieldDef[] = [{ id: "f1", scope: "hitter", kind: "checkbox", label: "Plays first", options: [], position: 0 }, { id: "f2", scope: "hitter", kind: "dropdown", label: "Year", options: ["FR", "SO"], position: 1 },
    { id: "f3", scope: "hitter", kind: "text", label: "Agent", options: [], position: 2 }, { id: "f4", scope: "hitter", kind: "grid", label: "Pull zone", options: [], position: 3 }];
  assert.deepEqual(cleanCustom({ f1: true, f2: "JR", f3: "  ", f4: { "0,0": "hot", x: "hot" }, f9: 1 }, defs), { f1: true, f4: { "0,0": "hot" } });
  assert.deepEqual(cleanCustom({ f2: "SO", f3: "Ann" }, defs), { f2: "SO", f3: "Ann" });
});
test("team tendencies: the listed ones only", () => {
  assert.deepEqual(cleanTeamScouting({ tendencies: { aggressive: true, runs: true, bogus: true, patient: false } }).tendencies, { aggressive: true, runs: true });
});
test("applying scouting never touches the engine's fields (grades, approach / path / off-speed tags)", () => {
  const doc = { id: "h1", name: "A", grades: { c: 4 }, scoutTags: { approach: "aggressive", offspeed: "hits" }, crowd: true };
  const out = applyHitterScouting(doc, cleanHitterScouting({ ratings: { power: 3 }, zone: { "1,1": "hot" }, notes: "x" }), "pull");
  assert.deepEqual(out.grades, { c: 4 }); assert.equal(out.crowd, true);
  assert.deepEqual(out.scoutTags, { approach: "aggressive", offspeed: "hits", spray: "pull" });
  const back = applyHitterScouting(out, {}, null);
  assert.deepEqual(back.scoutTags, { approach: "aggressive", offspeed: "hits" }); assert.equal("ratings" in back, false);
});
