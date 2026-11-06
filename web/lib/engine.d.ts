// Types for lib/engine.js, a copy of app/engine.js (docs.test.ts checks they're the same file): the parts the
// marketing demo uses.
export type EPitch = { name: string; kind: "FB" | "SL" | "CB" | "CH"; grade: number; command: number; conf: number; base_conf: number; shape: string; velo: number; slot: string; height_ft: number };
export type ESituation = Record<string, unknown> & { balls: number; strikes: number };
export type Pick = { prob: number; cost: number; pitch: EPitch; quad: string };
export function init(data: unknown): void;
export function Pitch(o: Partial<EPitch> & { name: string; kind: EPitch["kind"]; conf: number }): EPitch;
export function Situation(o: Record<string, unknown>): ESituation;
export function callMixed(arsenal: EPitch[], s: ESituation, opts?: { rng?: () => number; exclude?: [string, string][] }): { pick: Pick; dist: Pick[] };
export function updateConfidence(p: EPitch, event: "ball" | "cstrike" | "whiff" | "hard" | "shakeoff"): void;
export const VERSION: string;
declare const PitchEngine: { init: typeof init; Pitch: typeof Pitch; Situation: typeof Situation; callMixed: typeof callMixed; updateConfidence: typeof updateConfidence; VERSION: string };
export default PitchEngine;
