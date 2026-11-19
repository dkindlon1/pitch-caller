// The opponent database's fields (docs/PLAN_opponent_database_2026-11-18.md 3, 4, 7): what a hitter and an opponent
// team carry beyond what the engine reads, the allowed values, and one normaliser so only clean values are ever saved.
// None of this reaches the engine (section 5's mapping waits for the hitter model revamp): the engine reads a hitter's
// `grades` and the approach / path / off-speed `scoutTags` only, and nothing here writes those. Pure: opp_model.test.ts.

export type Rating = 1 | 2 | 3 | "unknown";
export type RatingKey = "power" | "contact" | "speed";
export type Spray = "pull" | "mixed" | "oppo" | "unknown";
export type Heat = "hot" | "cold";
export type FieldKind = "checkbox" | "dropdown" | "grid" | "text";
export type FieldDef = { id: string; scope: "hitter" | "team"; kind: FieldKind; label: string; options: string[]; position: number; archived_at?: string | null };

export const RATING_KEYS: RatingKey[] = ["power", "contact", "speed"];
export const RATING_LABEL: Record<RatingKey, string> = { power: "Power", contact: "Contact", speed: "Speed" };
export const RATING_WORDS: Record<RatingKey, [string, string, string]> = {
  power: ["Little power", "Average power", "Power hitter"], contact: ["Swings and misses", "Average contact", "Puts it in play"], speed: ["Slow", "Average speed", "Fast"] };
export const SPRAY: [Spray, string][] = [["pull", "Pull side"], ["mixed", "Mixed"], ["oppo", "Opposite field"]];
// plan section 3's default list (Drew to edit)
export const PITCH_FLAGS: [string, string][] = [["crushesFB", "Crushes fastballs"], ["chasesSL", "Chases sliders"], ["chasesCB", "Chases curveballs"],
  ["cantHitCH", "Can't hit the changeup"], ["lateOnVelo", "Late on velo"], ["hitsOSHard", "Hits off-speed hard"]];
export const SMALL_BALL: [string, string][] = [["bunt", "Bunt threat"], ["steal", "Steal threat"]];
// plan section 4's default list
export const TENDENCIES: [string, string][] = [["aggressive", "Aggressive early"], ["patient", "Patient"], ["bunts", "Bunts a lot"], ["runs", "Runs a lot"], ["hitAndRun", "Hit-and-run team"]];

// The zone grid: the game screen's 5x5 location grid, catcher's view (row 0 top, column 0 the catcher's left): the
// inner 3x3 is the zone, the ring around it the chase spots. Stored as {"r,c": "hot" | "cold"}; neutral is absent.
export const ZONE_KEYS: string[] = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) ZONE_KEYS.push(`${r},${c}`);
export const inZone = (key: string) => { const [r, c] = key.split(",").map(Number); return r >= 1 && r <= 3 && c >= 1 && c <= 3; };
export const nextHeat = (h: Heat | undefined): Heat | undefined => (h === undefined ? "hot" : h === "hot" ? "cold" : undefined);   // a tap cycles hot / cold / neutral

/** The called spot words for a grid cell, from the hitter's side (inside is his side): for the importer and labels. */
export function cellOfSpot(spot: string, bats: string): string | null {
  const L = bats === "L", inC = L ? 3 : 1, awC = L ? 1 : 3;
  const m: Record<string, [number, number]> = { "up-in": [1, inC], "up-away": [1, awC], "down-in": [3, inC], "down-away": [3, awC], middle: [2, 2], "up-middle": [1, 2], "down-middle": [3, 2],
    in: [2, inC], away: [2, awC], "chase-up": [0, 2], "chase-down": [4, 2], "chase-in": [2, L ? 4 : 0], "chase-away": [2, L ? 0 : 4] };
  const x = m[spot.trim().toLowerCase().replace(/\s+/g, "-")];
  return x ? `${x[0]},${x[1]}` : null;
}

export type Scouting = {
  ratings?: Partial<Record<RatingKey, Rating>>; zone?: Record<string, Heat>; pitchFlags?: Record<string, boolean>; smallBall?: Record<string, boolean>;
  classYear?: string; notes?: string; custom?: Record<string, unknown>; aliases?: string[]; mergedInto?: string;
};
const asRating = (v: unknown): Rating | undefined => (v === 1 || v === 2 || v === 3 ? v : v === "1" || v === "2" || v === "3" ? (+v as 1 | 2 | 3) : v === "unknown" ? "unknown" : undefined);
export const ratingText = (v: Rating | undefined) => (v === undefined || v === "unknown" ? "Unknown" : String(v));

/** Clean a hitter's scouting fields: unknown keys dropped, values checked, neutral zone cells removed. */
export function cleanHitterScouting(x: Record<string, unknown>, defs: FieldDef[] = []): Scouting {
  const out: Scouting = {};
  const r = (x.ratings || {}) as Record<string, unknown>, ratings: Partial<Record<RatingKey, Rating>> = {};
  for (const k of RATING_KEYS) { const v = asRating(r[k]); if (v !== undefined) ratings[k] = v; }
  if (Object.keys(ratings).length) out.ratings = ratings;
  const z = (x.zone || {}) as Record<string, unknown>, zone: Record<string, Heat> = {};
  for (const k of ZONE_KEYS) if (z[k] === "hot" || z[k] === "cold") zone[k] = z[k] as Heat;
  if (Object.keys(zone).length) out.zone = zone;
  const flags = (src: unknown, list: [string, string][]) => { const s = (src || {}) as Record<string, unknown>, o: Record<string, boolean> = {}; for (const [k] of list) if (s[k] === true) o[k] = true; return Object.keys(o).length ? o : undefined; };
  const pf = flags(x.pitchFlags, PITCH_FLAGS); if (pf) out.pitchFlags = pf;
  const sb = flags(x.smallBall, SMALL_BALL); if (sb) out.smallBall = sb;
  if (typeof x.classYear === "string" && x.classYear.trim()) out.classYear = x.classYear.trim().slice(0, 20);
  if (typeof x.notes === "string") out.notes = x.notes.slice(0, 4000);
  const c = cleanCustom(x.custom, defs.filter((d) => d.scope === "hitter")); if (c) out.custom = c;
  return out;
}

/** Custom field values: only defined, unarchived fields, each value checked against its kind. */
export function cleanCustom(src: unknown, defs: FieldDef[]): Record<string, unknown> | undefined {
  const s = (src || {}) as Record<string, unknown>, o: Record<string, unknown> = {};
  for (const d of defs) {
    if (d.archived_at) { if (d.id in s) o[d.id] = s[d.id]; continue; }   // archived: kept as it was, not editable
    const v = s[d.id];
    if (d.kind === "checkbox" && v === true) o[d.id] = true;
    if (d.kind === "dropdown" && typeof v === "string" && d.options.includes(v)) o[d.id] = v;
    if (d.kind === "text" && typeof v === "string" && v.trim()) o[d.id] = v.slice(0, 1000);
    if (d.kind === "grid" && v && typeof v === "object") { const g: Record<string, Heat> = {}; for (const k of ZONE_KEYS) { const h = (v as Record<string, unknown>)[k]; if (h === "hot" || h === "cold") g[k] = h; } if (Object.keys(g).length) o[d.id] = g; }
  }
  return Object.keys(o).length ? o : undefined;
}

/** Clean an opponent team's fields: tendencies and custom values. */
export function cleanTeamScouting(x: Record<string, unknown>, defs: FieldDef[] = []): { tendencies?: Record<string, boolean>; custom?: Record<string, unknown> } {
  const out: { tendencies?: Record<string, boolean>; custom?: Record<string, unknown> } = {};
  const t = (x.tendencies || {}) as Record<string, unknown>, o: Record<string, boolean> = {};
  for (const [k] of TENDENCIES) if (t[k] === true) o[k] = true;
  if (Object.keys(o).length) out.tendencies = o;
  const c = cleanCustom(x.custom, defs.filter((d) => d.scope === "team")); if (c) out.custom = c;
  return out;
}

/**
 * Apply a hitter's cleaned scouting to his doc. Only the scouting keys change; `grades`, the engine's scoutTags and
 * everything else stay as they were. Spray lives in scoutTags.spray (plan 3: the existing spray tag, one field); the
 * engine reads only approach / path / off-speed from scoutTags, so spray doesn't move a call.
 */
export function applyHitterScouting<T extends Record<string, unknown>>(doc: T, s: Scouting, spray?: Spray | null): T {
  const out: Record<string, unknown> = { ...doc };
  for (const k of ["ratings", "zone", "pitchFlags", "smallBall", "classYear", "custom"] as const) { if (s[k] !== undefined) out[k] = s[k]; else delete out[k]; }
  if (s.notes !== undefined) out.notes = s.notes;
  if (spray !== undefined) {
    const tags = { ...((doc.scoutTags as Record<string, unknown>) || {}) };
    if (spray) tags.spray = spray; else delete tags.spray;
    if (Object.keys(tags).length) out.scoutTags = tags; else delete out.scoutTags;
  }
  return out as T;
}
