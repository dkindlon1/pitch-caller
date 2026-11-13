import type { Metadata } from "next";
import { Suspense } from "react";
import { uploadAccess } from "../../../../_uploads/access";
import { StatsPanel } from "../../../../_uploads/stats-panel";

export const metadata: Metadata = { title: "Stats · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Stats({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params;
  const a = await uploadAccess(team, pitcher);
  return <><h1 className="shell-h1">Stats</h1><div className="pq-flow"><StatsPanel a={a} sp={await searchParams} /></div></>;
}
