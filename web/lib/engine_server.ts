import "server-only";
import E from "./engine.js";
import type { ProposeOpts } from "./uploads";

// v1.1 Step 5: the engine's one migration table and its profile-tag thresholds for the portal's server code (the shape
// proposer, record reads). Server-only, so the game engine stays out of the upload form's browser bundle.
export const migratePitch = E.migratePitch;
export const proposeOpts = (level?: string | null): ProposeOpts => ({ tagFor: E.tagFor, migrate: E.migratePitch, level: level || "college_d3" });

// a stored pitch in v1.1 terms, exactly as the app migrates a stored pitcher (app/db.js migratePitcherV11): kind and tag
// through the table; a pitch whose kind moves (a sinker or cutter stored as FB) keeps its v1.0 sign until its type changes
const V10_SIGN: Record<string, number> = { FB: 1, CB: 2, SL: 3, CH: 4 };
export function v11Pitch<T extends { kind: string; shape?: string; type?: string; sign?: number | string }>(d: T): T {
  const [k, s] = E.migratePitch(d.kind, d.shape || "", d.type || null);
  if (k === d.kind && s === (d.shape || "")) return d;
  const sign = k !== d.kind && d.sign == null && V10_SIGN[d.kind] ? V10_SIGN[d.kind] : d.sign;
  return { ...d, kind: k, shape: s, ...(sign == null ? {} : { sign }) };
}
