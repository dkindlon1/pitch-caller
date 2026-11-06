import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { Shell } from "../../shell";
import { downloadExport } from "./actions";

export const metadata: Metadata = { title: "Your data · PitchIQ", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Row = { id: string; kind: "player" | "coach"; team_name: string; pitcher_name: string | null; rows: number; bytes: number; created_at: string };
const ERRORS: Record<string, string> = { missing: "That download isn't yours, or it's gone.", failed: "The download couldn't be made just now. Try again in a minute." };
const when = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// The data a lapse sent him (spec: "Billing and lockout"). It works while his team is locked: these rows are his own.
export default function ExportsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Your data">
      <Suspense fallback={<p className="shell-note">Loading…</p>}>
        <Exports searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Exports({ searchParams }: { searchParams: Search }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/app/exports");
  const sp = await searchParams;
  const err = ERRORS[String(sp.error || "")];
  const sb = await getServerSupabase();
  const { data } = await sb.from("exports").select("id, kind, team_name, pitcher_name, rows, bytes, created_at").order("created_at", { ascending: false }).limit(100);
  const rows = (data || []) as Row[];
  return (
    <>
      {err ? <p className="shell-alert" role="alert">{err}</p> : null}
      <p className="shell-note">
        When a team&apos;s subscription lapses, each coach gets the team&apos;s data and each player his own, as CSV files in a zip. The team&apos;s data is
        kept for 12 months, and paying again brings it all back.
      </p>
      {rows.length ? (
        <ul className="org-list" aria-label="Downloads">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.kind === "player" ? `${r.pitcher_name || "Your data"}, ${r.team_name}` : `${r.team_name} (team)`}</strong>{" "}
              <span className="lbl">{when(r.created_at)} · {r.rows} rows · {size(r.bytes)}</span>
              <form action={downloadExport} aria-label={`Download ${r.kind === "player" ? r.pitcher_name || "your data" : r.team_name}`} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="shell-btn text">Download</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="shell-note">Nothing here: none of your teams has lapsed.</p>
      )}
      <p className="shell-note"><Link href="/app">Your teams</Link></p>
    </>
  );
}
