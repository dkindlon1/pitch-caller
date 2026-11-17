import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { pitchersOf, teamFor, ROLE, TOGGLES, PRESET_PERMS, OWNER_ONLY } from "@/lib/team";
import { approveInvite, cancelInvite, inviteStaff, removeMember, setMember } from "../actions";
import { Notice, one, type Search } from "../ui";

export const metadata: Metadata = { title: "Staff · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;
type Staff = { user_id: string | null; email: string | null; role: string; perms: Record<string, boolean>; pitcher_ids: string[]; pending: boolean; token: string | null; needs_approval: boolean };
const COACH = ["head", "pitching", "caller", "viewer"];

export default function StaffPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { user, manage, team: t } = await teamFor(team);
  const owner = t.is_owner && t.status !== "removed";
  const staffOk = manage("manage_staff"), rosterOk = manage("manage_roster");
  if (!staffOk && !rosterOk) return <p className="shell-note">The staff list is for coaches who manage the staff or the roster.</p>;
  const sb = await getServerSupabase();
  const [list, pitchers] = [((await sb.rpc("pc_staff", { p: team })).data || []) as Staff[], await pitchersOf(team)];
  const h = await headers(), origin = `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const pname = (id: string) => { const p = pitchers.find((x) => x.id === id); return p ? p.name || "an unnamed pitcher" : "a player"; };
  const coaches = list.filter((s) => !s.pending && s.role !== "player"), players = list.filter((s) => !s.pending && s.role === "player"), pending = list.filter((s) => s.pending);
  const invite = one(sp.invite);
  return (
    <>
      <h1 className="shell-h1">Staff</h1>
      <Notice sp={sp} />
      {invite ? <div className="shell-note invite-box" role="status">Invite link for a {(ROLE[one(sp.role)] || "coach").toLowerCase()}: <code>{`${origin}/join/${invite}`}</code>. It works once, for 14 days. <MailNote v={one(sp.mailed)} /></div> : null}
      <div className="pq-cols">
      <div>
      {staffOk ? <>
        <h2 className="shell-h2">Coaches<span className="count">{coaches.length}</span></h2>
        <ul className="staff-list">{coaches.map((m) => {
          const eff = (k: string) => (k in (m.perms || {}) ? !!m.perms[k] : (PRESET_PERMS[m.role] || []).includes(k));
          const me = m.user_id === user.id;
          return (
            <li key={m.user_id || ""} className="staff-row coach">
              <form action={setMember} className="inline-form" aria-label={`Preset for ${m.email}`}>
                <input type="hidden" name="team" value={team} /><input type="hidden" name="member" value={m.user_id || ""} />
                <span className="pq-av" aria-hidden="true">{(m.email || "?").slice(0, 1).toUpperCase()}</span>
                <b>{m.email}{me ? " (you)" : ""}</b>
                <select name="role" defaultValue={m.role} aria-label={`Preset for ${m.email}`} disabled={me}>{COACH.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select>
                <details className="adv"><summary>Advanced</summary>
                  <input type="hidden" name="advanced" value="on" />
                  {TOGGLES.map(([k, l]) => <label key={k} className="check"><input type="checkbox" name={`perm_${k}`} defaultChecked={eff(k)} disabled={me || (OWNER_ONLY.has(k) && !owner)} /> {l}</label>)}
                  <span className="owner-only">{owner ? "See the game plan: you decide who sees game plans. Coaches who call games always see them." : "See the game plan: only the organization's owner changes this. Coaches who call games always see the plan."}</span>
                </details>
                {me ? null : <button type="submit" className="shell-btn">Save</button>}
              </form>
              {me ? null : <form action={removeMember}><input type="hidden" name="team" value={team} /><input type="hidden" name="member" value={m.user_id || ""} /><button className="shell-btn text" type="submit">Remove</button></form>}
            </li>);
        })}</ul>
      </> : null}
      {rosterOk && players.length ? <>
        <h2 className="shell-h2">Players<span className="count">{players.length}</span></h2>
        <ul className="staff-list">{players.map((m) => (
          <li key={m.user_id || ""} className="staff-row"><span className="pq-av" aria-hidden="true">{(m.email || "?").slice(0, 1).toUpperCase()}</span><b>{m.email}</b> <span className="shell-note small">{m.pitcher_ids.map(pname).join(", ")}</span>
            <form action={removeMember}><input type="hidden" name="team" value={team} /><input type="hidden" name="member" value={m.user_id || ""} /><button className="shell-btn text" type="submit">Remove</button></form></li>))}</ul>
      </> : null}
      {pending.length ? <>
        <h2 className="shell-h2">Waiting<span className="count">{pending.length}</span></h2>
        <ul className="staff-list">{pending.map((m) => (
          <li key={m.token || ""} className="staff-row">
            <b>{m.email || "anyone with the link"}</b>
            <span className="shell-note small">{m.needs_approval ? `A parent's email ${pname(m.pitcher_ids[0])} gave. Is it right?` : `${ROLE[m.role]}${m.pitcher_ids.length ? `: ${pname(m.pitcher_ids[0])}` : ""}`}</span>
            {m.needs_approval && rosterOk ? <form action={approveInvite}><input type="hidden" name="team" value={team} /><input type="hidden" name="token" value={m.token || ""} /><button className="shell-btn" type="submit">Approve</button></form> : null}
            <form action={cancelInvite}><input type="hidden" name="team" value={team} /><input type="hidden" name="token" value={m.token || ""} /><button className="shell-btn text" type="submit">Cancel</button></form>
          </li>))}</ul>
      </> : null}
      </div>
      {staffOk ? <aside>
        <form action={inviteStaff} className="shell-form" aria-label="Invite a coach">
          <input type="hidden" name="team" value={team} />
          <h2 className="shell-h2" style={{ margin: 0 }}>Invite a coach</h2>
          <label>Invite as<select name="role" defaultValue="caller">{COACH.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
          <label>Email (optional: ties the link to one person)<input name="email" type="email" /></label>
          <button type="submit" className="shell-btn primary">Make invite link</button>
          <p className="shell-note small">The link works once, for 14 days.</p>
        </form>
      </aside> : null}
      </div>
    </>
  );
}

// whether the invite link was emailed too (a fixed message per code)
function MailNote({ v }: { v: string }) {
  if (v === "sent") return <span>We emailed it too.</span>;
  if (v === "no_provider") return <span>Email isn&apos;t set up yet, so send this link yourself.</span>;
  if (v === "failed") return <span>The email didn&apos;t go through, so send this link yourself.</span>;
  return null;
}
