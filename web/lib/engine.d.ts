// Types for lib/engine.js, a copy of app/engine.js (docs.test.ts checks they're the same file): the parts the
// marketing demo uses.
export type EPitch = { name: string; kind: "FB" | "SI" | "FC" | "SL" | "CB" | "CH"; grade: number; command: number; conf: number; base_conf: number; shape: string; velo: number; slot: string; height_ft: number };
export type ESituation = Record<string, unknown> & { balls: number; strikes: number };
export type Pick = { prob: number; cost: number; pitch: EPitch; quad: string };
export function init(data: unknown): void;
export function Pitch(o: Partial<EPitch> & { name: string; kind: EPitch["kind"]; conf: number }): EPitch;
export function Situation(o: Record<string, unknown>): ESituation;
export type CallInfo = { s: ESituation; [k: string]: unknown };
export function callV08(arsenal: EPitch[], s: ESituation, opts?: { rng?: () => number; exclude?: [string, string][]; tab?: unknown }): { pick: Pick; dist: Pick[]; tab: unknown; info: CallInfo };
export function whyLine(arsenal: EPitch[], s: ESituation, tab: unknown, pick: Pick, info: CallInfo): [string, Record<string, number>, string | null];
export function updateConfidence(p: EPitch, event: "ball" | "cstrike" | "whiff" | "hard" | "shakeoff"): void;
export const VERSION: string;
// v1.1: the one migration table and the profile tags (Step 5: the portal's shape proposer and record reads)
export function migratePitch(kind: string, shape: string, type?: string | null): [string, string];
export function tagFor(kind: string, ivb: number, hb: number, velo: number, fbMph: number, fbIvb: number, fbHb: number, level?: string, type?: string): string;
export const SHAPE_TAGS: Record<string, string[]>;
declare const PitchEngine: { init: typeof init; Pitch: typeof Pitch; Situation: typeof Situation; callV08: typeof callV08; whyLine: typeof whyLine; updateConfidence: typeof updateConfidence; VERSION: string; migratePitch: typeof migratePitch; tagFor: typeof tagFor; SHAPE_TAGS: typeof SHAPE_TAGS };
export default PitchEngine;
