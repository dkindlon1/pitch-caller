import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildHitterAtBats } from "@/lib/report_data.ts";
import { hitterEvents, teamGames, teamNames, teamPitchers, type SB } from "@/lib/report_fetch.ts";
import { AtBatList, Section, dayText } from "@/app/app/_reports/ui";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";

export const metadata: Metadata = { title: "Hitter · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; opp: string; hitter: string }>;
const BATS: Record<string, string> = { R: "Bats right", L: "Bats left", S: "Switch hitter" };

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// One opponent hitter: every at-bat against our pitchers, across seasons, newest first, each linked to its outing
// report. Coaches only (players never see opponents).
async function Body({ params }: { params: Params }) {
  const { team, opp, hitter } = await params;
  const { isCoach } = await teamFor(team);
  if (!isCoach) notFound();
  const sb = await getServerSupabase();
  const hres = (await sb.from("hitters").select("doc").eq("program_id", team).eq("id", hitter).limit(1)) as unknown as { data: { doc: { name?: string; number?: string; bats?: string; teamId?: string } }[] | null };
  const h = hres.data?.[0]?.doc;
  if (!h || h.teamId !== opp) notFound();
  const db = sb as unknown as SB;
  const [games, pitchers, names, evs] = await Promise.all([teamGames(db, team), teamPitchers(db, team), teamNames(db, team), hitterEvents(db, team, hitter)]);
  const abs = buildHitterAtBats(evs, games.map((g) => ({ id: g.id, date: String(g.date) })), pitchers.map((p) => ({ id: p.id, name: p.name, hand: p.hand, pitches: p.pitches })), hitter);
  const ended = abs.filter((a) => a.ended);
  const count = (r: string) => ended.filter((a) => a.result === r).length;
  return (
    <article className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={`/app/t/${team}/opponents/${opp}`}><span aria-hidden="true">←</span> {names.get(opp) || "Opponent"}</Link>
        <h1>{h.number ? `#${h.number} ` : ""}{h.name || "Hitter"}</h1>
        <p className="rp-sub"><span>{names.get(opp) || "Opponent"}</span>{h.bats ? <><span className="sep" aria-hidden="true">·</span><span>{BATS[h.bats] || h.bats}</span></> : null}</p>
      </header>
      <dl className="rp-line">
        <div><dt>At-bats seen</dt><dd data-k="hitter.abs" data-v={ended.length}>{ended.length}</dd></div>
        <div><dt>Strikeouts</dt><dd data-k="hitter.k" data-v={count("k")}>{count("k")}</dd></div>
        <div><dt>Walks</dt><dd data-k="hitter.bb" data-v={count("walk")}>{count("walk")}</dd></div>
        <div><dt>Hits</dt><dd data-k="hitter.h" data-v={count("hit")}>{count("hit")}</dd></div>
        <div><dt>Hard contact</dt><dd data-k="hitter.hard" data-v={abs.reduce((a, b) => a + b.hard, 0)}>{abs.reduce((a, b) => a + b.hard, 0)}</dd></div>
      </dl>
      <Section id="abs" title="Every at-bat" aside={<span className="rp-note">Across seasons, newest first</span>}>
        <AtBatList abs={abs} k="hab" who={(a) => {
          const x = abs.find((y) => y.game === a.game && y.key === a.key)!;
          return <Link href={`/app/t/${team}/reports/${x.game}/${x.pitcherId}`}>{dayText(x.date, { month: "short", day: "numeric", year: "numeric" })} vs {x.pitcherName}</Link>;
        }} />
      </Section>
    </article>
  );
}
