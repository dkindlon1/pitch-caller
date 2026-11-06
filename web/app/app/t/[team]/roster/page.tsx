import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { pitchersOf, teamFor } from "@/lib/team";
import { SIGN, type Kind } from "@/lib/docs";
import { addPitchers, cancelInvite, invitePlayer, removePitcher } from "../actions";
import { Notice, one, type Search } from "../ui";

export const metadata: Metadata = { title: "Roster · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;
type Staff = { user_id: string | null; email: string | null; role: string; pitcher_ids: string[]; pending: boolean; token: string | null; needs_approval: boolean };

export default function Roster({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading the roster…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { team: t, manage, isCoach } = await teamFor(team);
  if (!isCoach) return <p className="shell-note">The roster is for the team&apos;s coaches.</p>;
  const pitchers = (await pitchersOf(team)).filter((p) => !p.deletedAt).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const roster = manage("manage_roster");
  let staff: Staff[] = [];
  if (roster) { const sb = await getServerSupabase(); staff = ((await sb.rpc("pc_staff", { p: team })).data || []) as Staff[]; }
  const h = await headers(), origin = `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const invite = one(sp.invite), forPid = one(sp.for);
  const linked = (pid: string) => staff.find((s) => !s.pending && s.role === "player" && s.pitcher_ids.includes(pid));
  const pending = (pid: string) => staff.find((s) => s.pending && s.role === "player" && s.pitcher_ids.includes(pid));
  return (
    <>
      <h1 className="shell-h1">Roster</h1>
      <Notice sp={sp} />
      {invite ? <div className="shell-note invite-box" role="status">Invite link for {(pitchers.find((p) => p.id === forPid) || { name: "the player" }).name}: <code>{`${origin}/join/${invite}`}</code>. Send it to him (or his parent). It works once, for 14 days. <MailNote v={one(sp.mailed)} /></div> : null}
      {pitchers.length ? (
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Pitchers">
          <thead><tr><th>Pitcher</th><th>Throws</th><th>Arsenal</th>{roster ? <th>Account</th> : null}<th></th></tr></thead>
          <tbody>{pitchers.map((p) => {
            const acc = linked(p.id), inv = pending(p.id);
            return (
              <tr key={p.id}>
                <td><Link href={`/app/t/${team}/roster/${p.id}`}>{p.number ? `#${p.number} ` : ""}{p.name || "Unnamed"}</Link></td>
                <td>{p.hand === "L" ? "Left" : "Right"}</td>
                <td><span className="chips">{(p.pitches || []).filter((d) => d.active !== false).map((d) => <span key={d.id} className={`chip k-${d.kind}`} title={d.name}>{SIGN[d.kind as Kind]}</span>)}</span></td>
                {roster ? <td>{acc ? <span className="pill-ok">{acc.email}</span> : inv ? (
                  <form action={cancelInvite} className="inline-form"><input type="hidden" name="team" value={team} /><input type="hidden" name="from" value="roster" /><input type="hidden" name="token" value={inv.token || ""} />
                    <span className="shell-note small">{inv.needs_approval ? "Parent's email waiting for approval (Staff)" : `Invited${inv.email ? ` (${inv.email})` : ""}`}</span> <button className="shell-btn text" type="submit">Cancel</button></form>
                ) : (
                  <details className="inv"><summary>Invite</summary>
                    <form action={invitePlayer} className="shell-form tight" aria-label={`Invite ${p.name}`}>
                      <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={p.id} />
                      <label>Email (optional; a parent&apos;s for a player under 13)<input name="email" type="email" /></label>
                      <label className="check"><input type="checkbox" name="under13" /> Under 13</label>
                      <button type="submit" className="shell-btn">Make invite link</button>
                    </form>
                  </details>)}</td> : null}
                <td>{roster ? <form action={removePitcher}><input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={p.id} /><button className="shell-btn text" type="submit" aria-label={`Remove ${p.name}`}>Remove</button></form> : null}</td>
              </tr>);
          })}</tbody>
        </table></div>
      ) : <p className="shell-note">No pitchers yet.</p>}
      {roster ? (
        <form action={addPitchers} className="shell-form" aria-label="Add pitchers">
          <input type="hidden" name="team" value={team} />
          <label>Paste your pitchers, one per line (&quot;12 Smith&quot;, &quot;Jones L&quot;: L or R is how he throws; R if left out)
            <textarea name="roster" rows={6} required placeholder={"12 Smith\n7 Jones L\nAvery Brooks"} /></label>
          <button type="submit" className="shell-btn primary">Add pitchers</button>
          <p className="shell-note small">Each starts with a fastball and a changeup graded 3 (average). Open a pitcher to set his arsenal; players never need to log in for you to call a game.</p>
        </form>
      ) : null}
      {t.active ? null : <p className="shell-note">This team isn&apos;t switched on yet, so changes can&apos;t be saved until billing is done.</p>}
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
