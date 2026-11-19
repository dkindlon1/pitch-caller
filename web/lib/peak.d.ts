// Types for web/lib/peak.js (an identical copy of app/peak.js; scripts/test-app.sh checks they match).
export type PeakEv = Record<string, unknown>;
export type Rate = { p: number; n: number; raw: number; se: number; prior: number };
export type PitchBase = { key: string; name: string; kind: string; pitches: number; metrics: Record<"whiff" | "strike" | "hard", Rate>; velo: { mean: number; sd: number; n: number } | null };
export type Baseline = { version: string; pitches: Record<string, PitchBase>; outings: number };
export type Cell = { pitch: string; name: string; kind: string; variable: string; bucket: string; metric: "whiff" | "strike" | "hard"; k: number; n: number; raw: number; shrunk: number;
  base: number; z: number; p: number; q: number; worse: boolean; level: "clear" | "early" | "noise"; chart: { bucket: string; k: number; n: number }[]; unit: string; sentence?: string; alsoIn?: number };
export type Findings = { tested: number; shown: Cell[]; all: Cell[] };
export type DriftNote = { pitch: string; name: string; metric: string; k: number; n: number; base: number; line: number; prob: number; text: string; at?: number; atN?: number };
declare const PCPeak: {
  VERSION: string; METRICS: Record<string, { num: string; den: string; bad: string; label: string }>; VARS: Record<string, { label: string; order: string[] }>;
  MIN_CELL: number; CLEAR_Q: number; EARLY_P: number; MAX_SHOWN: number; DRIFT_MIN: number; DRIFT_P: number;
  baseline(outings: { date: string; season?: string; pitches: PeakEv[] }[], opts?: { season?: string; kinds?: Record<string, string>; flat?: boolean }): Baseline;
  findings(evs: PeakEv[], base: Baseline | null, opts?: { kinds?: Record<string, string> }): Findings;
  drift(tonight: PeakEv[], base: Baseline | null, opts?: { kinds?: Record<string, string> }): DriftNote[];
  driftLog(game: PeakEv[], base: Baseline | null, opts?: { kinds?: Record<string, string> }): DriftNote[];
  archetype(base: Baseline | null): string | null;
};
export default PCPeak;
