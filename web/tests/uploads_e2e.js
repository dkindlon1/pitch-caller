/*
 * Uploads, proposals and stats (Plan 4) against a real local Supabase and the built site. The spec's walkthrough step 2:
 * a player uploads a TrackMan file, leaves out 3 warmups, marks 1 pitch developing and accepts the velocity proposal.
 * Then: a pitching coach sees it waiting and accepts the shape; a pitch caller can only look; a TrackMan game file
 * feeds the stats next to games called in PitchIQ, with every rate's sample shown; a file nobody recognizes is read
 * with a column match the team keeps; a teammate sees none of it.
 * Run from the repo root after `npm run build` in web/, with `npx supabase@2.122.1 start` running:
 *   node web/tests/uploads_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const path = require("path"), fs = require("fs"), os = require("os"), { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3199, SITE = `http://localhost:${PORT}`;
const CLI = ["-y", "supabase@2.122.1"];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", [...CLI, "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());
const ago = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// TrackMan V3 columns. These files write a right-hander's arm side as negative HorzBreak / RelSide, the opposite of
// the real TrackMan V3 data in tests/data/Track_Combo.csv, so the parser's flip is exercised here too
const HEAD = "PitchNo,Date,Time,Pitcher,PitcherThrows,Batter,BatterSide,Inning,Balls,Strikes,TaggedPitchType,AutoPitchType,PitchCall,KorBB,PlayResult,RelSpeed,SpinRate,RelHeight,RelSide,Extension,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide,ExitSpeed";
const tm = (n, date, o) => [n, date, "18:00:00", `"${o.name || "Brooks, Avery"}"`, "Right", '"Hitter, A"', o.side || "Right", 1, o.balls ?? 0, o.strikes ?? 0, o.type, o.type,
  o.call || "Undefined", "Undefined", "Undefined", o.velo, 2250, 5.8, -1.9, 6.1, o.ivb, o.hb, 2.5, 0.1, o.exit ?? ""].join(",");
function bullpen(date) {
  const L = [HEAD]; let n = 0;
  for (let i = 0; i < 3; i++) L.push(tm(++n, date, { type: "Fastball", velo: 75, ivb: 14, hb: -7 }));              // warmups
  for (const v of [90, 91, 92, 90, 91, 92, 90, 91, 92, 90, 91, 92]) L.push(tm(++n, date, { type: "Fastball", velo: v, ivb: 17, hb: -9 }));
  for (let i = 0; i < 12; i++) L.push(tm(++n, date, { type: "Slider", velo: 82, ivb: 2, hb: 6 }));
  for (let i = 0; i < 4; i++) L.push(tm(++n, date, { type: "Splitter", velo: 83, ivb: 3, hb: -9 }));
  return L.join("\n");
}
function gameFile(date) {
  const L = [HEAD]; let n = 0;
  const calls = ["StrikeCalled", "StrikeCalled", "StrikeCalled", "StrikeCalled", "StrikeSwinging", "StrikeSwinging", "FoulBall", "FoulBallNotFieldable", "InPlay", "BallCalled", "BallCalled", "BallinDirt"];
  for (const c of calls) L.push(tm(++n, date, { type: "Fastball", velo: 93, ivb: 18, hb: -10, call: c, exit: c === "InPlay" ? 100.4 : "", side: "Left" }));
  for (let i = 0; i < 3; i++) L.push(tm(++n, date, { name: "Other, Guy", type: "Fastball", velo: 85, ivb: 15, hb: -8, call: "BallCalled" }));
  return L.join("\n");
}
// a TrackMan file with two pitchers known only by ID (as in Track_Combo.csv): it isn't his alone
const TWO = "PitcherId,PitcherThrows,TaggedPitchType,RelSpeed,InducedVertBreak,HorzBreak\n" +
  Array.from({ length: 12 }, (_, i) => `${i % 2 ? 1000023 : 1000077},Right,Fastball,${89 + (i % 3)},17,9`).join("\n") + "\n";
const ODD = "Throw,MPH,Up,Over,When\n" + Array.from({ length: 10 }, (_, i) => `Fastball,${88 + (i % 2)},16,8,${ago(10)}`).join("\n") + "\n";

(async () => {
  let S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase: " + S.API_URL);
  console.log("(resetting the local database: migrations applied fresh)");
  execFileSync("npx", [...CLI, "db", "reset", "--local"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  S = status();
  const API = S.API_URL, PUB = S.PUBLISHABLE_KEY, SECRET = S.SECRET_KEY;
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  const http = async (method, url, { key = PUB, token, body } = {}) => {
    for (let i = 0; ; i++) {
      const res = await fetch(API + url, { method, headers: { apikey: key, authorization: `Bearer ${token || key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => null);
      if (res.status === 503 && i < 20) { await wait(500); continue; }
      if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
      return json;
    }
  };
  const PASS = "test-pass-1234", U = {};
  for (const n of ["coach", "asst", "caller", "kid", "kid2"]) U[n] = (await http("POST", "/auth/v1/admin/users", { key: SECRET, body: { email: `${n}@test.local`, password: PASS, email_confirm: true } })).id;
  const tokenOf = async (n) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${n}@test.local`, password: PASS } })).access_token;
  const rpc = async (n, fn, args = {}) => http("POST", `/rest/v1/rpc/${fn}`, { token: await tokenOf(n), body: args });
  const org = await rpc("coach", "pc_create_org", { name: "RIT Baseball", level: "college_d3" });
  const team = await rpc("coach", "pc_create_team", { org, name: "RIT Tigers", level: "college_d3", timezone: "America/New_York", join_as: "head" });
  await db.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await db.query("update public.programs set status = 'active' where id = $1", [team]);
  const t0 = Date.now(), P1 = "pit_kid1aaaaaaaaaaaaaaaaaaaaaaaa", P2 = "pit_kid2bbbbbbbbbbbbbbbbbbbbbbbb", OURS = "tea_ours0000000000000000000000";
  const pitch = (id, name, type, kind, shape) => ({ id, type, name, kind, shape, grade: 3, command: 3, feel: 0.7, velo: "", ivb: "", hb: "", spin: "", active: true });
  await rpc("coach", "pc_push", { p: team, tbl: "teams", rows: [{ id: OURS, createdAt: t0, updatedAt: t0, name: "RIT Tigers", isOurs: true }] });
  await rpc("coach", "pc_push", { p: team, tbl: "pitchers", rows: [
    { id: P1, createdAt: t0, updatedAt: t0, teamId: OURS, name: "Avery Brooks", number: "21", hand: "R", role: "SP", slot: "three-quarter", height_ft: 6.1, notes: "",
      pitches: [pitch("pt_fb1", "Fastball", "Four-seam", "FB", "ride"), pitch("pt_sl1", "Slider", "Slider", "SL", "tight")] },
    { id: P2, createdAt: t0, updatedAt: t0, teamId: OURS, name: "Sam Lee", number: "7", hand: "L", role: "RP", notes: "", pitches: [pitch("pt_fb2", "Fastball", "Four-seam", "FB", "ride")] }] });
  // a game called in PitchIQ five days ago: 4 pitches
  await rpc("coach", "pc_push", { p: team, tbl: "games", rows: [{ id: "gm_piq", createdAt: t0, updatedAt: t0, date: ago(5), status: "final" }] });
  await rpc("coach", "pc_push", { p: team, tbl: "events", rows: [["0-0", "cstrike"], ["0-1", "whiff"], ["0-2", "whiff"], ["0-0", "ball"]].map(([count, res], i) =>
    ({ id: `ev_${i}`, createdAt: t0, updatedAt: t0, type: "pitch", gameId: "gm_piq", pitcherId: P1, count, res, pitchName: "Fastball", kind: "FB", n: i + 1 })) });
  for (const [who, pid] of [["kid", P1], ["kid2", P2]]) await rpc(who, "pc_accept_invite", { tok: await rpc("coach", "pc_invite", { p: team, member_role: "player", pitcher: pid, invite_email: null, under13: false }) });
  for (const [who, role] of [["asst", "pitching"], ["caller", "caller"]]) await rpc(who, "pc_accept_invite", { tok: await rpc("coach", "pc_invite", { p: team, member_role: role, pitcher: null, invite_email: null, under13: false }) });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pq-uploads-"));
  const files = { pen: path.join(tmp, "avery_bullpen.csv"), game: path.join(tmp, "game_trackman.csv"), odd: path.join(tmp, "yakker.csv"), two: path.join(tmp, "two_pitchers.csv") };
  fs.writeFileSync(files.pen, bullpen(ago(1))); fs.writeFileSync(files.game, gameFile(ago(3))); fs.writeFileSync(files.odd, ODD); fs.writeFileSync(files.two, TWO);

  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: API, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let webLog = ""; web.stdout.on("data", (d) => (webLog += d)); web.stderr.on("data", (d) => (webLog += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }

  const browser = await chromium.launch();
  const errs = [];
  const fresh = async () => { const p = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage(); p.on("pageerror", (e) => errs.push(String(e))); return p; };
  const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); };
  const text = async (p, re) => { let t = ""; for (let i = 0; i < 60; i++) { t = (await p.locator("main:visible").first().innerText().catch(() => "")).replace(/\s+/g, " "); if (!re || re.test(t)) return t; await wait(200); } return t; };
  const goto = async (p, u) => { const r = await p.goto(SITE + u); await settle(p); return r; };
  const click = async (p, locator, to) => { const before = p.url(); await locator.click(); await p.waitForURL(to || ((u) => u.href !== before), { timeout: 15000 }).catch(() => {}); await settle(p); };
  const signIn = async (p, n) => {
    await goto(p, "/login?next=/app");
    const f = p.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${n}@test.local`); await f.getByLabel("Password").fill(PASS);
    await f.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL((u) => u.pathname === "/app", { timeout: 10000 }).catch(() => {}); await settle(p);
  };
  const doc = async (id) => (await db.query("select doc from public.pitchers where program_id = $1 and id = $2", [team, id])).rows[0].doc;
  const pending = async () => (await db.query("select field, pitch_id, value from public.proposals where program_id = $1 and pitcher_id = $2 and status = 'pending' order by field, pitch_id", [team, P1])).rows;
  const until = async (fn) => { for (let i = 0; i < 60; i++) { if (await fn()) return true; await wait(250); } return false; };
  const shots = path.join(ROOT, "web/tests/screens"); fs.mkdirSync(shots, { recursive: true });
  const me = `/app/me/${team}/${P1}`;

  try {
    console.log("1. A player uploads a TrackMan bullpen (D10 in the browser)");
    const kid = await fresh();
    await signIn(kid, "kid");
    await goto(kid, `${me}/uploads`);
    await kid.getByLabel("Pitch file").setInputFiles(files.pen);
    const pre = await text(kid, /31 pitches ·/);
    check(/31 pitches/.test(pre) && /TrackMan/.test(pre) && /break flipped to arm side/.test(pre) && /Four-seam 15 · Slider 12 · Splitter 4/.test(pre), `read in the browser: 31 pitches, TrackMan, arm side (${pre.slice(0, 160)})`);
    check(await kid.locator("select[name=session_type]").inputValue() === "bullpen" && await kid.locator("input[name=session_date]").inputValue() === ago(1), "a bullpen (no counts in it), dated from the file");
    await kid.screenshot({ path: path.join(shots, "upload-preview.png"), fullPage: true });
    await click(kid, kid.getByRole("button", { name: "Upload 31 pitches" }), /\/uploads\/[0-9a-f-]{36}/);
    const upId = (kid.url().match(/uploads\/([0-9a-f-]{36})/) || [])[1];
    const st = (await db.query("select u.source, u.session_type, u.session_date::text d, u.n_pitches, (select count(*) from public.upload_pitches x where x.upload_id = u.id)::int c, (select max(hb_in) from public.upload_pitches x where x.upload_id = u.id and kind = 'FB')::float hb from public.uploads u where id = $1", [upId])).rows[0];
    check(st && st.source === "trackman" && st.session_type === "bullpen" && st.d === ago(1) && st.c === 31 && st.hb === 9, `stored: 31 pitches, fastballs +9 arm side (${JSON.stringify(st)})`);
    let pv = (await pending()).find((x) => x.field === "velo" && x.pitch_id === "pt_fb1");
    check(pv && +pv.value === 87.8, `before the review, the fastball velocity includes the warmups: (3 x 75 + 12 x 91) / 15 = 87.8 (${pv && pv.value})`);

    console.log("2. He leaves out 3 warmups and marks a slider developing");
    for (const i of [1, 2, 3]) { await kid.getByLabel(`Leave out pitch ${i}`, { exact: true }).check(); await kid.getByLabel(`Why pitch ${i} is left out`).selectOption("warmup"); }
    await kid.getByLabel("Pitch 20 developing", { exact: true }).check();
    await click(kid, kid.getByRole("form", { name: "Review pitches" }).getByRole("button", { name: "Save" }), /ok=reviewed/);
    const rv = (await db.query("select count(*) filter (where excluded and reason = 'warmup')::int w, count(*) filter (where developing)::int d from public.upload_pitches where upload_id = $1", [upId])).rows[0];
    check(rv.w === 3 && rv.d === 1, `3 warmups left out with the reason, 1 developing (${JSON.stringify(rv)})`);
    check(/27 counted · 3 left out · 1 developing/.test(await text(kid, /counted/)), "the page counts them");
    await kid.screenshot({ path: path.join(shots, "upload-review.png"), fullPage: true });
    const props = await pending();
    pv = props.find((x) => x.field === "velo" && x.pitch_id === "pt_fb1");
    check(pv && +pv.value === 91 && props.map((x) => `${x.field}:${x.pitch_id}`).join(" ") === "shape:pt_fb1 shape:pt_sl1 velo:pt_fb1 velo:pt_sl1",
      `worked out again: fastball 91.0 mph without the warmups; shapes for both, slider velo; no slot (three-quarter already) and no splitter (4 pitches) (${props.map((x) => `${x.field}:${x.pitch_id}=${JSON.stringify(x.value)}`).join(" ")})`);

    console.log("3. He accepts the velocity");
    await goto(kid, `${me}/uploads`);
    const ut = await text(kid, /Proposed from uploads/);
    check(/4 to review/.test(ut) && /Fastball velocity: not set → 91 mph/.test(ut) && /Splitter: 4 pitches, not enough yet/.test(ut) && /In the uploads but not in the arsenal: Splitter/.test(ut) === false,
      "the proposals, with what each would change; the splitter has too few pitches");
    check(/Slider \(1\)/.test(ut) && /never feed the engine/.test(ut), "the developing slider is shown apart");
    await kid.screenshot({ path: path.join(shots, "upload-proposals.png"), fullPage: true });
    await click(kid, kid.getByRole("form", { name: "Accept Fastball velocity" }).getByRole("button", { name: "Accept" }), /ok=accepted/);
    let d1 = await doc(P1);
    check(d1.pitches[0].velo === 91 && d1.updatedAt > t0, "his fastball reads 91 mph, and the record is newer so the iPad gets it");
    check((await pending()).length === 3, "three still waiting");

    console.log("4. A pitching coach sees it waiting and accepts the shape; a pitch caller only looks");
    const asst = await fresh();
    await signIn(asst, "asst");
    await goto(asst, `/app/t/${team}`);
    const home = await text(asst, /Needs you/i);
    check(/Avery Brooks\s+3 proposed values · 1 new upload/i.test(home), `his home, under Needs you: "Avery Brooks 3 proposed values · 1 new upload" (${(home.match(/Needs you.{0,80}/is) || [""])[0]})`);
    await click(asst, asst.getByRole("region", { name: "Needs you" }).getByRole("link", { name: "Avery Brooks" }).first(), /\/uploads$/);
    await click(asst, asst.getByRole("form", { name: "Accept Fastball shape" }).getByRole("button", { name: "Accept" }), /ok=accepted/);
    d1 = await doc(P1);
    check(d1.pitches[0].shape === "ride" && d1.pitches[0].ivb === 17 && d1.pitches[0].hb === 9 && d1.pitches[0].velo === 91, "the fastball's shape is in: ride, 17 up, 9 arm side (and the velo stays)");
    const callerP = await fresh();
    await signIn(callerP, "caller");
    await goto(callerP, `/app/t/${team}/roster/${P1}/uploads`);
    const ct = await text(callerP, /Uploads/);
    check(/can see his uploads but not review them/.test(ct) && await callerP.getByRole("button", { name: "Accept" }).count() === 0 && await callerP.getByLabel("Pitch file").count() === 0, "a pitch caller sees the uploads, with no accept and no upload");

    console.log("5. A TrackMan game file next to a game called in PitchIQ (D11 in the browser)");
    await goto(kid, `${me}/uploads`);
    await kid.getByLabel("Pitch file").setInputFiles(files.game);
    const gp = await text(kid, /12 pitches ·/);
    check(/12 pitches/.test(gp) && await kid.locator("select[name=session_type]").inputValue() === "game", "his 12 pitches out of the game (the other pitcher's 3 left out), read as a game");
    await click(kid, kid.getByRole("button", { name: "Upload 12 pitches" }), /\/uploads\/[0-9a-f-]{36}/);
    await goto(kid, `${me}/stats`);
    const s1 = await text(kid, /By pitch/);
    check(/All \(16\)/.test(s1) && /Called in PitchIQ \(4\)/.test(s1) && /TrackMan games \(12\)/.test(s1), "both sources, labeled, with their counts");
    check(/Strikes 75% 12 of 16 pitches/i.test(s1), `all 16: 12 strikes (9 TrackMan + 3 PitchIQ) = 75% (${(s1.match(/Strikes.{0,30}/) || [""])[0]})`);
    check(/Whiffs per swing – 7 swings, not enough yet/i.test(s1), "7 swings (5 TrackMan, 2 PitchIQ): no whiff rate yet, just the count");
    await kid.screenshot({ path: path.join(shots, "stats.png"), fullPage: true });
    await goto(kid, `${me}/stats?src=pitchiq`);
    const s2 = await text(kid, /Game pitches/i);
    check(/Game pitches 4/i.test(s2) && /Strikes – 4 pitches, not enough yet/i.test(s2), "PitchIQ only: 4 pitches, not enough for a rate");
    await goto(kid, `${me}/stats?src=trackman`);
    const s3 = await text(kid, /Game pitches/i);
    check(/Strikes 75% 9 of 12 pitches/i.test(s3) && /Opposite-side hitters 12/.test(s3), "TrackMan only: 9 of 12 strikes, all against left-handed (opposite side) hitters");
    const velo = await kid.locator("main:visible svg[role=img]").first().getAttribute("aria-label");
    check(/Four-seam 93, 91 mph/.test(velo || ""), `the velocity chart, oldest first: 93 in the game three days ago, 91 in yesterday's bullpen (${velo})`);
    const mv = await kid.locator("main:visible svg[role=img]").nth(1).getAttribute("aria-label");
    // 12 bullpen fastballs at 17/9 and 12 game ones at 18/10 (warmups left out): 17.5 and 9.5, shown rounded
    check(/Four-seam 18 up, 10 arm side; Slider 2 up, -6 arm side/.test(mv || ""), `the movement plot (${mv})`);

    console.log("6. A file nobody recognizes: match its columns once");
    await goto(kid, `${me}/uploads`);
    await kid.getByLabel("Pitch file").setInputFiles(files.odd);
    check(/isn't TrackMan or Rapsodo/.test(await text(kid, /isn't TrackMan or Rapsodo/)), "it asks for the columns");
    const mf = kid.getByRole("form", { name: "Match the columns" });
    await mf.getByLabel("Pitch type (needed)").selectOption("Throw"); await mf.getByLabel("Velocity (mph)").selectOption("MPH");
    await mf.getByLabel("Induced vertical break (in)").selectOption("Up"); await mf.getByLabel("Horizontal break (in)").selectOption("Over"); await mf.getByLabel("Date").selectOption("When");
    await mf.getByLabel(/Save this for the team/).fill("Yakkertech");
    await mf.getByRole("button", { name: "Read the file" }).click();
    check(/10 pitches/.test(await text(kid, /10 pitches/)) && await kid.locator("input[name=session_date]").inputValue() === ago(10), "read with the match: 10 pitches, dated from the file");
    await click(kid, kid.getByRole("button", { name: "Upload 10 pitches" }), /\/uploads\/[0-9a-f-]{36}/);
    const tp = (await db.query("select name, mapping from public.upload_templates where program_id = $1", [team])).rows;
    const last = (await db.query("select source from public.uploads where program_id = $1 order by created_at desc limit 1", [team])).rows[0];
    check(tp.length === 1 && tp[0].name === "Yakkertech" && tp[0].mapping.velo === "MPH" && last.source === "mapped", "stored as a mapped upload, and the match is kept for the team");
    await goto(kid, `${me}/uploads`);
    await kid.getByLabel("Pitch file").setInputFiles(files.odd);
    check(/read with "Yakkertech"/.test(await text(kid, /Yakkertech/)), "the next file like it is read with it straight away");

    console.log("6b. A file with two pitchers' pitches is refused");
    await goto(kid, `${me}/uploads`);
    await kid.getByLabel("Pitch file").setInputFiles(files.two);
    const two = await text(kid, /different pitchers/);
    check(/This file has pitches from 2 different pitchers\. Upload a file with only Avery Brooks's pitches\./.test(two) &&
      (await kid.getByRole("button", { name: /^Upload \d+ pitches$/ }).count()) === 0, `it says so and offers no upload (${two.match(/This file[^.]*\.[^.]*\./)?.[0]})`);

    console.log("7. Only his");
    const kid2 = await fresh();
    await signIn(kid2, "kid2");
    const r404 = await goto(kid2, `${me}/uploads`);
    const t404 = await kid2.locator("body").innerText();
    check((r404.status() === 404 || /not found|404/i.test(t404)) && !/Avery|Four-seam/.test(t404), "a teammate's link to his uploads is the not-found page");
    await goto(kid2, `/app/me/${team}/${P2}/stats`);
    check(/No game pitches yet/.test(await text(kid2, /No game pitches/)), "his own stats are empty");

    console.log("8. Deleting an upload");
    await goto(kid, `${me}/uploads/${upId}`);
    await kid.locator("summary", { hasText: "Delete this upload" }).click();
    await kid.getByRole("form", { name: "Delete upload" }).getByRole("checkbox").check();
    await click(kid, kid.getByRole("form", { name: "Delete upload" }).getByRole("button", { name: "Delete" }), /ok=deleted/);
    check(await until(async () => +(await db.query("select count(*) n from public.upload_pitches where upload_id = $1", [upId])).rows[0].n === 0), "the bullpen and its 31 pitches are gone");
    check(!(await pending()).some((x) => x.pitch_id === "pt_sl1" && x.field === "velo"), "and the slider's proposals, which only it backed");
    check(!errs.length, `no page errors (${errs.join("; ")})`);
    check(!/Error:|⨯/.test(webLog), "no server errors" + (/Error:|⨯/.test(webLog) ? ":\n" + webLog.split("\n").filter((l) => /Error|⨯/.test(l)).slice(0, 5).join("\n") : ""));
  } catch (e) {
    fails++; console.error(e); console.error(webLog.slice(-3000));
  } finally {
    await browser.close(); web.kill(); await db.end(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} upload check(s) FAILED` : "\nall upload checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
