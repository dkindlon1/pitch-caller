/*
 * Sign-in and the session (app/sync.js supabaseAuth), with a stand-in for Supabase Auth's /auth/v1/token. Run: node app/sync_auth_test.js
 * Checks the requests the app sends and what it keeps; it is not a test of Supabase's own auth server.
 */
const PCSync = require("./sync.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const memDb = () => { const m = new Map(); return { get: async (s, id) => m.get(s + "/" + id) || null, put: async (s, x) => (m.set(s + "/" + x.id, x), x), del: async (s, id) => m.delete(s + "/" + id) }; };

(async () => {
  let clock = 1_000_000, calls = [];
  const fetch = async (url, opts) => {
    const body = JSON.parse(opts.body); calls.push({ url, body, apikey: opts.headers.apikey });
    if (url.endsWith("grant_type=password")) {
      if (body.password !== "right") return { ok: false, status: 400, json: async () => ({ error_description: "Invalid login credentials" }) };
      return { ok: true, status: 200, json: async () => ({ access_token: "A1", refresh_token: "R1", expires_in: 3600, user: { id: "u1", email: body.email } }) };
    }
    if (url.endsWith("grant_type=refresh_token")) {
      if (body.refresh_token !== "R1") return { ok: false, status: 400, json: async () => ({ error_description: "Invalid Refresh Token" }) };
      return { ok: true, status: 200, json: async () => ({ access_token: "A2", refresh_token: "R2", expires_in: 3600, user: { id: "u1", email: "c@x" } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const db = memDb();
  const auth = PCSync.supabaseAuth({ url: "https://proj.supabase.co/", apiKey: "anon", db, fetch, now: () => clock });

  console.log("1. Sign in");
  let err = null; try { await auth.signIn("c@x", "wrong"); } catch (e) { err = e.message; }
  check(err === "Invalid login credentials" && !(await auth.session()), "a wrong password shows Supabase's message and keeps no session");
  const s = await auth.signIn("c@x", "right");
  check(calls.at(-1).url === "https://proj.supabase.co/auth/v1/token?grant_type=password" && calls.at(-1).apikey === "anon", "asks /auth/v1/token with the anon key (no doubled slash)");
  check(s.access === "A1" && s.email === "c@x" && s.userId === "u1" && (await auth.session()).refresh === "R1", "keeps the session on the device");

  console.log("2. The token");
  const before = calls.length;
  check(await auth.token() === "A1" && calls.length === before, "a fresh token is used as is, with no request");
  clock += 3600_000 - 30_000;   // 30 s before it expires
  check(await auth.token() === "A2" && calls.at(-1).body.refresh_token === "R1", "within a minute of expiry it's refreshed with the refresh token");
  check((await auth.session()).refresh === "R2", "and the new refresh token is kept");
  clock += 3600_000 * 5;
  calls = [];
  let e2 = null; try { await PCSync.supabaseAuth({ url: "https://proj.supabase.co", apiKey: "anon", db, fetch, now: () => clock }).token(); } catch (e) { e2 = e.message; }
  check(e2 === "Invalid Refresh Token", "a refresh the server refuses (R2 unknown here) is an error, not a silent anonymous call");

  console.log("3. Several calls needing a token at once");
  {
    const db2 = memDb(); let refreshes = 0, t = 1_000_000;
    const slow = async (url, opts) => {
      if (url.endsWith("grant_type=password")) return { ok: true, status: 200, json: async () => ({ access_token: "A1", refresh_token: "R1", expires_in: 3600, user: { id: "u1", email: "c@x" } }) };
      refreshes++; await new Promise((r) => setTimeout(r, 30));
      return { ok: true, status: 200, json: async () => ({ access_token: "A" + (refreshes + 1), refresh_token: "R" + (refreshes + 1), expires_in: 3600, user: { id: "u1", email: "c@x" } }) };
    };
    const au = PCSync.supabaseAuth({ url: "https://proj.supabase.co", apiKey: "anon", db: db2, fetch: slow, now: () => t });
    await au.signIn("c@x", "pw"); t += 3600_000;
    const got = await Promise.all([au.token(), au.token(), au.token()]);
    check(refreshes === 1 && new Set(got).size === 1, `three at once near expiry: one refresh, the same token for all (${refreshes} refresh${refreshes === 1 ? "" : "es"})`);
  }

  console.log("4. Sign out");
  await auth.signOut();
  check(await auth.session() === null && await auth.token() === null, "sign out forgets the session; no token after");

  console.log(fails ? `\n${fails} auth check(s) FAILED` : "\nall auth checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
