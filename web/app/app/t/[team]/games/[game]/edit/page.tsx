import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { gamesOf, teamFor } from "@/lib/team";
import { abilities } from "@/lib/nav";
import type { GameDoc } from "@/lib/gameplan";
import { GamePlanForm } from "../../GamePlanForm";
import { planOf, planOptions } from "../../opts";
import { SheetSkeleton } from "../../../../../_frame/Skeleton";

export const metadata: Metadata = { title: "Change the game plan · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string }>;

export default function EditGame({ params }: { params: Params }) {
  return <Suspense fallback={<SheetSkeleton label="Loading the plan" />}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Params }) {
  const { team, game } = await params;
  const { team: t } = await teamFor(team);
  const back = <Link href={`/app/t/${team}/games`}>Back to Game Day</Link>;
  if (!abilities(t).callGames) return <p className="shell-note">Changing a game plan is for coaches who call games. {back}</p>;
  const g = (await gamesOf(team)).find((x) => x.id === game) as GameDoc | undefined;
  if (!g) return <p className="shell-note">That game isn&apos;t on this team&apos;s schedule. {back}</p>;
  if (g.status !== "planned") return <p className="shell-note">This game has started, so its plan changes on the device calling it. {back}</p>;
  return (
    <>
      <div className="pq-head"><div><h1 className="pq-h1">Change the game plan</h1></div><Link href={`/app/t/${team}/games/${game}`} className="shell-btn text">Cancel</Link></div>
      <GamePlanForm o={await planOptions(t, game)} initial={planOf(g)} />
    </>
  );
}
