import { test } from "node:test";
import assert from "node:assert/strict";
import { ageAnswer, safeNext } from "./age.ts";

const NOV_5_2026 = new Date(Date.UTC(2026, 10, 5));

test("13 or older only when every day of that birth month is 13 years back", () => {
  assert.equal(ageAnswer(10, 2013, NOV_5_2026), "13plus");    // born October 2013: 13 whatever the day
  assert.equal(ageAnswer(11, 2013, NOV_5_2026), "under13");   // November 2013: could still be 12, so under 13
  assert.equal(ageAnswer(12, 2013, NOV_5_2026), "under13");
  assert.equal(ageAnswer(1, 1990, NOV_5_2026), "13plus");
  assert.equal(ageAnswer(6, 2020, NOV_5_2026), "under13");
});

test("a missing or impossible birth date is no answer", () => {
  assert.equal(ageAnswer(0, 2000, NOV_5_2026), null);
  assert.equal(ageAnswer(13, 2000, NOV_5_2026), null);
  assert.equal(ageAnswer(NaN, 2000, NOV_5_2026), null);
  assert.equal(ageAnswer(5, 2027, NOV_5_2026), null);          // the future
  assert.equal(ageAnswer(12, 2026, NOV_5_2026), null);         // later this year
  assert.equal(ageAnswer(5, 1800, NOV_5_2026), null);
});

test("sign-in only goes on to a path on this site", () => {
  assert.equal(safeNext("/join/abc"), "/join/abc");
  assert.equal(safeNext("/app?x=1"), "/app?x=1");
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "", null, undefined, ["/app"], "/app<script>"]) {
    assert.equal(safeNext(bad), "/app", String(bad));
  }
});
