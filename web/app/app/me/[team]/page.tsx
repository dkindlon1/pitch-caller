import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { myPitchers, playerTeam } from "@/lib/player";
import { Shell } from "../../../shell";

export const metadata: Metadata = { title: "Me · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

// a player's team opens on his own page (a parent with two children on the team, on the first)
export default function PlayerStart({ params }: { params: Params }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Go params={params} /></Suspense>;
}
async function Go({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t } = await playerTeam(team);
  const ps = await myPitchers(team);
  const first = ps.sort((a, b) => (a.name || "").localeCompare(b.name || ""))[0];
  if (first) redirect(`/app/me/${team}/${first.id}`);
  return (
    <Shell title={t.team_name}>
      <p className="shell-note">{t.active ? "Your coach hasn't finished setting up your spot yet." : "This team is switched off right now (billing). Your data is kept; it comes back when the team is on again."}</p>
    </Shell>
  );
}
