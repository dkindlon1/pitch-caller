/*
 * The 12-month retention sweep (app/api/cron/retention) against a real local Supabase and the built site: the cron
 * secret is required, a run reports what's due and deletes nothing while RETENTION_DELETE is off, and with it on the
 * organization locked over 12 months ago loses its teams, records, export rows and export files, while one locked a
 * month ago keeps everything. Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start`:
 *   node web/tests/retention_e2e.js
 */
const { Client } = require("pg");
const path = require("path"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3198, SITE = `http://localhost:${PORT}`;
const CLI = ["-y", "supabase@2.122.1"], CRON = "cron-secret-e2e";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", [...CLI, "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());

(async () => {
  let S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  console.log("(resetting the local database: migrations applied fresh)");
  execFileSync("npx", [...CLI, "db", "reset", "--local"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  S = status();
  const API = S.API_URL, SECRET = S.SECRET_KEY;
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  const store = async (method, p, body, type = "application/zip") => {
    for (let i = 0; ; i++) {
      const res = await fetch(`${API}/storage/v1/object/${p}`, { method, headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, ...(body ? { "content-type": type } : {}) }, body });
      if (res.status === 503 && i < 20) { await wait(500); continue; }
      return res;
    }
  };
  const exists = async (p) => (await store("GET", `exports/${p}`)).ok;

  // two organizations, each with a team, a pitcher, and a lapse export (row and file): one locked 13 months ago, one 1
  const owner = (await (await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@test.local", password: "test-pass-1234", email_confirm: true }) })).json()).id;
  const make = async (name, months) => {
    const org = (await db.query("insert into public.organizations (name, owner_id, billing_status, billing_changed_at) values ($1, $2, 'locked', now() - make_interval(months => $3)) returning id", [name, owner, months])).rows[0].id;
    const team = (await db.query("insert into public.programs (org_id, name, level) values ($1, 'Varsity', 'hs') returning id", [org])).rows[0].id;
    await db.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p1', $2)", [team, { id: "p1", updatedAt: 1, name: "Pitcher" }]);
    const file = `${org}/20251001000000/${team}/team.zip`;
    const up = await store("POST", `exports/${file}`, new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)]));
    await db.query("insert into public.exports (org_id, program_id, lapse_at, kind, user_id, path, rows, bytes, link_expires_at) values ($1, $2, now() - make_interval(months => $3), 'coach', $4, $5, 1, 22, now())", [org, team, months, owner, file]);
    return { org, team, file, uploaded: up.ok };
  };
  const old = await make("Gone Baseball", 13), recent = await make("Lapsed Baseball", 1);
  check(old.uploaded && recent.uploaded && await exists(old.file) && await exists(recent.file), "set up: two locked organizations, each with an export file in storage");

  const count = async (o) => (await db.query("select (select count(*) from public.organizations where id = $1) o, (select count(*) from public.programs where org_id = $1) t, (select count(*) from public.pitchers where program_id = $2) p, (select count(*) from public.exports where org_id = $1) e", [o.org, o.team])).rows[0];
  const all = (c, n) => +c.o === n && +c.t === n && +c.p === n && +c.e === n;
  let web, webLog = "";
  const start = async (env) => {
    web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
      cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: S.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
    for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) return; } catch {} await wait(500); }
  };
  const stop = async () => { web.kill(); await new Promise((r) => web.once("exit", r)); };
  const sweep = async (auth) => { const r = await fetch(SITE + "/api/cron/retention", { headers: auth ? { authorization: auth } : {} }); return { status: r.status, body: await r.json().catch(() => null) }; };

  try {
    console.log("1. Without the cron secret set, the route does nothing");
    await start({});
    let r = await sweep(`Bearer ${CRON}`);
    check(r.status === 503 && r.body.error === "not_configured", `503 not_configured (${r.status})`);
    await stop();

    console.log("2. Reporting only (RETENTION_DELETE off)");
    await start({ CRON_SECRET: CRON });
    r = await sweep(null); const r2 = await sweep("Bearer wrong-secret-xx");
    check(r.status === 401 && r2.status === 401, `no or a wrong secret: 401 (${r.status}, ${r2.status})`);
    r = await sweep(`Bearer ${CRON}`);
    check(r.status === 200 && r.body.deleted === false && r.body.orgs === 1 && r.body.teams === 1 && r.body.exports === 1 && r.body.files === 1, `it reports the one organization due (${JSON.stringify(r.body)})`);
    check(all(await count(old), 1) && await exists(old.file), "and deletes nothing");
    await stop();

    console.log("3. Deleting (RETENTION_DELETE=on)");
    await start({ CRON_SECRET: CRON, RETENTION_DELETE: "on" });
    r = await sweep(`Bearer ${CRON}`);
    check(r.status === 200 && r.body.deleted === true && r.body.orgs === 1 && r.body.files === 1, `it deletes (${JSON.stringify(r.body)})`);
    check(all(await count(old), 0) && !(await exists(old.file)), "the organization locked 13 months ago: rows and export file gone");
    check(all(await count(recent), 1) && await exists(recent.file), "the one locked a month ago: untouched");
    r = await sweep(`Bearer ${CRON}`);
    check(r.status === 200 && r.body.orgs === 0 && r.body.files === 0, "the next run finds nothing more");
    const logs = (await db.query("select dry, orgs from private.retention_log order by id")).rows.map((x) => `${x.dry ? "dry" : "wet"}:${x.orgs}`).join(" ");
    check(logs === "dry:1 dry:1 wet:1 dry:0 wet:0", `every run is logged (${logs})`);
    await stop();
  } catch (e) {
    fails++; console.error(e); console.error(webLog.slice(-3000));
  } finally {
    if (web && web.exitCode === null) web.kill();
    await db.end();
  }
  console.log(fails ? `\n${fails} retention check(s) FAILED` : "\nall retention checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
