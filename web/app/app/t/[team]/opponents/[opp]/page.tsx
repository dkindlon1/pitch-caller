import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hittersOf, teamFor, teamsOf } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { teamGames, type SB } from "@/lib/report_fetch.ts";
import { cleanTeamScouting } from "@/lib/opp_model.ts";
import { defsFor } from "@/lib/opp_server";
import { dayText } from "@/app/app/_reports/ui";
import { TeamEditor } from "@/app/app/_opp/TeamEditor";
import { ConfirmSubmit } from "../../../../_frame/ConfirmSubmit";
import { addHitters } from "../../actions";
import { mergeHitters } from "../actions";
import { Notice, type Search } from "../../ui";
import "@/app/app/_reports/reports.css";
import "@/app/app/_opp/opp.css";

export const metadata: Metadata = { title: "Opponent · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; opp: string }>;
type HDoc = { id: string; name: string; number: string; bats: string; teamId: string; aliases?: string[]; classYear?: string };

export default function Opponent({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

// An opponent team (plan 4): its hitters across seasons (each to his page), lineup history from the games, tendencies
// and the owner's team fields, a merge tool for a hitter entered twice, and adding hitters. Coaches only.
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, opp } = await params, sp = await searchParams;
  const { manage, can, isCoach, team: t } = await teamFor(team);
  if (!isCoach) notFound();
  const [teams, hitters] = await Promise.all([teamsOf(team), hittersOf(team)]);
  const o = teams.find((x) => x.id === opp && !x.isOurs) as (typeof teams)[number] & { tendencies?: Record<string, boolean>; custom?: Record<string, unknown> } | undefined;
  if (!o) notFound();
  const mine = (hitters as unknown as HDoc[]).filter((x) => x.teamId === opp).sort((a, b) => (+a.number || 999) - (+b.number || 999) || (a.name || "").localeCompare(b.name || ""));
  const edit = manage("manage_opponents") || manage("manage_roster"), canEdit = can("manage_opponents") || can("manage_roster");
  const sb = await getServerSupabase();
  // every at-bat against this team: who batted where, game by game (pitch events every coach can read)
  const idOf = new Map<string, string>(); for (const h of mine) { idOf.set(h.id, h.id); for (const a of h.aliases || []) idOf.set(a, h.id); }
  const readRows = async () => {   // in pages: PostgREST returns at most 1,000 rows a request
    const out: { game_id: string; hitterId: string; slot: number; end: boolean }[] = [], ids = [...idOf.keys()];
    if (!ids.length) return out;
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from("events").select("id, game_id, doc->hitterId, doc->slot, doc->end").eq("program_id", team).is("deleted_at", null).in("doc->>hitterId", ids.slice(0, 400)).order("id").range(from, from + 999);
      const got = (data || []) as unknown as typeof out; out.push(...got);
      if (got.length < 1000) return out;
    }
  };
  const [games, defs, rows] = await Promise.all([teamGames(sb as unknown as SB, team), defsFor(t.org_id), readRows()]);
  const seen = new Map<string, number>(), years = new Map<string, Set<string>>(), lineups = new Map<string, Map<number, string>>();
  const dateOf = new Map(games.map((g) => [g.id, String(g.date)]));
  for (const r of rows) {
    const hid = idOf.get(r.hitterId); if (!hid) continue;
    if (r.end) seen.set(hid, (seen.get(hid) || 0) + 1);
    const d = dateOf.get(r.game_id); if (d) (years.get(hid) || years.set(hid, new Set()).get(hid)!).add(d.slice(0, 4));
    const l = lineups.get(r.game_id) || lineups.set(r.game_id, new Map()).get(r.game_id)!;
    if (typeof r.slot === "number" && !l.has(r.slot)) l.set(r.slot, hid);
  }
  const nameOf = (id: string) => { const h = mine.find((x) => x.id === id); return h ? `${h.number ? "#" + h.number + " " : ""}${h.name}` : "Hitter"; };
  const history = [...lineups.entries()].filter(([g]) => dateOf.has(g)).sort((a, b) => dateOf.get(b[0])!.localeCompare(dateOf.get(a[0])!));
  const BATS: Record<string, string> = { R: "Right", L: "Left", S: "Switch" };
  const sc = cleanTeamScouting(o as unknown as Record<string, unknown>, defs);
  return (
    <div className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={`/app/t/${team}/opponents`}><span aria-hidden="true">←</span> Opponents</Link>
        <h1>{o.name}</h1>
        <p className="rp-sub"><span>{mine.length} hitter{mine.length === 1 ? "" : "s"}</span><span className="sep" aria-hidden="true">·</span><span>{history.length} game{history.length === 1 ? "" : "s"} against us</span></p>
      </header>
      <Notice sp={sp} />
      <div className="op-two">
        <section className="rp-sec" aria-labelledby="h-roster">
          <header><h2 id="h-roster">Hitters, across seasons</h2></header>
          {mine.length ? <div className="tbl-scroll" tabIndex={0} role="region" aria-label="Hitters table"><table className="data-tbl" aria-label="Hitters">
            <thead><tr><th className="num">#</th><th>Hitter</th><th>Bats</th><th>Seen</th><th className="num">At-bats seen</th></tr></thead>
            <tbody>{mine.map((x) => <tr key={x.id}><td className="num mono">{x.number}</td><td><Link href={`/app/t/${team}/opponents/${opp}/hitters/${x.id}`}>{x.name}</Link>{x.classYear ? <span className="rp-note"> {x.classYear}</span> : null}</td><td>{BATS[x.bats] || x.bats}</td>
              <td>{[...(years.get(x.id) || [])].sort().join(", ") || "–"}</td>
              <td className="num mono" data-k={`opp.${x.id}.abs`} data-v={seen.get(x.id) || 0}>{seen.get(x.id) || "–"}</td></tr>)}</tbody>
          </table></div> : <p className="rp-empty">No hitters yet.</p>}
        </section>
        <TeamEditor team={team} opp={opp} defs={defs} canEdit={canEdit} init={{ tendencies: sc.tendencies || {}, custom: sc.custom || {} }} />
      </div>
      <section className="rp-sec" aria-labelledby="h-lineups">
        <header><h2 id="h-lineups">Lineups we&rsquo;ve faced</h2><span className="rp-note">From the at-bats in each game</span></header>
        {history.length ? <div className="op-lineups">{history.slice(0, 12).map(([g, l]) => (
          <div key={g} className="rp-card op-lineup"><strong>{dayText(dateOf.get(g)!, { month: "short", day: "numeric", year: "numeric" })}</strong>
            <ol>{[...l.entries()].sort((a, b) => a[0] - b[0]).map(([slot, hid]) => <li key={slot} value={slot + 1}>{nameOf(hid)}</li>)}</ol></div>))}</div>
          : <p className="rp-empty">No games against them yet. Lineups fill in from the at-bats once a game syncs.</p>}
      </section>
      {edit && mine.length > 1 ? (
        <section className="rp-sec" aria-labelledby="h-merge">
          <header><h2 id="h-merge">Same hitter entered twice?</h2></header>
          <form action={mergeHitters} className="rp-card op-merge">
            <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} />
            <label className="op-field"><span>Keep</span><select name="keep" required defaultValue="">{[<option key="" value="" disabled>Pick a hitter</option>, ...mine.map((h) => <option key={h.id} value={h.id}>{nameOf(h.id)}</option>)]}</select></label>
            <label className="op-field"><span>Merge into him</span><select name="drop" required defaultValue="">{[<option key="" value="" disabled>Pick a hitter</option>, ...mine.map((h) => <option key={h.id} value={h.id}>{nameOf(h.id)}</option>)]}</select></label>
            <ConfirmSubmit label="Merge them" confirm="Yes, merge them" keep="Not yet" />
            <p className="rp-note" style={{ flexBasis: "100%" }}>The kept hitter takes the other&rsquo;s at-bats and fills any scouting he&rsquo;s missing; the other record goes away on every device.</p>
          </form>
        </section>) : null}
      {edit ? (
        <section className="rp-sec" aria-labelledby="h-add">
          <header><h2 id="h-add">Add hitters</h2></header>
          <form action={addHitters} className="shell-form rp-card" aria-label="Add hitters">
            <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} />
            <label>Their hitters, one per line: number, name, and R, L or S for how he bats (R if left out). A number already here updates that hitter.
              <textarea name="hitters" rows={6} required placeholder={"12 Smith R\n4 Jones L\n22 Diaz S"} /></label>
            <button type="submit" className="shell-btn primary">Save hitters</button>
          </form>
        </section>) : null}
    </div>
  );
}
