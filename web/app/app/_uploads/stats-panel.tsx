import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { pitchesOf } from "@/lib/upload_data";
import { byCountAndPitch, byPitch, bySide, combine, fmt, fromEvents, fromUploads, line, movement, outingLog, sample, usage, veloTrend, type Line, type Rate, type StatRow } from "@/lib/stats";
import { myLearned } from "@/lib/player";
import type { UploadAccess } from "./access";

// A pitcher's stats (spec: "Player stats"): game pitches called in PitchIQ plus TrackMan game files, labeled by source,
// every rate with its sample, and nothing on fewer than 10. Velocity and movement come from every upload.
type SP = Record<string, string | string[] | undefined>;
const KIND_COLOR: Record<string, string> = { FB: "#ff5a4e", SI: "#ff8a5c", FC: "#c98bff", SL: "#ffd43b", CB: "#52a9ff", CH: "#3fe08c" };   // v1.1: + sinker, cutter
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SIDE = { same: "Same-side hitters", opp: "Opposite-side hitters" } as const;

// a headline rate: the percentage big, its sample small; under the minimum, a dash and why
function Big({ label, r, unit = "pitches" }: { label: string; r: Rate; unit?: string }) {
  return (
    <section className="dash-card" aria-label={label}><h2 className="lbl">{label}</h2>
      {r.pct === null ? <><p className="big-num mono">–</p><p className="shell-note small">{r.n ? `${sample(r.n, unit)}, not enough yet` : "None yet"}</p></>
        : <><p className="big-num mono">{Math.round(r.pct)}%</p><p className="shell-note small">{r.k} of {sample(r.n, unit)}</p></>}
    </section>
  );
}

function Cells({ l, k = true }: { l: Line; k?: boolean }) {
  return (<>
    <td className="num mono">{l.n}</td><td className="num">{fmt(l.strike)}</td><td className="num">{fmt(l.whiff, "swings")}</td>
    {k ? <td className="num">{l.k ? fmt(l.k) : "–"}</td> : null}
    <td className="num">{l.bip.n ? fmt(l.bip.hard, "balls in play") : "–"}</td>
  </>);
}

export async function StatsPanel({ a, sp }: { a: UploadAccess; sp: SP }) {
  const t = a.team.team_id, pid = a.pitcher.id;
  const src = (["all", "pitchiq", "trackman"] as const).find((s) => s === sp.src) || "all";
  const sb = await getServerSupabase();
  const [{ data: ev }, ups, learned] = await Promise.all([
    sb.rpc("pc_pitch_rows", { p: t, pitcher: pid }),
    pitchesOf(t, pid),
    a.asPlayer ? myLearned(t, pid) : sb.from("learned").select("doc").eq("program_id", t).eq("id", `p:${pid}`).is("deleted_at", null).maybeSingle().then((r) => (r.data ? r.data.doc : null)),
  ]);
  const name = (type: string) => (a.pitcher.pitches || []).find((x) => x.type === type)?.name;
  const piq = fromEvents((ev || []) as never[]);
  const tm = fromUploads(ups.map((u) => ({ ...u, pitch_name: name(u.pitch_type) })), a.pitcher.hand === "L" ? "L" : "R");
  const rows: StatRow[] = src === "pitchiq" ? piq : src === "trackman" ? tm : combine(piq, tm);
  const all = line(rows, false), use = usage(rows), cp = byCountAndPitch(rows), sides = bySide(rows), log = outingLog(rows);
  const trend = veloTrend(ups), moves = movement(ups);
  const lp = (learned?.pitches || {}) as Record<string, Record<string, unknown>>;
  const linkSrc = (s: string, l: string) => <Link href={`${a.base}/stats${s === "all" ? "" : `?src=${s}`}`} aria-current={src === s ? "page" : undefined}>{l}</Link>;
  return (
    <>
      <nav className="sub-tabs small" aria-label="Source">{linkSrc("all", `All (${combine(piq, tm).length})`)}{linkSrc("pitchiq", `Called in PitchIQ (${piq.length})`)}{linkSrc("trackman", `TrackMan games (${tm.length})`)}</nav>
      <p className="shell-note small">{src === "all" ? "Both sources; a game charted in PitchIQ and also uploaded from TrackMan counts once." : src === "pitchiq" ? "Only games called on the iPad." : "Only TrackMan game files."} The last 12 months. A rate needs 10 pitches (or swings, or balls in play) before it shows.</p>
      {rows.length ? (<>
        <div className="dash">
          <section className="dash-card" aria-label="Pitches"><h2 className="lbl">Game pitches</h2><p className="big-num mono">{all.n}</p></section>
          <Big label="Strikes" r={all.strike} />
          <Big label="Whiffs per swing" r={all.whiff} unit="swings" />
          {all.k ? <Big label="Strikeouts, two strikes" r={all.k} /> : null}
        </div>

        <h2 className="shell-h2">By pitch</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="By pitch">
          <thead><tr><th>Pitch</th><th className="num">n</th><th className="num">Strike</th><th className="num">Whiff</th><th className="num">K, two strikes</th><th className="num">Hard contact</th></tr></thead>
          <tbody>{byPitch(rows).map((x) => <tr key={x.pitch}><td>{x.pitch}</td><Cells l={x.line} /></tr>)}</tbody>
        </table></div>

        <h2 className="shell-h2">Usage by count</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Usage by count">
          <thead><tr><th>Count</th><th className="num">n</th>{use.pitches.map((p) => <th key={p} className="num">{p}</th>)}</tr></thead>
          <tbody>{use.counts.map((c) => <tr key={c.count}><td className="mono">{c.count}</td><td className="num mono">{c.n}</td>
            {use.pitches.map((p) => <td key={p} className="num">{c.by[p].pct === null ? (c.by[p].k ? `${c.by[p].k}` : "–") : `${Math.round(c.by[p].pct)}%`}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="shell-note small">Under 10 pitches in a count, the table shows how many, not a share.</p>

        <h2 className="shell-h2">Each count and pitch</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Each count and pitch">
          <thead><tr><th>Count</th><th>Pitch</th><th className="num">n</th><th className="num">Strike</th><th className="num">Whiff</th><th className="num">K</th><th className="num">Hard contact</th></tr></thead>
          <tbody>{cp.map((x) => <tr key={x.count + x.pitch}><td className="mono">{x.count}</td><td>{x.pitch}</td><Cells l={x.line} /></tr>)}</tbody>
        </table></div>

        <h2 className="shell-h2">By hitter side</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="By hitter side">
          <thead><tr><th>Hitters</th><th className="num">n</th><th className="num">Strike</th><th className="num">Whiff</th><th className="num">K, two strikes</th><th className="num">Hard contact</th></tr></thead>
          <tbody>{sides.map((s) => <tr key={s.side}><td>{SIDE[s.side]}</td><Cells l={s.line} /></tr>)}</tbody>
        </table></div>

        <h2 className="shell-h2">Outings</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Outing log">
          <thead><tr><th>Date</th><th>Source</th><th className="num">Pitches</th><th className="num">Strikes</th><th className="num">K</th><th className="num">BB</th><th className="num">Hard hit</th></tr></thead>
          <tbody>{log.map((o) => <tr key={o.date + o.source}><td>{day(o.date)}</td><td>{o.source === "pitchiq" ? "PitchIQ" : "TrackMan"}</td><td className="num mono">{o.pitches}</td>
            <td className="num mono">{o.strikes}</td><td className="num mono">{o.k}</td><td className="num mono">{o.bb}</td><td className="num mono">{o.hard}</td></tr>)}</tbody>
        </table></div>
      </>) : <p className="shell-note">No game pitches {src === "trackman" ? "from TrackMan game files" : src === "pitchiq" ? "called in PitchIQ" : "yet"}. They show up once a game is charted on the iPad or a TrackMan game file is uploaded.</p>}

      <h2 className="shell-h2">Velocity</h2>
      {trend.length ? <VeloChart trend={trend} kindOf={(type) => ups.find((u) => u.pitch_type === type)?.kind || "FB"} /> : <p className="shell-note">From uploads: none yet.</p>}
      <h2 className="shell-h2">Movement</h2>
      {moves.length ? <MoveChart moves={moves} kindOf={(type) => ups.find((u) => u.pitch_type === type)?.kind || "FB"} /> : <p className="shell-note">From uploads: none yet.</p>}

      <h2 className="shell-h2">What the engine learned, next to the grades</h2>
      {Object.keys(lp).length ? (
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Learned values and grades">
          <thead><tr><th>Pitch</th><th className="num">Pitches</th><th className="num">Stuff: grade → read</th><th className="num">Command: grade → read</th></tr></thead>
          <tbody>{(a.pitcher.pitches || []).filter((d) => lp[d.id] || lp[d.name]).map((d) => {
            const x = lp[d.id] || lp[d.name], r = (x.talent || x.fit || {}) as { grade?: number; command?: number };
            const f = (v: unknown) => (typeof v === "number" ? v.toFixed(1) : "–");
            return <tr key={d.id}><td>{d.name}</td><td className="num mono">{typeof x.n === "number" ? x.n : "–"}</td>
              <td className="num mono">{d.grade === "" ? "–" : d.grade} → <b>{f(r.grade)}</b></td><td className="num mono">{d.command === "" ? "–" : d.command} → <b>{f(r.command)}</b></td></tr>;
          })}</tbody>
        </table></div>
      ) : <p className="shell-note">Nothing learned yet: the engine learns from games charted on the iPad.</p>}
    </>
  );
}

// ---------------------------------------------------------------- charts (plain SVG, drawn on the server)
const W = 640, H = 260, PAD = { l: 44, r: 12, t: 12, b: 30 };
function VeloChart({ trend, kindOf }: { trend: ReturnType<typeof veloTrend>; kindOf: (t: string) => string }) {
  const dates = [...new Set(trend.map((x) => x.date))].sort(), types = [...new Set(trend.map((x) => x.type))];
  const vs = trend.map((x) => x.velo), lo = Math.floor(Math.min(...vs) - 1), hi = Math.ceil(Math.max(...vs) + 1);
  const X = (d: string) => PAD.l + (dates.length === 1 ? (W - PAD.l - PAD.r) / 2 : (dates.indexOf(d) / (dates.length - 1)) * (W - PAD.l - PAD.r));
  const Y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average velocity by session: ${types.map((t) => `${t} ${trend.filter((x) => x.type === t).map((x) => x.velo).join(", ")} mph`).join("; ")}`}>
        {ticks.map((v) => <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} className="grid" /><text x={PAD.l - 6} y={Y(v) + 4} textAnchor="end" className="tick">{v}</text></g>)}
        {dates.map((d, i) => <text key={d} x={X(d)} y={H - 8} textAnchor={dates.length > 1 && i === 0 ? "start" : dates.length > 1 && i === dates.length - 1 ? "end" : "middle"} className="tick">{day(d)}</text>)}
        {types.map((t) => {
          const pts = trend.filter((x) => x.type === t);
          return <g key={t}><polyline fill="none" stroke={KIND_COLOR[kindOf(t)] || "#aaa"} strokeWidth={2} points={pts.map((p) => `${X(p.date)},${Y(p.velo)}`).join(" ")} />
            {pts.map((p) => <circle key={p.date} cx={X(p.date)} cy={Y(p.velo)} r={4} fill={KIND_COLOR[kindOf(t)] || "#aaa"}><title>{`${t}, ${day(p.date)}: ${p.velo} mph average, ${p.max} max, ${p.n} pitches`}</title></circle>)}</g>;
        })}
      </svg>
      <figcaption className="legend">{types.map((t) => <span key={t}><i style={{ background: KIND_COLOR[kindOf(t)] || "#aaa" }} /> {t}</span>)} <span className="lbl">mph, average per session</span></figcaption>
    </figure>
  );
}

function MoveChart({ moves, kindOf }: { moves: ReturnType<typeof movement>; kindOf: (t: string) => string }) {
  const S = 300, M = 25, C = S / 2, k = (S / 2 - 20) / M;
  const types = [...new Set(moves.map((m) => m.type))];
  return (
    <figure className="chart square">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Movement, inches: ${types.map((t) => { const ms = moves.filter((m) => m.type === t); const av = (f: "ivb" | "hb") => Math.round(ms.reduce((a, m) => a + m[f], 0) / ms.length); return `${t} ${av("ivb")} up, ${av("hb")} arm side`; }).join("; ")}`}>
        <line x1={20} x2={S - 20} y1={C} y2={C} className="grid" /><line x1={C} x2={C} y1={20} y2={S - 20} className="grid" />
        {[-20, -10, 10, 20].map((v) => <g key={v}><text x={C + v * k} y={C + 14} textAnchor="middle" className="tick">{v}</text><text x={C - 6} y={C - v * k + 4} textAnchor="end" className="tick">{v}</text></g>)}
        {moves.slice(0, 3000).map((m, i) => { const col = KIND_COLOR[kindOf(m.type)] || "#aaa"; const x = C + Math.max(-M, Math.min(M, m.hb)) * k, y = C - Math.max(-M, Math.min(M, m.ivb)) * k;
          return m.developing ? <circle key={i} cx={x} cy={y} r={3} fill="none" stroke={col} strokeWidth={1.2} /> : <circle key={i} cx={x} cy={y} r={3} fill={col} fillOpacity={0.75} />; })}
        <text x={S - 22} y={C - 6} textAnchor="end" className="tick">arm side →</text><text x={C + 6} y={26} className="tick">↑ up</text>
      </svg>
      <figcaption className="legend">{types.map((t) => <span key={t}><i style={{ background: KIND_COLOR[kindOf(t)] || "#aaa" }} /> {t}</span>)} <span className="lbl">hollow: developing</span></figcaption>
    </figure>
  );
}
