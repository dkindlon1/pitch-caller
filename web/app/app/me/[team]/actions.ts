"use server";
import { redirect } from "next/navigation";
import { v11Pitch } from "@/lib/engine_server";
import { push } from "@/lib/team";
import { myPitchers, playerTeam } from "@/lib/player";
import { PITCH_TYPES, SLOTS, newPitch, type Pitch } from "@/lib/docs";

// A player's own changes: his profile and his arsenal. They go through pc_push like the iPad's, which keeps only the
// fields that are his (name, number, hand, slot, height, grad year, pitches) and logs every grade change.
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (team: string, pitcher: string, path: string, q: string): never => redirect(`/app/me/${team}/${pitcher}${path}?${q}`);

async function mine(f: FormData) {
  const team = str(f, "team"), pitcher = str(f, "pitcher");
  await playerTeam(team);
  const p = (await myPitchers(team)).find((x) => x.id === pitcher);
  if (!p) redirect(`/app/me/${team}`);
  return { team, pitcher, p };
}
const ok = (r: { applied: number; rejected: { reason: string }[]; error?: string }) => !r.error && !r.rejected.length;

export async function saveProfile(f: FormData) {
  const { team, pitcher, p } = await mine(f);
  const h = Number(str(f, "height_ft")), gy = str(f, "gradYear");
  const next = { ...p, name: str(f, "name").slice(0, 80) || p.name, number: str(f, "number").replace(/[^0-9]/g, "").slice(0, 3),
    hand: str(f, "hand") === "L" ? "L" as const : "R" as const,
    slot: SLOTS.includes(str(f, "slot")) ? str(f, "slot") : p.slot,
    height_ft: Number.isFinite(h) && h >= 4 && h <= 7.5 ? Math.round(h * 100) / 100 : p.height_ft,
    gradYear: /^(19|20)\d\d$/.test(gy) ? gy : gy === "" ? "" : p.gradYear };
  const r = await push(team, "pitchers", [next], "pit");
  back(team, pitcher, "/profile", ok(r) ? "ok=saved" : r.rejected.some((x) => x.reason === "team_locked") ? "error=locked" : "error=push");
}

export async function saveArsenal(f: FormData) {
  const { team, pitcher, p } = await mine(f);
  const grade = (v: string): number | "" => (v === "" ? "" : Math.max(1, Math.min(5, Math.round(+v) || 3)));
  let pitches: Pitch[] = (p.pitches || []).map((d0, i) => {
    // v1.1: the type sets kind and shape only when it changes (a shape accepted from his uploads stays); otherwise the
    // pitch is read in v1.1 terms, as the app does (lib/engine_server.ts v11Pitch)
    const d = v11Pitch(d0), type = str(f, `type_${i}`) in PITCH_TYPES ? str(f, `type_${i}`) : d.type;
    const ch = type !== d.type && type in PITCH_TYPES, t = ch ? PITCH_TYPES[type] : { kind: d.kind, shape: d.shape };
    const { sign, main, ...rest } = d as Pitch & { sign?: number; main?: boolean };
    const kept = { ...(ch || sign == null ? {} : { sign }), ...(main && ["FB", "SI", "FC"].includes(t.kind) ? { main } : {}) };
    return { ...rest, ...kept, type, kind: t.kind, shape: t.shape, name: str(f, `name_${i}`).slice(0, 40) || d.name,
      grade: grade(str(f, `grade_${i}`)), command: grade(str(f, `command_${i}`)), active: f.get(`active_${i}`) === "on" };
  });
  const add = str(f, "add_type");
  if (add && add in PITCH_TYPES && pitches.length < 8) pitches = pitches.concat(newPitch(add));
  const r = await push(team, "pitchers", [{ ...p, pitches }], "pit");
  back(team, pitcher, "/arsenal", ok(r) ? "ok=saved" : r.rejected.some((x) => x.reason === "team_locked") ? "error=locked" : "error=push");
}
