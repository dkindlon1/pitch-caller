import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { defsFor } from "@/lib/opp_server";
import { saveField } from "../actions";
import { ConfirmSubmit } from "../../../../_frame/ConfirmSubmit";
import { Notice, type Search } from "../../ui";
import "@/app/app/_reports/reports.css";
import "@/app/app/_opp/opp.css";

export const metadata: Metadata = { title: "Opponent fields · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;
const KIND: Record<string, string> = { checkbox: "Checkbox", dropdown: "Dropdown", grid: "Zone grid", text: "Text" };

export default function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

// The organization's own scouting fields (plan: custom fields): the owner creates them (checkbox, dropdown, zone grid,
// text) for hitters or teams; every coach fills them in on the opponent pages. Coach info only: never the engine.
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { team: t } = await teamFor(team);
  const defs = await defsFor(t.org_id), owner = t.is_owner;
  const row = (d: (typeof defs)[number]) => (
    <li key={d.id} className="rp-card" style={{ display: "grid", gap: 8 }}>
      {owner ? (
        <form action={saveField} className="op-merge">
          <input type="hidden" name="team" value={team} /><input type="hidden" name="org" value={t.org_id} /><input type="hidden" name="field" value={d.id} />
          <input type="hidden" name="kind" value={d.kind} /><input type="hidden" name="scope" value={d.scope} />
          <label className="op-field"><span>Name</span><input name="label" defaultValue={d.label} maxLength={60} required autoComplete="off" /></label>
          {d.kind === "dropdown" ? <label className="op-field"><span>Choices</span><input name="options" defaultValue={d.options.join(", ")} autoComplete="off" /></label> : null}
          <label className="op-field" style={{ width: 90 }}><span>Order</span><input name="position" type="number" defaultValue={d.position} min={0} max={99} /></label>
          <input type="hidden" name="archive" value={d.archived_at ? "1" : "0"} />
          <button className="shell-btn small" type="submit">Save</button>
        </form>) : <strong>{d.label}</strong>}
      <span className="rp-note">{KIND[d.kind]} · for {d.scope === "hitter" ? "hitters" : "teams"}{d.kind === "dropdown" && !owner ? `: ${d.options.join(", ")}` : ""}{d.archived_at ? " · archived (kept on records, read only)" : ""}</span>
      {owner ? <form action={saveField}><input type="hidden" name="team" value={team} /><input type="hidden" name="org" value={t.org_id} /><input type="hidden" name="field" value={d.id} />
        <input type="hidden" name="kind" value={d.kind} /><input type="hidden" name="scope" value={d.scope} /><input type="hidden" name="label" value={d.label} /><input type="hidden" name="options" value={d.options.join(",")} />
        <input type="hidden" name="position" value={d.position} /><input type="hidden" name="archive" value={d.archived_at ? "0" : "1"} />
        {d.archived_at ? <button className="shell-btn text small" type="submit">Bring it back</button> : <ConfirmSubmit label="Archive" confirm="Yes, archive it" keep="Keep it" />}</form> : null}
    </li>);
  return (
    <div className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={`/app/t/${team}/opponents`}><span aria-hidden="true">←</span> Opponents</Link>
        <h1>Your scouting fields</h1>
        <p className="rp-sub"><span>{t.org_name}</span><span className="sep" aria-hidden="true">·</span><span>{owner ? "You set these up as the owner" : "Set up by your organization's owner"}</span></p>
      </header>
      <Notice sp={sp} />
      <p className="rp-note">Fields your staff fills in on every hitter or opponent page, on all of the organization&rsquo;s teams. They&rsquo;re for the staff only: the engine never reads them, and players never see opponents.</p>
      {defs.length ? <ul className="pq-list" style={{ display: "grid", gap: 10 }}>{defs.map(row)}</ul> : <p className="rp-empty">No fields yet.{owner ? " Add the first one below." : ""}</p>}
      {owner ? (
        <section className="rp-sec" aria-labelledby="h-addf">
          <header><h2 id="h-addf">Add a field</h2></header>
          <form action={saveField} className="rp-card op-merge" aria-label="Add a field">
            <input type="hidden" name="team" value={team} /><input type="hidden" name="org" value={t.org_id} />
            <label className="op-field"><span>Name</span><input name="label" maxLength={60} required placeholder="Plays first base…" autoComplete="off" /></label>
            <label className="op-field"><span>For</span><select name="scope" defaultValue="hitter"><option value="hitter">Hitters</option><option value="team">Teams</option></select></label>
            <label className="op-field"><span>Kind</span><select name="kind" defaultValue="checkbox"><option value="checkbox">Checkbox</option><option value="dropdown">Dropdown</option><option value="grid">Zone grid</option><option value="text">Text</option></select></label>
            <label className="op-field"><span>Choices (dropdown)</span><input name="options" placeholder="FR, SO, JR, SR…" autoComplete="off" /></label>
            <input type="hidden" name="position" value={defs.length} />
            <button className="shell-btn" type="submit">Add the field</button>
          </form>
        </section>) : null}
    </div>
  );
}
