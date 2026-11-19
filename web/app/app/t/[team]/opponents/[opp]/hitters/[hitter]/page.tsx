import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildHitterAtBats, type Ev } from "@/lib/report_data.ts";
import { hitterEvents, teamGames, teamNames, teamPitchers, type SB } from "@/lib/report_fetch.ts";
import { cleanHitterScouting, cellWords, type Heat, type Spray } from "@/lib/opp_model.ts";
import { suggestionQuestion } from "@/lib/opp_suggest.ts";
import { defsFor } from "@/lib/opp_server";
import { AtBatList, Section, dayText } from "@/app/app/_reports/ui";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { HitterEditor } from "@/app/app/_opp/HitterEditor";
import { decideSuggestion } from "../../../actions";
import { Notice, type Search } from "../../../../ui";

export const metadata: Metadata = { title: "Hitter · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; opp: string; hitter: string }>;
const BATS: Record<string, string> = { R: "Bats right", L: "Bats left", S: "Switch hitter" };
const TAG_WORDS: Record<string, Record<string, string>> = { approach: { aggressive: "Aggressive early", patient: "Patient early" }, path: { lift: "Lift swing", flat: "Flat swing" }, offspeed: { hits: "Hits off-speed hard" } };
type HDoc = { id: string; name?: string; number?: string; bats?: string; teamId?: string; scoutTags?: Record<string, string>; aliases?: string[]; mergedInto?: string } & Record<string, unknown>;

export default function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} searchParams={searchParams} /></Suspense>;
}

// One opponent hitter (plan 3): his header, ratings, hot and cold grid, pitch checkboxes, speed / small ball, notes,
// the owner's custom fields, the suggestions waiting on a coach, and every at-bat against us across seasons (merged
// duplicates included). Coaches only; players never see opponents. Editing: coaches who manage opponents.
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, opp, hitter } = await params, sp = await searchParams;
  const { isCoach, can, oppOwner, team: t } = await teamFor(team);
  if (!isCoach && !oppOwner) notFound();
  const sb = await getServerSupabase(), db = sb as unknown as SB;
  const hres = (await sb.from("hitters").select("doc").eq("program_id", team).eq("id", hitter).limit(1)) as unknown as { data: { doc: HDoc }[] | null };
  const h = hres.data?.[0]?.doc;
  if (!h || h.teamId !== opp) notFound();
  const ids = [hitter, ...(h.aliases || [])];
  // the owner off the staff (oppOwner) can't read games or events: his page leaves game history out and says so
  const staff = isCoach;
  const [games, pitchers, names, defs, sugg, ...evLists] = await Promise.all([teamGames(db, team), teamPitchers(db, team), teamNames(db, team), defsFor(t.org_id),
    // the staff read the suggestions with their evidence; the owner off the staff gets the question only (the evidence is game history)
    staff ? sb.from("opp_suggestions").select("id, kind, key, value, text, n").eq("program_id", team).eq("hitter_id", hitter).eq("status", "pending").order("created_at")
      : sb.rpc("pc_opp_suggestions_owner", { p: team, hitter }),
    ...(staff ? ids.map((id) => hitterEvents(db, team, id)) : [])]);
  // at-bats of a merged duplicate count as his: read under his id
  const evs = (evLists as Ev[][]).flat().map((e) => (e.hitterId && ids.includes(e.hitterId) ? { ...e, hitterId: hitter } : e));
  const abs = buildHitterAtBats(evs, games.map((g) => ({ id: g.id, date: String(g.date) })), pitchers.map((p) => ({ id: p.id, name: p.name, hand: p.hand, pitches: p.pitches })), hitter);
  const ended = abs.filter((a) => a.ended), count = (r: string) => ended.filter((a) => a.result === r).length;
  const seasons = [...new Set(abs.map((a) => a.date.slice(0, 4)))].sort();
  const sc = cleanHitterScouting(h, defs), canEdit = can("manage_opponents") || can("manage_roster") || oppOwner;
  const spray = (h.scoutTags || {}).spray as Spray | undefined;
  const tags = Object.entries(h.scoutTags || {}).filter(([k]) => TAG_WORDS[k]).map(([k, v]) => TAG_WORDS[k][v]).filter(Boolean);
  const pending = (((sugg as { data: unknown }).data || []) as { id: string; kind: string; key: string; value: string; text?: string; n?: number }[])
    .map((s) => (staff ? s : { ...s, text: suggestionQuestion(s, (k) => cellWords(k, h.bats || "R")), n: undefined }));
  return (
    <article className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={`/app/t/${team}/opponents/${opp}`}><span aria-hidden="true">←</span> {names.get(opp) || "Opponent"}</Link>
        <h1>{h.number ? `#${h.number} ` : ""}{h.name || "Hitter"}</h1>
        <p className="rp-sub"><span>{names.get(opp) || "Opponent"}</span>{h.bats ? <><span className="sep" aria-hidden="true">·</span><span>{BATS[h.bats] || h.bats}</span></> : null}
          {sc.classYear ? <><span className="sep" aria-hidden="true">·</span><span>{sc.classYear}</span></> : null}
          {staff ? <><span className="sep" aria-hidden="true">·</span><span>{seasons.length ? `Seen ${seasons.join(", ")}` : "Not faced yet"}</span></> : null}
          {(h.aliases || []).length ? <><span className="sep" aria-hidden="true">·</span><span>{h.aliases!.length} merged record{h.aliases!.length === 1 ? "" : "s"}</span></> : null}</p>
        {tags.length ? <div className="op-tags" aria-label="Scouting tags the engine reads">{tags.map((x) => <span key={x} className="rp-pill">{x}</span>)}<span className="rp-note">(set in the game app; the engine reads these)</span></div> : null}
      </header>
      <Notice sp={sp} />
      {staff ? <dl className="rp-line">
        <div><dt>At-bats seen</dt><dd data-k="hitter.abs" data-v={ended.length}>{ended.length}</dd></div>
        <div><dt>Strikeouts</dt><dd data-k="hitter.k" data-v={count("k")}>{count("k")}</dd></div>
        <div><dt>Walks</dt><dd data-k="hitter.bb" data-v={count("walk")}>{count("walk")}</dd></div>
        <div><dt>Hits</dt><dd data-k="hitter.h" data-v={count("hit")}>{count("hit")}</dd></div>
        <div><dt>Hard contact</dt><dd data-k="hitter.hard" data-v={abs.reduce((a, b) => a + b.hard, 0)}>{abs.reduce((a, b) => a + b.hard, 0)}</dd></div>
      </dl> : null}
      {pending.length ? (
        <Section id="sugg" title="Suggestions from his at-bats" aside={<span className="rp-note">Nothing changes until a coach accepts</span>}>
          <ul className="op-sugg">{pending.map((s) => (
            <li key={s.id}><p>{s.text}</p>
              {canEdit ? <>
                <form action={decideSuggestion}><input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} /><input type="hidden" name="hitter" value={hitter} /><input type="hidden" name="suggestion" value={s.id} /><input type="hidden" name="accept" value="1" />
                  <button className="shell-btn small" type="submit">Accept</button></form>
                <form action={decideSuggestion}><input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} /><input type="hidden" name="hitter" value={hitter} /><input type="hidden" name="suggestion" value={s.id} /><input type="hidden" name="accept" value="0" />
                  <button className="shell-btn text small" type="submit">Dismiss</button></form></> : null}
            </li>))}</ul>
        </Section>) : null}
      <HitterEditor team={team} opp={opp} hitter={hitter} bats={h.bats || "R"} defs={defs} canEdit={canEdit}
        init={{ ratings: sc.ratings || {}, spray: spray || null, zone: (sc.zone || {}) as Record<string, Heat>, pitchFlags: sc.pitchFlags || {}, smallBall: sc.smallBall || {},
          classYear: sc.classYear || "", notes: typeof h.notes === "string" ? h.notes : "", custom: sc.custom || {} }} />
      {staff ? <Section id="abs" title="Every at-bat" aside={<span className="rp-note">Across seasons, newest first</span>}>
        <AtBatList abs={abs} k="hab" who={(a) => {
          const x = abs.find((y) => y.game === a.game && y.key === a.key)!;
          return <Link href={`/app/t/${team}/reports/${x.game}/${x.pitcherId}`}>{dayText(x.date, { month: "short", day: "numeric", year: "numeric" })} vs {x.pitcherName}</Link>;
        }} />
      </Section> : <section className="rp-sec" aria-label="Game history"><p className="rp-empty op-staff-only">Only the team&rsquo;s staff can see game history.</p></section>}
    </article>
  );
}
