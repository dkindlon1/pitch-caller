// The team's records as the iPad keeps them (app/db.js): the portal makes new ones in the same shapes, so either side
// can edit what the other made. docs.test.ts checks these against app/db.js.
// v1.1: six kinds (sinkers and cutters have their own), the same as the app's (app/index.src.html KINDS / SIGN) and the
// engine's one migration table (app/db.js PITCH_TYPES); 5 and 6 are card numbers on the sign card.
export type Kind = "FB" | "SI" | "FC" | "SL" | "CB" | "CH";
export const KINDS: Record<Kind, string> = { FB: "Fastball", SI: "Sinker", FC: "Cutter", SL: "Slider", CB: "Curveball", CH: "Changeup" };
export const SIGN: Record<Kind, number> = { FB: 1, CB: 2, SL: 3, CH: 4, SI: 5, FC: 6 };
export const PITCH_TYPES: Record<string, { kind: Kind; shape: string }> = {
  "Four-seam": { kind: "FB", shape: "rides" }, "Two-seam": { kind: "SI", shape: "two-seam" }, Sinker: { kind: "SI", shape: "run" },
  Cutter: { kind: "FC", shape: "" }, Slider: { kind: "SL", shape: "tight" }, Sweeper: { kind: "SL", shape: "sweeper" },
  Slurve: { kind: "SL", shape: "slurve" }, Curveball: { kind: "CB", shape: "" }, "Knuckle curve": { kind: "CB", shape: "" },
  "12-6 curve": { kind: "CB", shape: "12-6" }, Changeup: { kind: "CH", shape: "fade" }, Splitter: { kind: "CH", shape: "split" },
  Forkball: { kind: "CH", shape: "split" },
};
// v1.1 Step 5: the profile names the coach sees for the engine's tags (the same as app/index.src.html PROFILE_LABEL;
// docs.test.ts checks it). A v1.0 tag (a record or proposal not yet migrated) shows as itself.
export const PROFILE_LABEL: Record<string, Record<string, string>> = {
  FB: { rides: "Rides (high ride)", runs: "Runs (ride + run)", cuts: "Cuts (natural cut)", straight: "Straight (dead zone)", "": "Typical" },
  SI: { run: "Run (heavy run)", drop: "Drop (heavy sink)", "two-seam": "Two-seam (some ride)", "": "Typical" },
  FC: { hard: "Hard / short", big: "Big (slutter)", ride: "Ride", "": "Typical" },
  SL: { gyro: "Gyro (little sweep)", tight: "Tight", sweeper: "Sweeper", slurve: "Slurve", "": "Typical" },
  CB: { "12-6": "12-6", sweeping: "Sweeping", power: "Power / knuckle", slow: "Slow / loopy", "": "Typical" },
  CH: { fade: "Fade", drop: "Drop", split: "Split", firm: "Firm (little speed off)", "": "Typical" } };
export const profileLabel = (kind: string, tag: string | null | undefined) => (PROFILE_LABEL[kind] || {})[tag || ""] || tag || "Typical";
// a pitch's sign: its own (a migrated sinker or cutter keeps its v1.0 sign until the coach changes its type), else its kind's
export const signOf = (d: { kind: string; sign?: number | string }) => +(d.sign || 0) || SIGN[d.kind as Kind] || 0;

export type Pitch = { id: string; type: string; name: string; kind: Kind; shape: string; grade: number | ""; command: number | ""; feel: number;
  velo: number | ""; ivb: number | ""; hb: number | ""; spin: number | ""; active: boolean };
export type Doc = { id: string; createdAt: number; updatedAt: number; deletedAt?: number | null; [k: string]: unknown };
export type Pitcher = Doc & { teamId: string; name: string; number: string; hand: "R" | "L"; role: string; pitches: Pitch[]; notes?: string;
  slot?: string; height_ft?: number; gradYear?: string };
// the game app's arm slots (app/index.src.html, SLOT_OPTS)
export const SLOTS = ["over the top", "high three-quarter", "three-quarter", "low three-quarter", "sidearm", "submarine"];
export type Hitter = Doc & { teamId: string; name: string; number: string; bats: "R" | "L" | "S" };
export type Team = Doc & { name: string; isOurs: boolean; level?: string; pitchRule?: Record<string, unknown> | null };

// the iPad's id format: prefix, the time in base 36, then 20 random base-36 characters
export function uid(prefix: string): string {
  const a = new Uint8Array(10); crypto.getRandomValues(a);
  let s = ""; for (const x of a) s += x.toString(36).padStart(2, "0").slice(-2);
  return (prefix ? prefix + "_" : "") + Date.now().toString(36) + s;
}

// a record going up: an id and createdAt if it's new, and an updatedAt newer than the copy it replaces
export function stamp<T extends Partial<Doc>>(o: T, prefix: string): T & Doc {
  const t = Date.now(), prev = +(o.updatedAt || 0);
  return Object.assign({}, o, { id: o.id || uid(prefix), createdAt: o.createdAt || t, updatedAt: prev >= t ? prev + 1 : t }) as T & Doc;
}

export function newPitch(type: string, extra: Partial<Pitch> = {}): Pitch {
  const t = PITCH_TYPES[type] || PITCH_TYPES["Four-seam"];
  return Object.assign({ id: uid("pt"), type, name: type === "Four-seam" ? "Fastball" : type, kind: t.kind, shape: t.shape,
    grade: 3 as number | "", command: 3 as number | "", feel: 0.7, velo: "" as const, ivb: "" as const, hb: "" as const, spin: "" as const, active: true }, extra);
}
export function newPitcher(teamId: string, extra: Partial<Pitcher> = {}) {
  return Object.assign({ teamId, name: "", number: "", hand: "R" as const, slot: "three-quarter", height_ft: 6.1, role: "SP", gradYear: "",
    pitchLimit: "", useLearned: true, notes: "", pitches: [newPitch("Four-seam", { feel: 0.75 }), newPitch("Changeup", { feel: 0.6 })] }, extra);
}
export function newHitter(teamId: string, extra: Partial<Hitter> = {}) {
  return Object.assign({ teamId, name: "", number: "", bats: "R" as const, pos: "", stats: {}, tags: [], notes: "" }, extra);
}

// a pasted roster: one per line, "12 Smith", "Smith 12", "#12 Smith R" (L or R is how he throws), or just a name
export function parseRoster(text: string): { name: string; number: string; hand: "R" | "L" }[] {
  return String(text || "").split(/\r?\n|,(?=\s*#?\d)/).map((l) => l.trim()).filter(Boolean).slice(0, 80).map((l) => {
    let hand: "R" | "L" = "R"; let number = "";
    let rest = l.replace(/\s+\b([RL])(HP)?\b\.?$/i, (_, x) => { hand = x.toUpperCase() as "R" | "L"; return ""; });
    rest = rest.replace(/^#?(\d{1,3})\b[\s.,-]*/, (_, n) => { number = n; return ""; }).replace(/[\s,-]*#?(\d{1,3})$/, (_, n) => { if (!number) number = n; return ""; });
    return { name: rest.replace(/\s+/g, " ").trim().slice(0, 80), number, hand };
  }).filter((x) => x.name || x.number);
}
// an opponent's hitters typed fast: "12 Smith R", "Jones L", "#3 Diaz S" (R, L or S is how he bats; R if left out)
export function parseHitters(text: string): { name: string; number: string; bats: "R" | "L" | "S" }[] {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40).map((l) => {
    let bats: "R" | "L" | "S" = "R"; let number = "";
    let rest = l.replace(/\s+\b([RLS])\b\.?$/i, (_, x) => { bats = x.toUpperCase() as "R" | "L" | "S"; return ""; });
    rest = rest.replace(/^#?(\d{1,3})\b[\s.,-]*/, (_, n) => { number = n; return ""; });
    return { name: rest.replace(/\s+/g, " ").trim().slice(0, 80), number, bats };
  }).filter((x) => x.name || x.number);
}
