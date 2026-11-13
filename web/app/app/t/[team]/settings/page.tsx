import type { Metadata } from "next";
import { Suspense } from "react";
import { ensureOurTeam, teamFor, teamRule } from "@/lib/team";
import PCRules from "@/lib/pitch_rules";
import { saveSettings } from "../actions";
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
      <form action={saveSettings} className="shell-form narrow" aria-label="Team settings">
        <input type="hidden" name="team" value={team} />
        <label>Team name<input name="name" defaultValue={t.team_name} required maxLength={120} /></label>
        <label>Time zone (the team&apos;s dates and rest days)<select name="timezone" defaultValue={t.timezone}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select></label>
        <label>Pitch-count rule<select name="preset" defaultValue={rule ? rule.id : ""}>
          <option value="">None</option>
          {groups.map((g) => <optgroup key={g} label={g}>{PCRules.PRESETS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
        </select></label>
        <label className="w-num">Daily limit (blank: the rule&apos;s)<input name="max" type="number" min={10} max={200} defaultValue={rule && rule.edited ? rule.max : ""} placeholder={rule ? String(rule.max) : ""} /></label>
        {rule && rule.source ? <p className="shell-note small">From <a href={rule.source} target="_blank" rel="noopener">{rule.group}</a>, checked {rule.checked}. {rule.sourceNote || ""} The game app shows the full table, and any number can be changed there.</p> : null}
        <button type="submit" className="shell-btn primary">Save</button>
      </form>
      {t.active ? null : <p className="shell-note">This team isn&apos;t switched on yet: the name and time zone save now, the pitch-count rule once billing is done.</p>}
    </>
  );
}
