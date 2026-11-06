import "server-only";
import { buildZip, type ExportData } from "./export_files";
import { lapseMail, sendMail } from "./email";
import { serviceRpc } from "./supabase/admin";

// A lapse's exports (Plan 2b, D7; spec: "Billing and lockout"). When an organization locks, every coach gets the team's
// data and every player his own: built here with the server key, kept in the private "exports" bucket, and emailed as a
// 30-day signed link. Safe to run again for the same lapse: it only fills in who hasn't had theirs (pc_export_sent).
type Person = { user_id: string; email: string };
type Plan = { org: string; name: string; lapse_at: string; teams: { id: string; name: string; coaches: Person[]; players: (Person & { pitcher_id: string; name: string })[] }[] } | null;
type SentRow = { id: string; program_id: string; kind: "player" | "coach"; pitcher_id: string | null; user_id: string; path: string; email_status: string };
export type LapseResult = { org: string | null; files: number; recorded: number; emails: Record<string, number> };

export const LINK_DAYS = 30;
const BUCKET = "exports";

function storage() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("not_configured");
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, headers: { apikey: key, authorization: `Bearer ${key}` } };
}

async function upload(path: string, body: Uint8Array) {
  const s = storage();
  const res = await fetch(`${s.base}/object/${BUCKET}/${path}`, {
    method: "POST", headers: { ...s.headers, "content-type": "application/zip", "x-upsert": "true" }, body: body as unknown as BodyInit, cache: "no-store",
  });
  if (!res.ok) throw new Error(`export upload failed (${res.status}) ${await res.text().catch(() => "")}`.trim());
}

// a time-limited link to one export file
export async function signedUrl(path: string, seconds: number): Promise<string> {
  const s = storage();
  const res = await fetch(`${s.base}/object/sign/${BUCKET}/${path}`, {
    method: "POST", headers: { ...s.headers, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: seconds }), cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { signedURL?: string } | null;
  if (!res.ok || !json?.signedURL) throw new Error(`signing failed (${res.status})`);
  return `${s.base}${json.signedURL.startsWith("/") ? "" : "/"}${json.signedURL}`;
}

// remove export files (the 12-month retention sweep); a file that's already gone isn't an error
export async function removeExports(paths: string[]): Promise<void> {
  const s = storage();
  for (let i = 0; i < paths.length; i += 100) {
    const res = await fetch(`${s.base}/object/${BUCKET}`, {
      method: "DELETE", headers: { ...s.headers, "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }), cache: "no-store",
    });
    if (!res.ok) throw new Error(`export removal failed (${res.status}) ${await res.text().catch(() => "")}`.trim());
  }
}

const stampOf = (iso: string) => new Date(iso).toISOString().replace(/[-:T]/g, "").slice(0, 14);
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "x";
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function runLapse(a: Record<string, unknown>, site: string): Promise<LapseResult> {
  const plan = await serviceRpc<Plan>("pc_lapse_plan", { a });
  const out: LapseResult = { org: plan?.org || null, files: 0, recorded: 0, emails: {} };
  if (!plan) return out;
  const sent = await serviceRpc<SentRow[]>("pc_export_sent", { org: plan.org, lapse: plan.lapse_at });
  const doneRow = (team: string, kind: string, pitcher: string | null, user: string) =>
    sent.find((x) => x.program_id === team && x.kind === kind && (x.pitcher_id || null) === pitcher && x.user_id === user);
  const done = (team: string, kind: string, pitcher: string | null, user: string) => !!doneRow(team, kind, pitcher, user);
  const now = new Date(), expires = new Date(now.getTime() + LINK_DAYS * 86400000), stamp = stampOf(plan.lapse_at);
  const generated = now.toISOString().slice(0, 10);

  const mail = async (id: string, p: Person, kind: "player" | "coach", team: { name: string }, pitcher: { name: string } | null, link: string) => {
    const r = await sendMail(lapseMail({ to: p.email, kind, team: team.name, org: plan.name, pitcher: pitcher?.name, link, expires: day(expires), site }));
    out.emails[r.status] = (out.emails[r.status] || 0) + 1;
    await serviceRpc("pc_export_emailed", { export_id: id, st: r.status });
    if (r.status === "failed") console.error("lapse email failed", plan.org, kind, r.error);
  };

  // build one file, then record and email it to each person who hasn't had it; an email that failed earlier (or went
  // nowhere because no email service was set up) is tried again with a fresh link
  const deliver = async (team: { id: string; name: string }, kind: "player" | "coach", to: Person[], pitcher: { id: string; name: string } | null) => {
    if (process.env.RESEND_API_KEY) {
      for (const p of to) {
        const x = doneRow(team.id, kind, pitcher?.id || null, p.user_id);
        if (x && (x.email_status === "failed" || x.email_status === "no_provider")) await mail(x.id, p, kind, team, pitcher, await signedUrl(x.path, LINK_DAYS * 86400));
      }
    }
    const waiting = to.filter((p) => !done(team.id, kind, pitcher?.id || null, p.user_id));
    if (!waiting.length) return;
    const data = await serviceRpc<ExportData>("pc_export_rows", { p: team.id, pitcher: pitcher?.id ?? null });
    const { zip, rows } = await buildZip(data, { kind, org: plan.name, team: team.name, pitcher: pitcher?.name, generated });
    const path = `${plan.org}/${stamp}/${team.id}/${kind === "player" ? `player-${safe(pitcher!.id)}` : "team"}.zip`;
    await upload(path, zip);
    out.files++;
    const link = await signedUrl(path, LINK_DAYS * 86400);
    for (const p of waiting) {
      const id = await serviceRpc<string | null>("pc_export_save", { e: {
        org_id: plan.org, program_id: team.id, lapse_at: plan.lapse_at, kind, pitcher_id: pitcher?.id ?? null, user_id: p.user_id,
        team_name: team.name, pitcher_name: pitcher?.name ?? null, path, rows, bytes: zip.byteLength, link_expires_at: expires.toISOString() } });
      if (!id) continue;   // another run got there first
      out.recorded++;
      await mail(id, p, kind, team, pitcher, link);
    }
  };

  for (const team of plan.teams) {
    await deliver(team, "coach", team.coaches, null);
    for (const pl of team.players) await deliver(team, "player", [pl], { id: pl.pitcher_id, name: pl.name });
  }
  return out;
}
