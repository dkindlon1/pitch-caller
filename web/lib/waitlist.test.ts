// Run: npm test (node's built-in runner; Node strips the TypeScript types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, handleWaitlist, type WaitlistDeps } from "./waitlist.ts";

function fakeDeps(reply = "ok") {
  const calls: unknown[][] = [];
  const deps: WaitlistDeps = {
    join: async (...a) => { calls.push(a); return reply; },
    hashIp: async (ip) => `hash:${ip}`,
  };
  return { deps, calls };
}

test("a valid sign-up is stored with a lowercased email and the hashed IP", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handleWaitlist({ email: "  Coach@School.EDU ", role: "coach", level: "hs" }, "1.2.3.4", deps);
  assert.deepEqual(r, { status: "ok", httpStatus: 200 });
  assert.deepEqual(calls, [["coach@school.edu", "coach", "hs", "hash:1.2.3.4"]]);
});

test("level is optional", async () => {
  const { deps, calls } = fakeDeps();
  assert.equal((await handleWaitlist({ email: "a@b.co", role: "parent", level: "" }, "x", deps)).status, "ok");
  assert.equal(calls[0][2], null);
});

test("a filled honeypot looks like success and stores nothing", async () => {
  const { deps, calls } = fakeDeps();
  const r = await handleWaitlist({ email: "a@b.co", role: "coach", company: "Acme" }, "x", deps);
  assert.equal(r.status, "ok");
  assert.equal(calls.length, 0);
});

test("bad input is rejected before the database", async () => {
  const { deps, calls } = fakeDeps();
  for (const body of [null, "x", {}, { email: "nope", role: "coach" }, { email: "a@b.co", role: "admin" },
    { email: "a@b.co", role: "coach", level: "mlb" }, { email: "a".repeat(320) + "@b.co", role: "coach" }]) {
    assert.deepEqual(await handleWaitlist(body, "x", deps), { status: "invalid", httpStatus: 400 }, JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
});

test("database answers map to the right status codes, and a repeat sign-up looks like a new one", async () => {
  for (const [reply, status, http] of [["duplicate", "ok", 200], ["rate_limited", "rate_limited", 429], ["invalid", "invalid", 400], ["weird", "error", 502]] as const) {
    const { deps } = fakeDeps(reply);
    assert.deepEqual(await handleWaitlist({ email: "a@b.co", role: "coach" }, "x", deps), { status, httpStatus: http });
  }
});

test("a database failure is an error, not a crash", async () => {
  const deps: WaitlistDeps = { join: async () => { throw new Error("down"); }, hashIp: async () => "h" };
  assert.deepEqual(await handleWaitlist({ email: "a@b.co", role: "coach" }, "x", deps), { status: "error", httpStatus: 502 });
});

test("without the server keys the form says sign-ups aren't open", async () => {
  assert.deepEqual(await handleWaitlist({ email: "a@b.co", role: "coach" }, "x", null), { status: "unavailable", httpStatus: 503 });
});

test("the client IP is the first x-forwarded-for address", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientIp(new Headers({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientIp(new Headers()), "");
});
