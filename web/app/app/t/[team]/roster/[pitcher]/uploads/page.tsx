import type { Metadata } from "next";
import { Suspense } from "react";
import { uploadAccess } from "../../../../../_uploads/access";
import Link from "next/link";
import { Tabs, UploadsPanel } from "../../../../../_uploads/panels";

export const metadata: Metadata = { title: "Uploads · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Uploads({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params;
  const a = await uploadAccess(team, pitcher);
  return (<><p><Link href={`/app/t/${team}/roster`}>Roster</Link></p>
    <h1 className="shell-h1">{a.pitcher.number ? `#${a.pitcher.number} ` : ""}{a.pitcher.name || "Unnamed"}</h1>
    <Tabs base={a.base} at="uploads" label="Profile and arsenal" />
    {a.edit ? null : <p className="shell-note">Your role on this team can see his uploads but not review them (that's the Review uploads toggle).</p>}
    <UploadsPanel a={a} sp={await searchParams} /></>);
}
