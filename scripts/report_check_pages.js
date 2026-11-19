/*
 * report_check.js --site: every number on every rendered report page (each carries data-k = what it is and data-v = its
 * raw value), read in a real browser and compared with report_check.js's own recomputation from the raw events. A key
 * the check doesn't know counts as unchecked and fails the run, so a number added to a page can't go unverified.
 * Pages: every outing report and game summary (head coach), each pitcher's season so far and frozen recaps, every
 * hitter page and the opponent pages; each linked pitcher's own outing reports; and the live public links.
 */
const { chromium } = require("playwright");

module.exports.run = async function run(season, D, H) {
  const { judge, lineOf, outsByPitcher, mixOf, heatOf, isPitch, pitchOf, recapWant, check, same } = H;
  const SITE = process.env.SITE || season.site, T = season.team;
  const GROUP = { "0-0": "0-0", "0-1": "ahead", "1-1": "even", "1-0": "behind", "2-0": "behind", "2-1": "behind", "0-2": "two", "1-2": "two", "2-2": "two", "3-0": "three", "3-1": "three", "3-2": "three" };
  const side = (e, hand) => { if (e.bs === "L" || e.bs === "R") return e.bs; const ss = e.sit && e.sit.same_side, h = e.ph || hand; return typeof ss === "boolean" && h ? (ss ? h : h === "R" ? "L" : "R") : null; };
  const browser = await chromium.launch();
  let pages = 0, numbers = 0, unchecked = [];

  // an independent at-bat split: a new at-bat when the last pitch ended one, or the slot or inning changed
  const atBats = (ps) => { const out = []; let cur = null, prev = null;
    for (const e of ps) { if (!cur || !prev || prev.end || prev.slot !== e.slot || prev.inning !== e.inning || prev.gameId !== e.gameId) { cur = { key: String(e.n), game: e.gameId, list: [] }; out.push(cur); } cur.list.push(e); prev = e; }
    for (const a of out) { const l = a.list[a.list.length - 1]; a.result = l.paEnd === "k" ? "k" : l.paEnd === "walk" ? "walk" : l.paEnd === "hbp" ? "hbp" : l.paEnd ? (["1B", "2B", "3B", "HR"].includes(l.out) ? "hit" : "out") : "open"; }
    return out; };
  const order = (xs) => xs.slice().sort((a, b) => String(a.gameId).localeCompare(String(b.gameId)) || a.n - b.n);
  const rv = (n, d) => `${n}/${d}`;

  // the expected value of one key, or undefined when the key isn't one we know
  function expect(key, ctx) {
    const k = key.split(".");
    if (k[0] === "line" || k[0] === "staff") { const L = ctx.line; const f = k[1]; return f in L ? String(L[f]) : undefined; }
    if (k[0] === "mix") {
      const slice = k[1], pk = k.slice(2, -1).join("."), f = k[k.length - 1];
      const sub = slice === "all" ? ctx.ps : slice.startsWith("g-") ? ctx.ps.filter((e) => GROUP[e.count] === slice.slice(2)) : ctx.ps.filter((e) => side(e, ctx.hand) === slice.slice(2));
      const m = mixOf(sub, ctx.pitcher)[pk]; if (!m) return "missing";
      return { n: String(m.n), share: rv(m.n, sub.length), strike: rv(m.strikes, m.n), whiff: rv(m.whiffs, m.swings), hard: rv(m.hard, m.bipContact), pos: String(m.positive), neg: String(m.negative) }[f];
    }
    if (k[0] === "heat") {
      const H2 = ctx.heat || (ctx.heat = heatOf(ctx.ps, ctx.pitcher));
      const view = k.find((x) => x === "called" || x === "landed"), vi = k.indexOf(view);
      const filter = view ? k.slice(1, vi).join(".") : k.slice(1, -1).join(".");
      const f = H2[filter]; if (!f) return "missing";
      if (!view && k[k.length - 1] === "n") return String(f.n);
      const g = f[view] || { left: 0, cells: {} };
      if (k[vi + 1] === "left") return String(g.left);
      const c = g.cells[k.slice(vi + 1).join(".")] || { n: 0, strike: 0, ball: 0, positive: 0, negative: 0 };
      return `${c.n},${c.strike},${c.ball},${c.positive},${c.negative}`;
    }
    if (k[0] === "ab" || k[0] === "hab") {
      const abs = ctx.abs || (ctx.abs = atBats(order(ctx.ps)));
      const a = abs.find((x) => x.game === k[1] && x.key === k[2]); if (!a) return "missing";
      return k[3] === "n" ? String(a.list.length) : a.result;
    }
    if (k[0] === "ov") { const e = ctx.ps.find((x) => x.gameId === k[1] && String(x.n) === k[2]); if (!e) return "missing";
      const kinds = [...(e.choice === "coach" || (e.choice === undefined && e.coach) ? ["coach"] : e.choice === "recall" ? ["shake"] : []), ...(e.thrown && e.thrown !== e.pitchName ? ["cross"] : [])];
      return kinds.includes(k[3]) ? k[3] : "not an override"; }
    if (k[0] === "p") { const pid = k[1], mine = ctx.ps.filter((e) => e.pitcherId === pid), L = lineOf(mine, ctx.outs[pid] || 0);
      const ov = { coach: mine.filter((e) => e.choice === "coach").length, shake: mine.filter((e) => e.choice === "recall").length, cross: mine.filter((e) => e.thrown && e.thrown !== e.pitchName).length };
      return k[2] in ov ? String(ov[k[2]]) : k[2] in L ? String(L[k[2]]) : undefined; }
    if (k[0] === "cmp") { const W = ctx.want; return { k: rv(W.L.k, W.L.bf), bb: rv(W.L.bb, W.L.bf), avg: rv(W.L.h, W.ab) }[k[1]]; }
    if (k[0] === "recap" && k[1] === "outings") return String(ctx.want.gs.length);
    if (k[0] === "out") { const mine = ctx.ps.filter((e) => e.gameId === k[1]), L = lineOf(mine, outsByPitcher(D.evs.filter((e) => e.gameId === k[1]))[ctx.pid] || 0);
      return { ip: L.ip, pitches: String(L.pitches), strike: rv(L.strikes, L.pitches), k: String(L.k), bb: String(L.bb), h: String(L.h), hard: String(L.hard) }[k[2]]; }
    if (k[0] === "hitter") { const abs = atBats(order(ctx.ps)).filter((a) => a.list[a.list.length - 1].end);
      return { abs: String(abs.length), k: String(abs.filter((a) => a.result === "k").length), bb: String(abs.filter((a) => a.result === "walk").length), h: String(abs.filter((a) => a.result === "hit").length), hard: String(ctx.ps.filter((e) => judge(e).hard).length) }[k[1]]; }
    if (k[0] === "opp") return String(D.evs.filter((e) => e.hitterId === k[1] && isPitch(e) && !e.deletedAt && e.end).length);
    if (k[0] === "share") return null;   // the link's address: not a number
    return undefined;
  }

  async function visit(page, url, ctx, label) {
    const res = await page.goto(SITE + url, { waitUntil: "networkidle" });
    check(res && res.status() === 200, `${label}: opens (${res && res.status()})`);
    const vals = await page.evaluate(() => [...document.querySelectorAll("[data-k]")].map((el) => [el.getAttribute("data-k"), el.getAttribute("data-v")]));
    pages++;
    check(vals.length > 0, `${label}: carries its numbers`);
    for (const [key, v] of vals) {
      const want = expect(key, ctx);
      if (want === undefined) { unchecked.push(`${label} ${key}`); continue; }
      if (want === null) continue;
      numbers++;
      same(`${label} ${key}`, want, v);
    }
  }
  const signIn = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
    if (who) { await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 }); }
    return { ctx, page };
  };
  const pitcherDoc = (id) => D.pitchers[id] || {};

  // ---------------------------------------------------------------- the head coach
  const coach = await signIn("coach");
  for (const g of D.games) {
    const gEvs = D.evs.filter((e) => e.gameId === g.id), ps = gEvs.filter((e) => isPitch(e) && !e.deletedAt);
    if (!ps.length) continue;
    const outs = outsByPitcher(gEvs);
    for (const pid of [...new Set(ps.map((e) => e.pitcherId).filter(Boolean))]) {
      const mine = ps.filter((e) => e.pitcherId === pid);
      await visit(coach.page, `/app/t/${T}/reports/${g.id}/${pid}`, { ps: mine, pitcher: pitcherDoc(pid), hand: pitcherDoc(pid).hand, line: { ...lineOf(mine, outs[pid] || 0) } }, `outing ${g.date} ${pitcherDoc(pid).name}`);
    }
    await visit(coach.page, `/app/t/${T}/reports/${g.id}`, { ps, outs, line: lineOf(ps, Object.values(outs).reduce((a, b) => a + b, 0)) }, `summary ${g.date}`);
  }
  // recaps: season so far, and every frozen one
  const soFar = (() => { const last = D.seasons.map((s) => s.e).sort().pop(); if (!last) return "0000-00-00"; const x = new Date(last + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); })();
  for (const pid of Object.keys(D.pitchers)) {
    const want = recapWant(pid, soFar, null);
    await visit(coach.page, `/app/t/${T}/roster/${pid}/recap`, { ps: want.mine, pitcher: pitcherDoc(pid), hand: pitcherDoc(pid).hand, line: want.L, want, pid }, `season so far ${pitcherDoc(pid).name}`);
  }
  for (const fz of D.frozen) {
    const s = D.seasons.find((x) => x.id === fz.season_id), want = recapWant(fz.pitcher_id, s.s, s.e);
    await visit(coach.page, `/app/t/${T}/roster/${fz.pitcher_id}/recap/${fz.season_id}`, { ps: want.mine, pitcher: pitcherDoc(fz.pitcher_id), hand: pitcherDoc(fz.pitcher_id).hand, line: want.L, want, pid: fz.pitcher_id }, `final ${s.name} ${pitcherDoc(fz.pitcher_id).name}`);
  }
  for (const [tn, o] of Object.entries(season.opponents)) {
    await visit(coach.page, `/app/t/${T}/opponents/${o.id}`, {}, `opponent ${tn}`);
    for (const hid of o.hitters) await visit(coach.page, `/app/t/${T}/opponents/${o.id}/hitters/${hid}`, { ps: D.evs.filter((e) => e.hitterId === hid && isPitch(e) && !e.deletedAt) }, `hitter ${tn} ${hid.slice(-5)}`);
  }
  await coach.ctx.close();

  // ---------------------------------------------------------------- each pitcher's own reports
  for (const [who, key] of [["ace", "Ace"], ["lefty", "Lefty"], ["kid", "Kid"]]) {
    const pid = season.pitchers[key], me = await signIn(who);
    for (const g of D.games) {
      const gEvs = D.evs.filter((e) => e.gameId === g.id), mine = gEvs.filter((e) => isPitch(e) && !e.deletedAt && e.pitcherId === pid);
      if (!mine.length) continue;
      await visit(me.page, `/app/me/${T}/${pid}/outings/${g.id}`, { ps: mine, pitcher: pitcherDoc(pid), hand: pitcherDoc(pid).hand, line: lineOf(mine, outsByPitcher(gEvs)[pid] || 0) }, `${who}'s own ${g.date}`);
    }
    await me.ctx.close();
  }

  // ---------------------------------------------------------------- public links that are live
  const anon = await signIn(null);
  for (const [who, tok] of Object.entries(season.shares || {})) {
    const r = await anon.page.goto(`${SITE}/r/${tok}`); if (!r || r.status() !== 200) continue;
    const sh = D.shares && D.shares[tok];
    if (!sh) continue;
    const want = sh.season ? recapWant(sh.pitcher, D.seasons.find((x) => x.id === sh.season).s, D.seasons.find((x) => x.id === sh.season).e) : recapWant(sh.pitcher, soFar, null);
    await visit(anon.page, `/r/${tok}`, { ps: want.mine, pitcher: pitcherDoc(sh.pitcher), hand: pitcherDoc(sh.pitcher).hand, line: want.L, want, pid: sh.pitcher }, `public ${who}`);
  }
  await anon.ctx.close();
  await browser.close();
  check(unchecked.length === 0, `every number on the pages is a known, checked key${unchecked.length ? `: ${[...new Set(unchecked.map((u) => u.split(" ").pop().split(".")[0]))].join(", ")} e.g. ${unchecked.slice(0, 3).join(" | ")}` : ""}`);
  return { pages, numbers };
};
