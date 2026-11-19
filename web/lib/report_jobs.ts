import "server-only";
import { gameReportsMail, outingMail, recapMail, sendMail, shareRequestMail, type OutingLine } from "./email";
import { buildRecap, line, pitchesOf, type Ev, type GameMeta } from "./report_data.ts";

// The report jobs (docs/PLAN_reports_recap_2026-11-18.md 5), run on the server with the service key:
//   1. Outing reports: a finished game whose pitches have all arrived (the iPad syncs after End game; an offline game
//      when it gets a signal) gets one email to each pitcher who pitched in it (his own report) and one to each coach
//      (every pitcher's report in that game and the game summary).
//   2. Final recaps: a season a coach marked over gets each pitcher's recap built from the raw events, frozen as a
//      version, and emailed to that pitcher and to the coaches.
// Each email is written to report_mail before it's sent, under a unique key, so two runs at once never send it twice.
// Nothing about a report is stored except the frozen recap: the pages build the rest from the events every time.
// Who gets them: the team's coaches (any staff role) and the pitcher's own account (a young player's parent account).
// Never a catcher, an opponent, or anyone off the team. Games with no pitcher record (sample staff) send nothing.

const WAIT_MS = 6 * 3600e3;   // a game whose pitches haven't all arrived waits this long after End game, then goes anyway

function env() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("not_configured");
  return { url: url.replace(/\/$/, ""), key };
}
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${res.status} ${json && (json.message || json.code) || ""}`);
  return json as T;
}
async function restAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const rows = await rest<T[]>(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const rpc = <T,>(fn: string, args: Record<string, unknown>) => rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
const q = encodeURIComponent;

type GameRow = { id: string; doc: { date?: string; status?: string; dupOf?: string; pitches?: number; endedAt?: number; opponentId?: string | null; level?: string } };
type Person = { user_id: string; email: string; role: string; pitcher_id: string | null };
type MailKey = { kind: string; ref: string; pitcher_id: string; email: string };

// claim one email: true when this run wrote the row (so this run sends it)
async function claim(team: string, m: MailKey, userId: string | null): Promise<boolean> {
  const rows = await rest<{ id: number }[]>("report_mail?on_conflict=program_id,kind,ref,pitcher_id,email", {
    method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ program_id: team, kind: m.kind, ref: m.ref, pitcher_id: m.pitcher_id, email: m.email, user_id: userId, status: "sending" }]) });
  return rows.length === 1;
}
async function settle(team: string, m: MailKey, status: string, error?: string) {
  await rest(`report_mail?program_id=eq.${team}&kind=eq.${q(m.kind)}&ref=eq.${q(m.ref)}&pitcher_id=eq.${q(m.pitcher_id)}&email=eq.${q(m.email)}`, {
    method: "PATCH", body: JSON.stringify({ status, error: error || null }) });
}
async function send(team: string, m: MailKey, userId: string | null, make: () => Parameters<typeof sendMail>[0]): Promise<boolean> {
  if (!(await claim(team, m, userId))) return false;
  const r = await sendMail(make());
  await settle(team, m, r.status, r.error);
  return r.status === "sent";
}

export type RunResult = { teams: number; outingMails: number; summaryMails: number; recapMails: number; waiting: string[]; frozen: number };

export async function runReports(site: string, only?: string): Promise<RunResult> {
  const out: RunResult = { teams: 0, outingMails: 0, summaryMails: 0, recapMails: 0, waiting: [], frozen: 0 };
  const teams = only ? await rest<{ id: string; name: string; level: string | null }[]>(`programs?id=eq.${only}&select=id,name,level`)
    : await rest<{ id: string; name: string; level: string | null }[]>("programs?status=in.(active,ending)&select=id,name,level");
  for (const t of teams) {
    const people = await rpc<Person[]>("pc_report_people", { p: t.id });
    if (!people.length) continue;   // a team that isn't switched on gets nothing
    out.teams++;
    await outingReports(site, t, people, out);
    await finalRecaps(site, t, people, out);
  }
  return out;
}

async function teamMeta(teamId: string) {
  const [pitchers, teams] = await Promise.all([
    restAll<{ id: string; doc: { name?: string; hand?: string; pitches?: { id: string; name: string; kind: string }[] } }>(`pitchers?program_id=eq.${teamId}&select=id,doc`),
    restAll<{ id: string; doc: { name?: string } }>(`teams?program_id=eq.${teamId}&select=id,doc`)]);
  return { pitchers: new Map(pitchers.map((p) => [p.id, p.doc])), names: new Map(teams.map((x) => [x.id, x.doc?.name || "Opponent"])) };
}

async function outingReports(site: string, t: { id: string; name: string; level: string | null }, people: Person[], out: RunResult) {
  const games = (await restAll<GameRow>(`games?program_id=eq.${t.id}&deleted_at=is.null&select=id,doc`))
    .filter((g) => g.doc?.status === "final" && !g.doc.dupOf && /^\d{4}-\d{2}-\d{2}$/.test(String(g.doc.date)));
  if (!games.length) return;
  const done = await restAll<MailKey>(`report_mail?program_id=eq.${t.id}&kind=in.(outing,game_summary)&select=kind,ref,pitcher_id,email`);
  const coaches = people.filter((p) => p.role !== "player");
  let meta: Awaited<ReturnType<typeof teamMeta>> | null = null;
  for (const g of games) {
    const evs = (await restAll<{ doc: Ev }>(`events?program_id=eq.${t.id}&game_id=eq.${q(g.id)}&deleted_at=is.null&select=doc`)).map((r) => r.doc);
    const ps = pitchesOf(evs);
    // every pitch there yet? the game record says how many it ended with
    const want = Number(g.doc.pitches) || 0;
    if (ps.length < want && Date.now() - (Number(g.doc.endedAt) || 0) < WAIT_MS) { out.waiting.push(g.id); continue; }
    const pids = [...new Set(ps.map((e) => e.pitcherId).filter((x): x is string => !!x))];
    if (!pids.length) continue;
    const owed = (kind: string, pitcher: string, email: string) => !done.some((d) => d.kind === kind && d.ref === g.id && d.pitcher_id === pitcher && d.email === email);
    const pitcherMails = pids.flatMap((pid) => people.filter((p) => p.role === "player" && p.pitcher_id === pid && owed("outing", pid, p.email)).map((p) => ({ pid, p })));
    const coachMails = coaches.filter((c) => owed("game_summary", "", c.email));
    if (!pitcherMails.length && !coachMails.length) continue;
    meta = meta || await teamMeta(t.id);
    const date = String(g.doc.date), opponent = g.doc.opponentId ? meta.names.get(g.doc.opponentId) || null : null;
    const lineFor = (pid: string, link: string): OutingLine => {
      const L = line(ps.filter((e) => e.pitcherId === pid), evs.filter((e) => e.type === "play" && e.pitcherId === pid));
      return { pitcher: meta!.pitchers.get(pid)?.name || "Pitcher", ip: L.ip, pitches: L.pitches, k: L.k, bb: L.bb, h: L.h, link };
    };
    for (const { pid, p } of pitcherMails)
      if (await send(t.id, { kind: "outing", ref: g.id, pitcher_id: pid, email: p.email }, p.user_id,
        () => outingMail({ to: p.email, pitcher: meta!.pitchers.get(pid)?.name || "Your", date, opponent, line: lineFor(pid, `${site}/app/me/${t.id}/${pid}/outings/${g.id}`) }))) out.outingMails++;
    if (coachMails.length) {
      const lines = pids.map((pid) => lineFor(pid, `${site}/app/t/${t.id}/reports/${g.id}/${pid}`));
      for (const c of coachMails)
        if (await send(t.id, { kind: "game_summary", ref: g.id, pitcher_id: "", email: c.email }, c.user_id,
          () => gameReportsMail({ to: c.email, team: t.name, date, opponent, outings: lines, summary: `${site}/app/t/${t.id}/reports/${g.id}` }))) out.summaryMails++;
    }
  }
}

// ---------------------------------------------------------------- final recaps: build, freeze, email
type SeasonRow = { id: string; name: string; start_date: string; end_date: string };
export async function finalRecaps(site: string, t: { id: string; name: string; level: string | null }, people: Person[], out: RunResult) {
  const seasons = await rest<SeasonRow[]>(`seasons?program_id=eq.${t.id}&select=id,name,start_date,end_date&order=end_date.desc`);
  for (const s of seasons) {
    const have = await rest<{ pitcher_id: string }[]>(`recap_versions?season_id=eq.${s.id}&select=pitcher_id`);
    const games = (await restAll<GameRow>(`games?program_id=eq.${t.id}&deleted_at=is.null&select=id,doc`))
      .filter((g) => !g.doc?.dupOf && /^\d{4}-\d{2}-\d{2}$/.test(String(g.doc?.date)) && String(g.doc.date) >= s.start_date && String(g.doc.date) <= s.end_date);
    if (!games.length) continue;
    const ids = games.map((g) => g.id);
    const evs: Ev[] = [];
    for (let i = 0; i < ids.length; i += 50)
      evs.push(...(await restAll<{ doc: Ev }>(`events?program_id=eq.${t.id}&game_id=in.(${ids.slice(i, i + 50).map((x) => `"${x}"`).join(",")})&deleted_at=is.null&select=doc`)).map((r) => r.doc));
    const ps = pitchesOf(evs);
    const pids = [...new Set(ps.map((e) => e.pitcherId).filter((x): x is string => !!x))];
    const meta = await teamMeta(t.id);
    const metas: GameMeta[] = games.map((g) => ({ id: g.id, date: String(g.doc.date), level: g.doc.level || t.level, status: g.doc.status || null }));
    const built: { pid: string; name: string }[] = [];
    for (const pid of pids) {
      if (have.some((h) => h.pitcher_id === pid)) { built.push({ pid, name: meta.pitchers.get(pid)?.name || "Pitcher" }); continue; }
      const doc = meta.pitchers.get(pid);
      // frozen in the public shape: no opponents, no shake-offs, nothing staff-only (the pages add opponents back for
      // coaches and the pitcher from the games list)
      const recap = buildRecap(evs.filter((e) => e.pitcherId === pid), metas, { id: pid, name: doc?.name || "Pitcher", hand: doc?.hand || null, pitches: doc?.pitches || [] },
        { name: s.name, start: s.start_date, end: s.end_date, final: true }, "public", t.level);
      await rest("recap_versions", { method: "POST", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ program_id: t.id, season_id: s.id, pitcher_id: pid, version: 1, data: recap }) });
      out.frozen++;
      built.push({ pid, name: doc?.name || "Pitcher" });
    }
    for (const b of built)
      for (const p of people.filter((x) => x.role === "player" && x.pitcher_id === b.pid))
        if (await send(t.id, { kind: "final_recap", ref: s.id, pitcher_id: b.pid, email: p.email }, p.user_id,
          () => recapMail({ to: p.email, season: s.name, team: t.name, recaps: [{ pitcher: b.name, link: `${site}/app/me/${t.id}/${b.pid}/recap/${s.id}` }], forCoach: false }))) out.recapMails++;
    if (built.length)
      for (const c of people.filter((x) => x.role !== "player"))
        if (await send(t.id, { kind: "final_recap", ref: s.id, pitcher_id: "", email: c.email }, c.user_id,
          () => recapMail({ to: c.email, season: s.name, team: t.name, forCoach: true,
            recaps: built.map((b) => ({ pitcher: b.name, link: `${site}/app/t/${t.id}/roster/${b.pid}/recap/${s.id}` })) }))) out.recapMails++;
  }
}

/** Rebuild one pitcher's frozen recap as the next version (a late-synced game): the old versions are kept. */
export async function refreeze(teamId: string, seasonId: string, pitcherId: string): Promise<number> {
  const [t] = await rest<{ id: string; name: string; level: string | null }[]>(`programs?id=eq.${teamId}&select=id,name,level`);
  const [s] = await rest<SeasonRow[]>(`seasons?id=eq.${seasonId}&program_id=eq.${teamId}&select=id,name,start_date,end_date`);
  if (!t || !s) throw new Error("not found");
  const games = (await restAll<GameRow>(`games?program_id=eq.${teamId}&deleted_at=is.null&select=id,doc`))
    .filter((g) => !g.doc?.dupOf && String(g.doc?.date) >= s.start_date && String(g.doc?.date) <= s.end_date);
  const ids = games.map((g) => g.id), evs: Ev[] = [];
  for (let i = 0; i < ids.length; i += 50)
    evs.push(...(await restAll<{ doc: Ev }>(`events?program_id=eq.${teamId}&pitcher_id=eq.${q(pitcherId)}&game_id=in.(${ids.slice(i, i + 50).map((x) => `"${x}"`).join(",")})&deleted_at=is.null&select=doc`)).map((r) => r.doc));
  const meta = await teamMeta(teamId), doc = meta.pitchers.get(pitcherId);
  const recap = buildRecap(evs, games.map((g) => ({ id: g.id, date: String(g.doc.date), level: g.doc.level || t.level })), { id: pitcherId, name: doc?.name || "Pitcher", hand: doc?.hand || null, pitches: doc?.pitches || [] },
    { name: s.name, start: s.start_date, end: s.end_date, final: true }, "public", t.level);
  const prev = await rest<{ version: number }[]>(`recap_versions?season_id=eq.${seasonId}&pitcher_id=eq.${q(pitcherId)}&select=version&order=version.desc&limit=1`);
  const version = (prev[0]?.version || 0) + 1;
  await rest("recap_versions", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ program_id: teamId, season_id: seasonId, pitcher_id: pitcherId, version, data: recap }) });
  return version;
}

// ---------------------------------------------------------------- an under-18 player's link: ask the parent
export async function askParent(site: string, teamId: string, pitcherId: string, token: string): Promise<boolean> {
  const email = await rpc<string | null>("pc_report_parent", { p: teamId, pitcher: pitcherId });
  if (!email) return false;
  const [t] = await rest<{ name: string }[]>(`programs?id=eq.${teamId}&select=name`);
  const [p] = await rest<{ doc: { name?: string } }[]>(`pitchers?program_id=eq.${teamId}&id=eq.${q(pitcherId)}&select=doc`);
  return send(teamId, { kind: "share_request", ref: token, pitcher_id: pitcherId, email }, null,
    () => shareRequestMail({ to: email, pitcher: p?.doc?.name || "Your player", team: t?.name || "the team", link: `${site}/app/approve` }));
}
