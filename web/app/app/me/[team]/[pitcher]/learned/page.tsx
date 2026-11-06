import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { myLearned, myPitchers, playerTeam } from "@/lib/player";

export const metadata: Metadata = { title: "What the engine learned · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
type Pair = { grade?: number; command?: number };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pair = (v: unknown): Pair => (v && typeof v === "object" ? { grade: num((v as Pair).grade) ?? undefined, command: num((v as Pair).command) ?? undefined } : {});
const f1 = (v?: number) => (v === undefined ? "–" : v.toFixed(1));

export default function Learned({ params }: { params: Params }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} /></Suspense>;
}

// What the learner fitted from his game pitches (app/learner.js): per pitch, what was entered, what the results point
// to, and how much it rests on. The calls move toward it slowly (at most 0.15 a game, never more than 1.0 from the grade).
async function Body({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  await playerTeam(team);
  const [ps, L] = await Promise.all([myPitchers(team), myLearned(team, pitcher)]);
  const p = ps.find((x) => x.id === pitcher);
  if (!p) notFound();
  const rows = Object.entries(L?.pitches || {}).map(([k, v]) => {
    const d = (p.pitches || []).find((x) => x.id === k || x.name === k);
    return { key: k, name: d ? d.name : k, n: num(v.n) ?? 0, games: num(v.games), entered: pair(v.entered), read: pair(v.talent ?? v.fit), strike: num(v.strike_rate) };
  }).sort((a, b) => b.n - a.n);
  return (
    <>
      <h1 className="shell-h1">What the engine learned</h1>
      <p className="shell-note">After each game the engine checks your grades against what actually happened: balls, called strikes, whiffs, fouls and contact. Little data moves nothing; a lot moves its read toward your results. It only changes the calls slowly.</p>
      {rows.length ? (
        <div className="tbl-scroll"><table className="data-tbl" aria-label="What the engine learned">
          <thead><tr><th>Pitch</th><th className="num">Pitches</th><th className="num">Stuff: entered → read</th><th className="num">Command: entered → read</th><th className="num">Expected strikes</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <td>{r.name}</td>
              <td className="num mono">{r.n}{r.games ? <small> in {r.games} game{r.games === 1 ? "" : "s"}</small> : null}</td>
              <td className="num mono">{f1(r.entered.grade)} → <b>{f1(r.read.grade)}</b></td>
              <td className="num mono">{f1(r.entered.command)} → <b>{f1(r.read.command)}</b></td>
              <td className="num mono">{r.strike === null ? "–" : `${Math.round(r.strike * 100)}%`}</td>
            </tr>))}</tbody>
        </table></div>
      ) : <p className="shell-note">Nothing yet: the engine learns from games charted on your coach&apos;s iPad.</p>}
      {L?.at ? <p className="shell-note small">Last updated {new Date(L.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</p> : null}
    </>
  );
}
