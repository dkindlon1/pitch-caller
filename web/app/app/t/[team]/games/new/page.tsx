import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { teamFor, teamToday } from "@/lib/team";
import { abilities } from "@/lib/nav";
import { GamePlanForm } from "../GamePlanForm";
import { blankPlan, planOptions } from "../opts";
import { SheetSkeleton } from "../../../../_frame/Skeleton";

export const metadata: Metadata = { title: "Set up a game · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

export default function NewGame({ params }: { params: Params }) {
  return <Suspense fallback={<SheetSkeleton label="Loading the setup" />}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t } = await teamFor(team);
  if (!abilities(t).callGames) return <p className="shell-note">Setting up games is for coaches who call them. <Link href={`/app/t/${team}/games`}>Back to Game Day</Link></p>;
  const o = await planOptions(t, null);
  return (
    <>
      <div className="pq-head"><div><h1 className="pq-h1">Set up a game</h1><p>Five quick steps. Nothing is saved until the last one.</p></div>
        <Link href={`/app/t/${team}/games`} className="shell-btn text">Cancel</Link></div>
      <GamePlanForm o={o} initial={blankPlan(t, teamToday(t.timezone))} />
    </>
  );
}
