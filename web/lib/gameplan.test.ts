import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, openable, type PlanInput, type Known } from "./gameplan.ts";

const known: Known = {
  pitcherIds: new Set(["p1", "p2", "p3"]), opponentIds: new Set(["t1", "t2"]), catcherIds: new Set(["c1"]),
  hitterIds: new Map([["h1", "t1"], ["h2", "t1"], ["h9", "t2"]]),
};
const base: PlanInput = {
  date: "2026-11-15", time: "13:00", home: true, innings: null, extrasRunner: false, level: "college_d3", opponentId: "t1", newOpponent: "",
  staffIds: ["p1", "p2"], starterId: "p2", catcherId: "c1", lineup: [{ hitterId: "h1", name: "Smith", hand: "L" }, { hitterId: null, name: "Diaz", hand: "S" }],
  inputs: 3, logLoc: true, radar: false, umpSeed: "wide",
};

test("a full plan becomes the game app's games record, starter first", () => {
  const { doc, errors } = buildPlan(base, known);
  assert.deepEqual(errors, []);
  assert.ok(doc);
  assert.equal(doc.status, "planned");
  assert.equal(doc.deviceId, null);
  assert.deepEqual(doc.staffIds, ["p2", "p1"]);
  assert.equal(doc.starterId, "p2");
  assert.equal(doc.lineup.length, 9, "padded to nine slots like the app's lineup");
  assert.deepEqual(doc.lineup[0], { hitterId: "h1", name: "Smith", hand: "L" });
  assert.deepEqual(doc.lineup[1], { hitterId: null, name: "Diaz", hand: "S" });
  assert.deepEqual(doc.setup, { engine: "v09", home: true, innings: null, extrasRunner: false, umpSeed: "wide" });
  assert.equal(doc.inputs, 3); assert.equal(doc.logLoc, true); assert.equal(doc.time, "13:00");
});

test("bad or stale input is refused with the step to fix", () => {
  const r = buildPlan({ ...base, date: "next sat", staffIds: ["gone"], level: "mlb", innings: 20 }, known);
  assert.equal(r.doc, null);
  assert.deepEqual(r.errors.map((e) => e.step).sort(), [1, 1, 1, 2]);
});

test("a hitter from another team, an unknown catcher and odd settings are dropped, not trusted", () => {
  const { doc } = buildPlan({ ...base, catcherId: "cX", lineup: [{ hitterId: "h9", name: "Wrong", hand: "R" }], inputs: 9, umpSeed: "huge", time: "25:00" }, known);
  assert.ok(doc);
  assert.equal(doc.catcherId, null);
  assert.equal(doc.lineup[0].hitterId, null);
  assert.equal(doc.inputs, 2); assert.equal(doc.setup.umpSeed, "normal"); assert.equal(doc.time, null);
});

test("a new opponent needs a name; a game that started can't be re-planned", () => {
  assert.equal(buildPlan({ ...base, opponentId: "__new", newOpponent: "" }, known).errors[0].step, 1);
  const prev = { ...buildPlan(base, known).doc!, status: "live" as const, deviceId: "dev_a", id: "gam_1" };
  assert.equal(buildPlan(base, known, prev).doc, null);
});

test("editing keeps the record's id and stamps", () => {
  const prev = { ...buildPlan(base, known).doc!, id: "gam_1", createdAt: 5, updatedAt: 9 };
  const { doc } = buildPlan({ ...base, starterId: "p1" }, known, prev);
  assert.equal(doc!.id, "gam_1"); assert.equal(doc!.createdAt, 5); assert.deepEqual(doc!.staffIds, ["p1", "p2"]);
});

test("a game opens on one device only", () => {
  assert.equal(openable({ status: "planned", deviceId: null }, "dev_a"), "ok");
  assert.equal(openable({ status: "live", deviceId: "dev_a" }, "dev_a"), "resume");
  assert.equal(openable({ status: "live", deviceId: "dev_a" }, "dev_b"), "elsewhere");
  assert.equal(openable({ status: "suspended", deviceId: "dev_a" }, "dev_b"), "elsewhere");
  assert.equal(openable({ status: "final", deviceId: "dev_a" }, "dev_a"), "over");
  assert.equal(openable(null, "dev_a"), "missing");
});
