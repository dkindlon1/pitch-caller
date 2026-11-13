import { test } from "node:test";
import assert from "node:assert/strict";
import { allow, checkContact, contactMail } from "./contact.ts";

const good = { name: " Sam  Ortiz ", email: "Sam@School.edu", role: "Head coach", level: "High school", org: "Central HS", message: "We have 6 pitchers and want help calling games." };

test("a complete message passes and is tidied", () => {
  const r = checkContact(good);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.name, "Sam Ortiz"); assert.equal(r.value.email, "sam@school.edu"); }
});

test("each missing or bad field gets its own message", () => {
  const r = checkContact({ name: "", email: "nope", role: "Coach", level: "", message: "hi" });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["email", "level", "message", "name", "role"]);
});

test("the email escapes what people type", () => {
  const r = checkContact({ ...good, message: "<script>x</script> please" });
  assert.ok(r.ok);
  if (r.ok) assert.ok(!contactMail(r.value, "a@b.co").html.includes("<script>"));
});

test("five messages an hour per address, then no", () => {
  const t = 1_000_000;
  for (let n = 0; n < 5; n++) assert.ok(allow("x", t + n));
  assert.equal(allow("x", t + 10), false);
  assert.ok(allow("x", t + 3_600_100));
});
