import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Mark } from "../../../components/Mark";
import { signOut } from "../../../login/actions";
import { teamFor } from "@/lib/team";

type Params = Promise<{ team: string }>;

// The coach portal's frame: the team, a switcher for coaches on several teams, and the sections they may use.
export default function TeamLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <div className="shell field-grid">
      <header className="shell-top wrap">
        <Link href="/app" className="shell-brand" aria-label="PitchIQ, your teams"><Mark /> <span>PitchIQ</span></Link>
        <Suspense fallback={null}><Switcher params={params} /></Suspense>
        <form action={signOut}><button type="submit" className="shell-btn text">Sign out</button></form>
      </header>
      <Suspense fallback={null}><Nav params={params} /></Suspense>
      <main className="shell-main portal wrap">{children}</main>
    </div>
  );
}

async function Switcher({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t, teams } = await teamFor(team);
  const others = teams.filter((x) => x.team_id !== t.team_id && x.role && x.role !== "player");
  return (
    <div className="team-switch">
      <span className="lbl">{t.org_name}</span>
      {others.length ? (
        <details className="switch">
          <summary>{t.team_name}</summary>
          <ul>{others.map((x) => <li key={x.team_id}><Link href={`/app/t/${x.team_id}`}>{x.team_name}</Link></li>)}</ul>
        </details>
      ) : <b>{t.team_name}</b>}
    </div>
  );
}

async function Nav({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t, manage } = await teamFor(team);
  const base = `/app/t/${t.team_id}`;
  const items: [string, string, boolean][] = [["", "Home", true], ["/roster", "Roster", true], ["/opponents", "Opponents", true],
    ["/staff", "Staff", manage("manage_staff") || manage("manage_roster")], ["/settings", "Settings", manage("manage_roster")]];
  return (
    <nav className="portal-nav wrap" aria-label="Team">
      {items.filter((x) => x[2]).map(([href, label]) => <Link key={label} href={base + href}>{label}</Link>)}
      <a href="/app/game/" className="shell-btn primary">Open the game app</a>
      {t.active ? null : <span className="team-off">Not active: nothing syncs until billing is done</span>}
    </nav>
  );
}
