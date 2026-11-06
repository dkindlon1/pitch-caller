import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bats, call, makeArsenal, newGame, reason, record } from "./demo.ts";

const req = createRequire(import.meta.url);
const E = req("./engine.js");
E.init(req("./engine_data.json"));
// a seeded generator, so the engine's draw from its mix is the same every run
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("the demo calls with the game app's engine and keeps the count", () => {
  const ars = makeArsenal(E), rng = seeded(7);
  let g = newGame();
  const c = call(E, ars, g, rng);
  assert.ok(["Fastball", "Slider", "Changeup"].includes(c.pitch) && c.prob > 0 && c.prob <= 1 && c.mix.length >= 1);
  assert.match(reason(c, g), /^Picked at random from the mix, where it comes up \d+% of the time\./);
  g = record(E, ars, g, c, "ball"); g = record(E, ars, g, call(E, ars, g, rng), "ball"); g = record(E, ars, g, call(E, ars, g, rng), "ball");
  assert.equal(`${g.balls}-${g.strikes}`, "3-0");
  for (let i = 0; i < 20; i++) assert.notEqual(call(E, ars, g, seeded(i)).quad, "chase", "never a chase pitch at 3-0 (the app's rule W1)");
  assert.match(reason(call(E, ars, g, rng), g), /No chase pitch at 3-0 or 3-1\./);
  g = record(E, ars, g, call(E, ars, g, rng), "ball");
  assert.deepEqual([g.balls, g.strikes, g.batter, g.bases, g.ended], [0, 0, 1, [true, false, false], ["Walk"]]);
});

test("strikeouts, fouls with two strikes, outs and the inning", () => {
  const ars = makeArsenal(E), rng = seeded(3);
  let g = newGame();
  for (const r of ["cstrike", "whiff", "foul", "foul", "whiff"] as const) g = record(E, ars, g, call(E, ars, g, rng), r);
  assert.deepEqual([g.outs, g.batter, g.ended[0]], [1, 1, "Strikeout swinging"], "fouls with two strikes keep the count");
  g = record(E, ars, g, call(E, ars, g, rng), "out");
  g = record(E, ars, g, call(E, ars, g, rng), "hit");
  assert.deepEqual(g.bases, [true, false, false]);
  g = record(E, ars, g, call(E, ars, g, rng), "out");
  assert.deepEqual([g.inning, g.outs, g.bases, g.ended], [2, 0, [false, false, false], ["Out in play", "Side retired. Inning 2."]]);
  assert.equal(bats({ ...g, batter: 2 }), "L"); assert.equal(bats({ ...g, batter: 8 }), "L", "the switch hitter bats left against a right-hander");
});
