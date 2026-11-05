// The team's records as the iPad keeps them (app/db.js): the portal makes new ones in the same shapes, so either side
// can edit what the other made. docs.test.ts checks these against app/db.js.
export type Kind = "FB" | "SL" | "CB" | "CH";
export const KINDS: Record<Kind, string> = { FB: "Fastball", SL: "Slider", CB: "Curveball", CH: "Changeup" };
export const SIGN: Record<Kind, number> = { FB: 1, CB: 2, SL: 3, CH: 4 };
export const PITCH_TYPES: Record<string, { kind: Kind; shape: string }> = {
  "Four-seam": { kind: "FB", shape: "ride" }, "Two-seam": { kind: "FB", shape: "run" }, Sinker: { kind: "FB", shape: "sink" },
  Cutter: { kind: "FB", shape: "cut" }, Slider: { kind: "SL", shape: "tight" }, Sweeper: { kind: "SL", shape: "sweeper" },
  Slurve: { kind: "SL", shape: "" }, Curveball: { kind: "CB", shape: "loopy" }, "Knuckle curve": { kind: "CB", shape: "sharp" },
  "12-6 curve": { kind: "CB", shape: "sharp" }, Changeup: { kind: "CH", shape: "fade" }, Splitter: { kind: "CH", shape: "drop" },
  Forkball: { kind: "CH", shape: "drop" },
};

export type Pitch = { id: string; type: string; name: string; kind: Kind; shape: string; grade: number | ""; command: number | ""; feel: number;
  velo: number | ""; ivb: number | ""; hb: number | ""; spin: number | ""; active: boolean };
export type Doc = { id: string; createdAt: number; updatedAt: number; deletedAt?: number | null; [k: string]: unknown };
export type Pitcher = Doc & { teamId: string; name: string; number: string; hand: "R" | "L"; role: string; pitches: Pitch[]; notes?: string };
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
