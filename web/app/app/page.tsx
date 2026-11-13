import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { AgreeForm } from "./agree-form";
import { hasAccepted } from "@/lib/legal";
import { Shell } from "../shell";

export const metadata: Metadata = { title: "Your teams · PitchIQ", robots: { index: false } };

type TeamRow = {
  team_id: string; team_name: string; level: string | null; org_id: string; org_name: string;
  role: string | null; is_owner: boolean; active: boolean; status: string;
};
const LEVEL_NAME: Record<string, string> = { hs: "high school", travel: "travel ball", college_d3: "college D3", college_d1: "college D1" };
const ROLE: Record<string, string> = { head: "Head coach", pitching: "Pitching coach", caller: "Pitch caller", viewer: "Viewer", player: "Player" };

export default function AppHome() {
  return (
    <Shell title="Your teams" wide actions={<form action={signOut}><button type="submit" className="shell-btn text">Sign out</button></form>}>
      <Suspense fallback={<p className="shell-note">Loading your teams…</p>}>
        <Teams />
      </Suspense>
    </Shell>
  );
}

async function Teams() {
  const user = await getUser();
  if (!user) redirect("/login?next=/app");
  const sb = await getServerSupabase();
  const [{ data: teams, error }, { data: orgs }, { data: exps }, agreed] = await Promise.all([
    sb.rpc("pc_my_teams"),
    sb.from("organizations").select("id, name, billing_status").eq("owner_id", user.id).order("name"),
    sb.from("exports").select("id").limit(1),
    hasAccepted(sb),
  ]);
  if (error) return <p className="shell-alert" role="alert">Your teams couldn’t be loaded. Try again in a moment.</p>;
  const rows = (teams || []) as TeamRow[];
  return (
    <>
      <p className="shell-note">Signed in as {user.email}</p>
      {agreed ? null : <AgreeForm next="/app" />}
      {rows.length ? (
        <ul className="team-cards" aria-label="Teams">
          {rows.map((t) => (
            <li key={t.team_id} className="team-card glass">
              <h2>{t.role === "player" ? <Link href={`/app/me/${t.team_id}`}>{t.team_name}</Link> : t.role ? <Link href={`/app/t/${t.team_id}`}>{t.team_name}</Link> : t.team_name}</h2>
              <p>{t.org_name}{t.level ? `, ${LEVEL_NAME[t.level] || t.level}` : ""}</p>
              <p className="lbl">{t.role ? ROLE[t.role] || t.role : "Owner, not on the staff"}</p>
              {t.active ? null : <p className="team-off">Not active</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="shell-note">You’re not on a team yet. Open the invite link your coach sent you.</p>
      )}
      {orgs && orgs.length ? (
        <section aria-labelledby="owned" className="pq-panel" style={{ marginTop: 28, maxWidth: 720 }}>
          <h2 id="owned">Organizations you own</h2>
          <ul className="pq-list org-list">
            {orgs.map((o) => <li key={o.id}><span>{o.name}</span><span className="meta">
              <span className={o.billing_status === "active" ? "pill-ok" : "pill-warn"}>{o.billing_status === "active" ? "Paid up" : o.billing_status === "locked" ? "Locked: update the card" : "Not paid yet"}</span>{" "}
              <Link href={`/app/billing?org=${o.id}`} className="shell-btn text">Billing</Link></span></li>)}
          </ul>
        </section>
      ) : null}
      {exps && exps.length ? <p className="shell-note"><Link href="/app/exports">Your data downloads</Link>: what was sent when a team’s subscription lapsed.</p> : null}
      <p className="shell-note"><Link href="/app/new">Start an organization</Link>: name it, add your teams, pay by card.</p>
    </>
  );
}

