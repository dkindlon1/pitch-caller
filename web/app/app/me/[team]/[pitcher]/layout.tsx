import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { myPitchers, playerTeam } from "@/lib/player";
import { playerNav } from "@/lib/nav";
import { Frame } from "../../../_frame/Frame";
import { Night } from "../../../_frame/Night";
import { portalSans } from "@/app/portal-font";

type Params = Promise<{ team: string; pitcher: string }>;

// The player portal's frame: his team, his name (a parent picks which child), and his own screens. Nothing here is
// about teammates, opponents or the game plan.
export default function PlayerLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <Suspense fallback={<div className={`pq ${portalSans.variable}`}><Night /></div>}>
      <PlayerFrame params={params}>{children}</PlayerFrame>
    </Suspense>
  );
}

async function PlayerFrame({ params, children }: { params: Params; children: ReactNode }) {
  const { team, pitcher } = await params;
  const { team: t, user } = await playerTeam(team);
  const ps = await myPitchers(team);
  const me = ps.find((p) => p.id === pitcher);
  if (!me) notFound();
  const base = `/app/me/${team}/${pitcher}`;
  return (
    <Frame org={t.team_name} current={me.name || "Unnamed"} email={user.email} dock={playerNav(team, pitcher)} home={base}
      switchTo={ps.filter((p) => p.id !== pitcher).map((p) => ({ href: `/app/me/${team}/${p.id}`, label: p.name || "Unnamed" }))}
      off={t.active ? undefined : "Team switched off: changes can't be saved right now"}>
      {children}
    </Frame>
  );
}
