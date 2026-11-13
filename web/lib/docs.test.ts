import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { KINDS, PITCH_TYPES, PROFILE_LABEL, SIGN, SLOTS, newHitter, newPitch, newPitcher, parseHitters, parseRoster, stamp, uid } from "./docs.ts";

const require = createRequire(import.meta.url);
const PCDB = require("../../app/db.js");

test("records have the iPad's shapes", () => {
  assert.deepEqual(PITCH_TYPES, PCDB.PITCH_TYPES);
  assert.deepEqual(Object.keys(newPitcher("t")).sort(), Object.keys(PCDB.newPitcher("t")).sort());
  assert.deepEqual(Object.keys(newPitch("Slider")).sort(), Object.keys(PCDB.newPitch("Slider")).sort());
  assert.deepEqual(Object.keys(newHitter("t")).sort(), Object.keys(PCDB.newHitter("t")).sort());
  const strip = (p: { pitches: { id: string }[] }) => ({ ...p, pitches: p.pitches.map(({ id, ...x }) => x) });
  assert.deepEqual(strip(newPitcher("t")), strip(PCDB.newPitcher("t")));
  assert.match(uid("pit"), /^pit_[a-z0-9]{8,9}[a-z0-9]{20}$/);
  const src = readFileSync(new URL("../../app/index.src.html", import.meta.url), "utf8");
  assert.ok(src.includes(`const KINDS = ${JSON.stringify(KINDS).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ").replace(/\{/, "{ ").replace(/\}$/, " }")}`), "same pitch kinds as the app");
  assert.ok(src.includes(`const SLOT_OPTS = ${JSON.stringify(SLOTS).replace(/,/g, ", ")};`), "same arm slots as the app");
  // v1.1 Step 5: the same profile names as the app
  const pl = src.slice(src.indexOf("const PROFILE_LABEL = {") + "const PROFILE_LABEL = ".length, src.indexOf("};", src.indexOf("const PROFILE_LABEL = {")) + 1);
  assert.deepEqual(new Function(`return ${pl}`)(), PROFILE_LABEL, "same profile names as the app");
  assert.ok(src.includes(`const SIGN = { FB: ${SIGN.FB}, CB: ${SIGN.CB}, SL: ${SIGN.SL}, CH: ${SIGN.CH}, SI: ${SIGN.SI}, FC: ${SIGN.FC} }`), "same signs as the app (six kinds)");
});

test("a record going up is always newer than the one it replaces", () => {
  const a = stamp({ name: "x" }, "pit");
  assert.ok(a.id.startsWith("pit_") && a.createdAt === a.updatedAt);
  const b = stamp({ ...a, updatedAt: Date.now() + 5000 }, "pit");
  assert.ok(b.updatedAt > Date.now() + 4000 && b.id === a.id && b.createdAt === a.createdAt);
});

test("a pasted roster", () => {
  assert.deepEqual(parseRoster("12 Smith\nJones 7\n#3 Diaz L\nAvery Brooks\n\n  "), [
    { name: "Smith", number: "12", hand: "R" }, { name: "Jones", number: "7", hand: "R" }, { name: "Diaz", number: "3", hand: "L" }, { name: "Avery Brooks", number: "", hand: "R" }]);
  assert.equal(parseRoster("x\n".repeat(200)).length, 80);
});

test("nine hitters typed fast", () => {
  assert.deepEqual(parseHitters("12 Smith R\nJones L\n#3 Diaz S\n5 Lee"), [
    { name: "Smith", number: "12", bats: "R" }, { name: "Jones", number: "", bats: "L" }, { name: "Diaz", number: "3", bats: "S" }, { name: "Lee", number: "5", bats: "R" }]);
});

test("the portal's pitch-count rules are the iPad's", () => {
  assert.equal(readFileSync(new URL("./pitch_rules.js", import.meta.url), "utf8"), readFileSync(new URL("../../app/pitch_rules.js", import.meta.url), "utf8"));
  assert.equal(readFileSync(new URL("./pc_import.js", import.meta.url), "utf8"), readFileSync(new URL("../../app/import.js", import.meta.url), "utf8"), "web/lib/pc_import.js is app/import.js");
  assert.equal(readFileSync(new URL("./engine.js", import.meta.url), "utf8"), readFileSync(new URL("../../app/engine.js", import.meta.url), "utf8"), "the site's demo runs the game app's engine");
  assert.equal(readFileSync(new URL("./engine_data.json", import.meta.url), "utf8"), readFileSync(new URL("../../app/engine_data.json", import.meta.url), "utf8"), "with the same tables");
});
