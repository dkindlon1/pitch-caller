import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { myPitchers, playerTeam } from "@/lib/player";
import { SLOTS } from "@/lib/docs";
import { saveProfile } from "../../actions";
import { Notice, type Search } from "../ui";

export const metadata: Metadata = { title: "Profile · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;

export default function Profile({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params, sp = await searchParams;
  const { team: t } = await playerTeam(team);
  const p = (await myPitchers(team)).find((x) => x.id === pitcher);
  if (!p) notFound();
  const off = !t.active;
  return (
    <>
      <h1 className="shell-h1">Profile</h1>
      <Notice sp={sp} />
      <form action={saveProfile} className="shell-form" aria-label="Profile">
        <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={pitcher} />
        <label>Name<input name="name" defaultValue={p.name} maxLength={80} disabled={off} /></label>
        <div className="row-fields">
          <label className="w-num">Number<input name="number" defaultValue={p.number} inputMode="numeric" maxLength={3} disabled={off} /></label>
          <label className="w-sel">Throws<select name="hand" defaultValue={p.hand} disabled={off}><option value="R">Right</option><option value="L">Left</option></select></label>
          <label className="w-num">Grad year<input name="gradYear" defaultValue={p.gradYear || ""} inputMode="numeric" maxLength={4} placeholder="2028" disabled={off} /></label>
          <label className="w-num">Height (feet)<input name="height_ft" type="number" step="0.01" min={4} max={7.5} defaultValue={p.height_ft ?? ""} disabled={off} /></label>
        </div>
        <label>Arm slot<select name="slot" defaultValue={p.slot && SLOTS.includes(p.slot) ? p.slot : "three-quarter"} disabled={off}>{SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <p className="shell-note small">Your height and arm slot help the engine read how your pitches move. Your coaches set your role and keep their own notes.</p>
        {off ? null : <button type="submit" className="shell-btn primary">Save</button>}
      </form>
    </>
  );
}
