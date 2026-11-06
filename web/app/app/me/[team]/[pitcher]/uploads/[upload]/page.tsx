import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { uploadAccess } from "../../../../../_uploads/access";
import { ReviewPanel } from "../../../../../_uploads/panels";

export const metadata: Metadata = { title: "Review upload · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string; upload: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Review({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}
async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher, upload } = await params;
  if (!/^[0-9a-f-]{36}$/.test(upload)) notFound();
  const a = await uploadAccess(team, pitcher);
  return <><h1 className="shell-h1">Review upload</h1><ReviewPanel a={a} upload={upload} sp={await searchParams} /></>;
}
