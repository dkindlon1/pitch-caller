import type { Metadata } from "next";
import { Suspense } from "react";
import { uploadAccess } from "../../../../../_uploads/access";
import { UploadsPanel } from "../../../../../_uploads/panels";
import { PitcherHead } from "../../../../../_uploads/pitcher-head";

export const metadata: Metadata = { title: "Uploads · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Uploads({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params;
  const a = await uploadAccess(team, pitcher);
  return (<><PitcherHead team={team} p={a.pitcher} at="uploads" />
    {a.edit ? null : <p className="shell-note">Your role on this team can see his uploads but not review them (that's the Review uploads toggle).</p>}
    <UploadsPanel a={a} sp={await searchParams} /></>);
}
