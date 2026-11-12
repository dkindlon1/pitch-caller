import { Suspense, type ReactNode } from "react";
import { teamFor } from "@/lib/team";
import { coachNav, abilities } from "@/lib/nav";
import { waitingOn } from "@/lib/upload_data";
import { Frame } from "../../_frame/Frame";
import { Night } from "../../_frame/Night";
import { portalSans } from "@/app/portal-font";

type Params = Promise<{ team: string }>;

// The coach portal's frame: the team in the bar (with a switcher for a coach on several teams) and the dock built
// from what this account may open on this team.
export default function TeamLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <Suspense fallback={<div className={`pq ${portalSans.variable}`}><Night /></div>}>
      <TeamFrame params={params}>{children}</TeamFrame>
    </Suspense>
  );
}

async function TeamFrame({ params, children }: { params: Params; children: ReactNode }) {
  const { team } = await params;
  const { team: t, teams, user } = await teamFor(team);
  const reviews = abilities(t).can("review_uploads") ? [...(await waitingOn(team)).values()].reduce((n, w) => n + w.proposals, 0) : 0;
  const home = `/app/t/${t.team_id}`;
  const dock = [{ key: "home", href: home, icon: "home" as const, label: "Home", short: "Home", sub: "" }, ...coachNav(t, { reviews })];
  const others = teams.filter((x) => x.team_id !== t.team_id && x.role);
  return (
    <Frame org={t.org_name} current={t.team_name} email={user.email} dock={dock} home={home}
      switchTo={others.map((x) => ({ href: x.role === "player" ? `/app/me/${x.team_id}` : `/app/t/${x.team_id}`, label: x.team_name, sub: x.org_name }))}
      off={t.active ? undefined : "Not switched on: nothing syncs until billing is done"}>
      {children}
    </Frame>
  );
}
