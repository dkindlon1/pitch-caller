import type { Metadata } from "next";
import { Suspense } from "react";
import { ensureOurTeam, teamFor, teamRule } from "@/lib/team";
import PCRules from "@/lib/pitch_rules";
import { markSeasonOver, saveSettings } from "../actions";
import { getServerSupabase } from "@/lib/supabase/server";
import { Notice, type Search } from "../ui";

export const metadata: Metadata = { title: "Settings · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

export default function Settings({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { team: t, manage } = await teamFor(team);
  if (!manage("manage_roster")) return <p className="shell-note">Settings are for coaches who manage the roster.</p>;
  const ours = t.active ? await ensureOurTeam(t) : null;
  const rule = teamRule(ours);
  const zones = Intl.supportedValuesOf("timeZone");
  const groups = [...new Set(PCRules.PRESETS.map((x) => x.group))];
  return (
    <>
      <h1 className="shell-h1">Settings</h1>
      <Notice sp={sp} />
      <form action={saveSettings} className="shell-form rows" aria-label="Team settings">
        <input type="hidden" name="team" value={team} />
        <h2>Team</h2>
        <label><span>Team name</span><input name="name" defaultValue={t.team_name} required maxLength={120} /></label>
        <label><span>Time zone <small>(the team&apos;s dates and rest days)</small></span><select name="timezone" defaultValue={t.timezone}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select></label>
        <h2>Pitch counts</h2>
        <label><span>Pitch-count rule</span><select name="preset" defaultValue={rule ? rule.id : ""}>
          <option value="">None</option>
          {groups.map((g) => <optgroup key={g} label={g}>{PCRules.PRESETS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
        </select></label>
        <label className="w-num"><span>Daily limit <small>(blank: the rule&apos;s)</small></span><input name="max" type="number" min={10} max={200} defaultValue={rule && rule.edited ? rule.max : ""} placeholder={rule ? String(rule.max) : ""} /></label>
        {rule && rule.source ? <p className="shell-note small">From <a href={rule.source} target="_blank" rel="noopener">{rule.group}</a>, checked {rule.checked}. {rule.sourceNote || ""} The game app shows the full table, and any number can be changed there.</p> : null}
        <button type="submit" className="shell-btn primary">Save</button>
      </form>
      {t.active ? null : <p className="shell-note">This team isn&apos;t switched on yet: the name and time zone save now, the pitch-count rule once billing is done.</p>}
      <Seasons team={team} active={t.active} />
    </>
  );
}

// Seasons (Build 1): "Mark season over" freezes each pitcher's final recap and emails it; the season so far starts again.
async function Seasons({ team, active }: { team: string; active: boolean }) {
  const sb = await getServerSupabase();
  const { data } = await sb.from("seasons").select("id, name, start_date, end_date").eq("program_id", team).order("end_date", { ascending: false }).limit(20);
  const rows = (data || []) as { id: string; name: string; start_date: string; end_date: string }[];
  const d = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <section className="shell-form rows" aria-labelledby="seasons-h" style={{ marginTop: 28 }}>
      <h2 id="seasons-h">Seasons</h2>
      {rows.length ? <ul className="pq-list">{rows.map((r) => <li key={r.id}>{r.name} <span className="shell-note small">({d(r.start_date)} – {d(r.end_date)})</span></li>)}</ul>
        : <p className="shell-note small">No season marked over yet: every pitcher&apos;s recap is his whole history so far.</p>}
      {active ? (
        <form action={markSeasonOver} className="shell-form" aria-label="Mark season over">
          <input type="hidden" name="team" value={team} />
          <label><span>Season name</span><input name="season" required maxLength={80} placeholder="Spring 2026…" autoComplete="off" /></label>
          <p className="shell-note small">Marking the season over builds each pitcher&apos;s final recap from every game since {rows.length ? "the last season" : "the first game"} through today, freezes it, and emails it to him and to the coaches. Games after today start the next season so far. It can&apos;t be undone.</p>
          <button type="submit" className="shell-btn">Mark season over</button>
        </form>
      ) : null}
    </section>
  );
}
