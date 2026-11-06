import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { Mark } from "../../../../components/Mark";
import { signOut } from "../../../../login/actions";
import { myPitchers, playerTeam } from "@/lib/player";

type Params = Promise<{ team: string; pitcher: string }>;

// The player portal's frame: his team, his name (a parent picks which child), and his sections. Nothing here is
// about teammates, opponents or the game plan.
export default function PlayerLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <div className="shell field-grid">
      <header className="shell-top wrap">
        <Link href="/app" className="shell-brand" aria-label="PitchIQ, your teams"><Mark /> <span>PitchIQ</span></Link>
        <Suspense fallback={null}><Who params={params} /></Suspense>
        <form action={signOut}><button type="submit" className="shell-btn text">Sign out</button></form>
      </header>
      <Suspense fallback={null}><Nav params={params} /></Suspense>
      <main className="shell-main portal wrap">{children}</main>
    </div>
  );
}

async function Who({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  const { team: t } = await playerTeam(team);
  const ps = await myPitchers(team);
  const me = ps.find((p) => p.id === pitcher);
  if (!me) notFound();
  const others = ps.filter((p) => p.id !== pitcher);
  return (
    <div className="team-switch">
      <span className="lbl">{t.team_name}</span>
      {others.length ? (
        <details className="switch">
          <summary>{me.name || "Unnamed"}</summary>
          <ul>{others.map((p) => <li key={p.id}><Link href={`/app/me/${team}/${p.id}`}>{p.name || "Unnamed"}</Link></li>)}</ul>
        </details>
      ) : <b>{me.name || "Unnamed"}</b>}
    </div>
  );
}

async function Nav({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  const { team: t } = await playerTeam(team);
  const base = `/app/me/${team}/${pitcher}`;
  return (
    <nav className="portal-nav wrap" aria-label="Me">
      {[["", "Home"], ["/arsenal", "Arsenal"], ["/profile", "Profile"], ["/learned", "What the engine learned"]].map(([h, l]) => <Link key={l} href={base + h}>{l}</Link>)}
      {t.active ? null : <span className="team-off">Team switched off: changes can&apos;t be saved right now</span>}
    </nav>
  );
}
