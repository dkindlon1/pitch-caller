import type { Metadata } from "next";
import { Suspense } from "react";
import { uploadAccess } from "../../../../_uploads/access";
import { UploadsPanel } from "../../../../_uploads/panels";

export const metadata: Metadata = { title: "Uploads · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Uploads({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params;
  const a = await uploadAccess(team, pitcher);
  return (<><h1 className="shell-h1">Uploads</h1>
    <p className="shell-note">TrackMan and Rapsodo sessions: your velocity, pitch shape and arm slot. What they show is proposed below; nothing in your arsenal changes until you accept it.</p>
    <UploadsPanel a={a} sp={await searchParams} /></>);
}
