// Types for lib/pc_import.js, a copy of app/import.js (docs.test.ts checks they're the same file).
export type Field = "type" | "velo" | "ivb" | "hb" | "spin" | "ext" | "relH" | "relS" | "px" | "pz" | "call" | "pitcherId" | "pitcher" | "date"
  | "balls" | "strikes" | "side" | "exit" | "throws";
export type Row = { type: string; kind: "FB" | "SL" | "CB" | "CH"; velo: number | null; ivb: number | null; hb: number | null; spin: number | null;
  ext: number | null; relH: number | null; relS: number | null; px: number | null; pz: number | null; call?: string; balls: number | null;
  strikes: number | null; side?: string; exit: number | null; throws?: string; date?: string; who?: string };
export type Parsed = { source: "TrackMan" | "Rapsodo or other" | "Mapped"; n: number; rows: Row[]; byType: unknown[]; warnings: string[];
  columns: Partial<Record<Field, string>>; unused: string[]; hand: "R" | "L" | null; flipped: boolean; header: string[]; pitchers: number };
export function parse(text: string, opts?: { hand?: "R" | "L"; pitcherName?: string; mapping?: Partial<Record<Field, string>> }): Parsed;
export function headerOf(text: string): { header: string[]; sig: string; sample: string[][] };
export function typeOf(s: string): string | null;
export const KIND: Record<string, "FB" | "SL" | "CB" | "CH">;
export const FIELDS: Record<Field, string[]>;
declare const PCImport: { parse: typeof parse; headerOf: typeof headerOf; typeOf: typeof typeOf; KIND: typeof KIND; FIELDS: typeof FIELDS };
export default PCImport;
