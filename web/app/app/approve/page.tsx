import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { Shell } from "../../shell";
import { approveShare, revokeShare } from "../_reports/share_actions";

export const metadata: Metadata = { title: "Approve a recap link · PitchIQ", robots: { index: false } };
type Req = { token: string; team_name: string; pitcher_name: string; season_name: string; sections: Record<string, boolean>; approved: boolean; created_at: string };
const SEC: [string, string][] = [["summary", "Summary stats"], ["heat", "Heat maps"], ["outings", "Outing list (no opponents)"], ["pitches", "Pitch by pitch"]];

// A parent's account: the public recap links their under-18 player made, waiting on them (or already approved). Only
// the parent's own account sees these (pc_my_share_requests checks it); approving turns the link on, and the parent
// can turn it back off or kill it at any time.
export default function ApprovePage() {
  return <Shell title="Your player's recap links"><Suspense fallback={<p className="shell-note">Loading…</p>}><Body /></Suspense></Shell>;
}

async function Body() {
  const user = await getUser();
  if (!user) redirect("/login?next=/app/approve");
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_my_share_requests");
  const rows = (data || []) as Req[];
  if (!rows.length) return <p className="shell-note">Nothing waiting. When your player makes a public link to a season recap, it shows up here for you to approve, and we email you.</p>;
  return (
    <>
      <p className="shell-note">Players under 18 need a parent to turn on a public link. A link anyone can open shows only what&rsquo;s listed; coach notes and the calls behind each pitch are never on it.</p>
      <ul className="pq-list" style={{ display: "grid", gap: 14 }}>{rows.map((r) => (
        <li key={r.token} className="pq-pane" style={{ display: "grid", gap: 10, padding: 18, borderRadius: 18, background: "var(--panel-2)", border: "1px solid var(--rule)" }}>
          <div><strong>{r.pitcher_name}</strong> <span className="shell-note small">· {r.team_name} · {r.season_name}</span></div>
          <p className="shell-note small" style={{ margin: 0 }}>It shows: {SEC.filter(([k]) => r.sections[k]).map(([, l]) => l).join(", ") || "nothing yet"}.</p>
          <p className="shell-note small" style={{ margin: 0 }} role="status">{r.approved ? "You approved it: the link is live." : "Waiting for you: the link is off."}</p>
          <div className="btn-row inline">
            <form action={approveShare}><input type="hidden" name="token" value={r.token} /><input type="hidden" name="approve" value={r.approved ? "0" : "1"} />
              <button className="shell-btn small" type="submit">{r.approved ? "Turn it off" : "Approve and turn it on"}</button></form>
            {r.approved ? <a className="shell-btn text small" href={`/r/${r.token}`}>See the page</a> : null}
            <form action={revokeShare}><input type="hidden" name="token" value={r.token} /><input type="hidden" name="path" value="/app/approve" />
              <button className="shell-btn text small" type="submit">Delete the link</button></form>
          </div>
        </li>))}</ul>
    </>
  );
}
