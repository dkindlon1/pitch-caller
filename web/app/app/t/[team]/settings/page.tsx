import type { Metadata } from "next";
import { Suspense } from "react";
import { ensureOurTeam, teamFor, teamRule } from "@/lib/team";
import PCRules from "@/lib/pitch_rules";
import { removeWatch, saveSettings } from "../actions";
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
  // Build 4: the team's watches (paired and registered from the game app). Removing one stops every device on the team
  // from sending it a game key; it has to be paired again (passkey) and re-added by a coach who manages the roster.
  const { data: watchRows } = await (await getServerSupabase()).rpc("pc_watch_list", { p: team });
  const watches = (Array.isArray(watchRows) ? watchRows : []) as { watch_id: string; name: string; role: string; removed: boolean }[];
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
      <section className="shell-form rows watches" aria-labelledby="h-watches">
        <h2 id="h-watches">Watches</h2>
        <p className="shell-note small">Watches paired from the game app (Setup, Watches). Each one paired once with the code it shows; every game sends it a fresh key. Remove a lost or stolen watch here: no device on the team will send it another key.</p>
        {watches.length ? (
          <ul className="watch-list">
            {watches.map((w) => (
              <li key={w.watch_id} className={w.removed ? "removed" : undefined}>
                <span><b>{w.name}</b> <span className="shell-note small">{w.role === "catcher" ? "Catcher's watch" : "Pitcher's watch"}{w.removed ? " · removed" : ""}</span></span>
                {w.removed ? <span className="shell-note small">Pair it again in the game app to add it back.</span> : (
                  <details className="watch-remove">
                    <summary className="shell-btn">Remove…</summary>
                    <form action={removeWatch}>
                      <input type="hidden" name="team" value={team} /><input type="hidden" name="watch" value={w.watch_id} />
                      <p className="shell-note small">{w.name} won&apos;t get another game key. A game it&apos;s in now keeps working until it ends or the watch restarts.</p>
                      <button type="submit" className="shell-btn danger">Remove {w.name}</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="shell-note">No watches yet. Pair one from the game app on a laptop (Chrome): Setup, Watches.</p>}
      </section>
    </>
  );
}
