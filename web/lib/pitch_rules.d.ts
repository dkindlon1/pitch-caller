// Types for lib/pitch_rules.js, a copy of app/pitch_rules.js (docs.test.ts checks they're the same file).
export type Tier = [number, number];
export type Rule = { id: string; group: string; name: string; source: string | null; checked: string | null; sourceNote?: string; unit: "days" | "nights";
  max: number; tiers: Tier[]; byMonth?: Record<number, { max: number; tiers: Tier[] }>; maxConsecutive: number | null;
  windows?: { days: number; max: number }[]; finishBatter: boolean | null; edited?: boolean };
export type Outing = { date: string; pitches: number };
export type Eligible = { date: string; today: boolean; why: null | { kind: "rest" | "consecutive" | "window"; date?: string; pitches?: number; rest?: number; days?: number; max?: number; run?: number } };
export const PRESETS: Rule[];
export function byId(id: string): Rule | null;
export function resolve(setting: Record<string, unknown> | null | undefined): Rule;
export function limits(rule: Rule, date?: string): { max: number; tiers: Tier[] };
export function restFor(rule: Rule, pitches: number, date?: string): number;
export function eligibleOn(rule: Rule, outings: Outing[], today: string): Eligible;
export function addDays(date: string, n: number): string;
declare const PCRules: { PRESETS: Rule[]; byId: typeof byId; resolve: typeof resolve; limits: typeof limits; restFor: typeof restFor; eligibleOn: typeof eligibleOn; addDays: typeof addDays };
export default PCRules;
