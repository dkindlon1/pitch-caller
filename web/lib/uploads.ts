// TrackMan, Rapsodo and mapped pitch files, from parsed rows (lib/pc_import.js, the game app's own parser) to what's
// stored, summarized and proposed (spec: "Upload pipeline"). Pure functions: uploads.test.ts checks them by hand.
//
//   normalize  -> one row per pitch in the shape pc_upload_add stores (arm side positive, feet and inches)
//   summarize  -> per pitch type: weighted by session type and age; excluded and developing pitches left out
//   propose    -> velo, shape and slot for his arsenal, only where there's enough and it differs from what he has
import type { Parsed, Row } from "./pc_import";
import type { Pitcher } from "./docs";

export type SessionType = "game" | "live_bp" | "bullpen";
export type Source = "trackman" | "rapsodo" | "mapped";
export type Res = "ball" | "cstrike" | "whiff" | "foul" | "play" | "hbp";
export type UploadPitch = {
  pitch_type: string; kind: "FB" | "SI" | "FC" | "SL" | "CB" | "CH";   // v1.1: six kinds
  velo_mph: number | null; ivb_in: number | null; hb_in: number | null; spin_rpm: number | null;
  rel_height_ft: number | null; rel_side_ft: number | null; extension_ft: number | null; plate_x_ft: number | null; plate_z_ft: number | null;
  balls: number | null; strikes: number | null; res: Res | null; contact: "weak" | "solid" | "hard" | null; batter_side: "R" | "L" | null;
  excluded: boolean; reason: "warmup" | "grip" | "mistag" | "other" | null; developing: boolean;
};
// a stored pitch with its upload's session, as summarize reads it
export type SessionPitch = UploadPitch & { session_type: SessionType; session_date: string; upload_id?: string };

// Config constants (spec: starting values)
export const SESSION_WEIGHT: Record<SessionType, number> = { game: 1.0, live_bp: 0.7, bullpen: 0.4 };
export const HALF_LIFE_DAYS = 60;
export const MIN_PITCHES = 10;               // the minimum sample rule: fewer and nothing is proposed
export const VELO_STEP = 0.5;                // mph: a smaller change isn't proposed
export const BREAK_STEP = 1.0;               // inches
export const SHOULDER = 0.70;                // shoulder height as a share of standing height, for the arm angle
export const REASONS = { warmup: "Warmup", grip: "Testing a grip", mistag: "Mis-tagged", other: "Other" } as const;
export const SESSION_LABEL: Record<SessionType, string> = { game: "Game", live_bp: "Live BP", bullpen: "Bullpen" };

// ---------------------------------------------------------------- normalize
// TrackMan's PitchCall (V3 glossary) to the app's results; other files usually have none
export function resOf(call: string | undefined | null): Res | null {
  const c = String(call || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!c) return null;
  if (c.startsWith("ball") || c === "intentionalball") return "ball";        // BallCalled, BallinDirt, BallIntentional
  if (c === "strikecalled") return "cstrike";
  if (c === "strikeswinging" || c === "swingingstrike") return "whiff";
  if (c.startsWith("foul")) return "foul";                                    // FoulBall, FoulBallNotFieldable, FoulBallFieldable, FoulTip
  if (c === "inplay") return "play";
  if (c === "hitbypitch") return "hbp";
  return null;
}
// exit velocity to the app's contact grades: 95+ is hard-hit, under 80 weak
export function contactOf(exitMph: number | null, res: Res | null): UploadPitch["contact"] {
  if (res !== "play" || exitMph === null) return null;
  return exitMph >= 95 ? "hard" : exitMph >= 80 ? "solid" : "weak";
}
const sideOf = (s: string | undefined) => { const c = String(s || "").trim().toUpperCase()[0]; return c === "R" || c === "L" ? c : null; };
const r2 = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const int = (x: number | null, lo: number, hi: number) => (x === null || !Number.isInteger(x) || x < lo || x > hi ? null : x);

export function normalize(parsed: Parsed): UploadPitch[] {
  return parsed.rows.map((r: Row) => {
    const res = resOf(r.call);
    return {
      pitch_type: r.type, kind: r.kind, velo_mph: r2(r.velo), ivb_in: r2(r.ivb), hb_in: r2(r.hb), spin_rpm: r.spin === null ? null : Math.round(r.spin),
      rel_height_ft: r2(r.relH), rel_side_ft: r2(r.relS), extension_ft: r2(r.ext), plate_x_ft: r2(r.px), plate_z_ft: r2(r.pz),
      balls: int(r.balls, 0, 3), strikes: int(r.strikes, 0, 2), res, contact: contactOf(r.exit, res), batter_side: sideOf(r.side),
      excluded: false, reason: null, developing: false,
    };
  });
}

export function sourceOf(parsed: Parsed): Source {
  return parsed.source === "TrackMan" ? "trackman" : parsed.source === "Mapped" ? "mapped" : "rapsodo";
}

// "2026-11-01", "11/1/2026" or "2026-11-01T18:03:00": the session's date, or null
export function dateOf(s: string | undefined | null): string | null {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
export function fileDate(parsed: Parsed): string | null {
  for (const r of parsed.rows) { const d = dateOf(r.date); if (d) return d; }
  return null;
}
// a game file says so: it has counts and results
export const looksLikeGame = (rows: UploadPitch[]) => rows.filter((r) => r.res !== null && r.balls !== null).length >= rows.length * 0.8;

// ---------------------------------------------------------------- summarize
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
export const weightOf = (p: Pick<SessionPitch, "session_type" | "session_date">, today: string) =>
  SESSION_WEIGHT[p.session_type] * Math.pow(0.5, Math.max(0, daysBetween(p.session_date, today)) / HALF_LIFE_DAYS);

export type TypeSummary = {
  type: string; kind: UploadPitch["kind"]; n: number; weight: number; developing: number; excluded: number; uploads: string[];
  velo: number | null; veloMax: number | null; ivb: number | null; hb: number | null; spin: number | null;
  relH: number | null; relS: number | null; ext: number | null;
};
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export function summarize(pitches: SessionPitch[], today: string): TypeSummary[] {
  const types = [...new Set(pitches.map((p) => p.pitch_type))];
  return types.map((type) => {
    const all = pitches.filter((p) => p.pitch_type === type);
    const use = all.filter((p) => !p.excluded && !p.developing);
    const wmean = (k: keyof UploadPitch) => {
      let s = 0, w = 0;
      for (const p of use) { const v = p[k] as number | null; if (v === null || v === undefined) continue; const wt = weightOf(p, today); s += v * wt; w += wt; }
      return w ? s / w : null;
    };
    const velos = use.map((p) => p.velo_mph).filter((v): v is number => v !== null);
    return {
      type, kind: all[0].kind, n: use.length, weight: Math.round(use.reduce((a, p) => a + weightOf(p, today), 0) * 100) / 100,
      developing: all.filter((p) => p.developing && !p.excluded).length, excluded: all.filter((p) => p.excluded).length,
      uploads: [...new Set(use.map((p) => p.upload_id).filter((x): x is string => !!x))],
      velo: r1(wmean("velo_mph")), veloMax: velos.length ? Math.max(...velos) : null, ivb: r1(wmean("ivb_in")), hb: r1(wmean("hb_in")),
      spin: wmean("spin_rpm") === null ? null : Math.round(wmean("spin_rpm")!), relH: r2(wmean("rel_height_ft")), relS: r2(wmean("rel_side_ft")),
      ext: r1(wmean("extension_ft")),
    };
  }).sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
}

// ---------------------------------------------------------------- shape and slot rules
// v1.1 Step 5: shape tags come from the engine's own thresholds (plan 2.2, lib/engine.js tagFor), passed in by the server
// callers so this file stays out of the browser bundle's engine. A measured pitch is tagged against his main fastball
// (his most-thrown fastball-class pitch in the files).
export type TagFor = (kind: string, ivb: number, hb: number, velo: number, fbMph: number, fbIvb: number, fbHb: number, level?: string, type?: string) => string;
export type Migrate = (kind: string, shape: string, type?: string | null) => [string, string];
export type ProposeOpts = { tagFor?: TagFor; migrate?: Migrate; level?: string };
export const FB_CLASS = ["FB", "SI", "FC"];
// arm angle from release height and side against his shoulder height, in degrees (90 is straight over the top)
export function armAngle(relH: number, relS: number, heightFt: number): number {
  return (Math.atan2(relH - SHOULDER * heightFt, Math.abs(relS)) * 180) / Math.PI;
}
export function slotOf(angle: number): string {
  return angle >= 60 ? "over the top" : angle >= 47 ? "high three-quarter" : angle >= 35 ? "three-quarter" : angle >= 20 ? "low three-quarter" : angle >= 0 ? "sidearm" : "submarine";
}

// ---------------------------------------------------------------- propose
export type Proposal = { field: "velo" | "shape" | "slot"; pitch_id?: string; pitch_name?: string; value: unknown; current: unknown;
  basis: { n: number; weight: number; uploads: string[]; type: string; angle?: number } };
export type Unmatched = { type: string; n: number };

const num = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);

// which arsenal pitch a file's pitch type is: the same type, else the only pitch of that kind on both sides (a record still
// in v1.0 terms is read in v1.1 terms through the engine's table, when the caller passes it)
export function matchPitch(p: Pitcher, s: TypeSummary, all: TypeSummary[], migrate?: Migrate) {
  const ars = (p.pitches || []).filter((x) => x.active !== false);
  const same = ars.find((x) => x.type === s.type);
  if (same) return same;
  const kindOf = (x: { kind: string; shape?: string; type?: string }) => (migrate ? migrate(x.kind, x.shape || "", x.type || null)[0] : x.kind);
  const kindHere = ars.filter((x) => kindOf(x) === s.kind), kindThere = all.filter((t) => t.kind === s.kind);
  return kindHere.length === 1 && kindThere.length === 1 && !ars.some((x) => x.type === kindThere[0].type) ? kindHere[0] : null;
}

export function propose(p: Pitcher, summary: TypeSummary[], opts: ProposeOpts = {}): { proposals: Proposal[]; unmatched: Unmatched[]; notes: string[] } {
  const proposals: Proposal[] = [], unmatched: Unmatched[] = [], notes: string[] = [];
  // his main fastball in the files: the most-thrown fastball-class pitch (v1.1: sinkers and cutters are their own kinds)
  const fb = summary.filter((s) => FB_CLASS.includes(s.kind) && s.n >= MIN_PITCHES).sort((a, b) => b.n - a.n)[0];
  for (const s of summary) {
    if (s.n < MIN_PITCHES) { if (s.n) notes.push(`${s.type}: ${s.n} pitches, not enough yet (${MIN_PITCHES} needed).`); continue; }
    const d = matchPitch(p, s, summary, opts.migrate);
    if (!d) { unmatched.push({ type: s.type, n: s.n }); continue; }
    const basis = { n: s.n, weight: s.weight, uploads: s.uploads.slice(0, 20), type: s.type };
    const cur = num(d.velo);
    if (s.velo !== null && (cur === null || Math.abs(s.velo - cur) >= VELO_STEP)) proposals.push({ field: "velo", pitch_id: d.id, pitch_name: d.name, value: s.velo, current: cur, basis });
    if (s.ivb !== null && s.hb !== null && s.velo !== null && opts.tagFor) {
      // the pitch's kind is its own (a proposal never changes it); its v1.1 tag from the engine's thresholds
      const [dk, ds] = opts.migrate ? opts.migrate(d.kind, d.shape || "", d.type || null) : [d.kind, d.shape || ""];
      if (dk === s.kind) {
        const ref = fb && fb.velo !== null && fb.ivb !== null && fb.hb !== null ? fb : s;
        const shape = opts.tagFor(dk, s.ivb, s.hb, s.velo, ref.velo!, ref.ivb!, ref.hb!, opts.level, s.type);
        const ci = num(d.ivb), ch = num(d.hb);
        if (ds !== shape || ci === null || ch === null || Math.abs(ci - s.ivb) >= BREAK_STEP || Math.abs(ch - s.hb) >= BREAK_STEP) {
          proposals.push({ field: "shape", pitch_id: d.id, pitch_name: d.name, value: { kind: dk, shape, ivb: s.ivb, hb: s.hb }, current: { kind: dk, shape: ds, ivb: ci, hb: ch }, basis });
        }
      } else notes.push(`${s.type}: the file reads it as a ${s.kind} pitch but ${d.name} is ${dk}; change its type on his arsenal to update its shape.`);
    }
  }
  const h = num(p.height_ft);
  if (fb && fb.relH !== null && fb.relS !== null) {
    if (h === null || h < 4 || h > 7.5) notes.push("Set his height on Profile to get an arm slot from release height.");
    else {
      const angle = Math.round(armAngle(fb.relH, fb.relS, h));
      const slot = slotOf(angle);
      if (slot !== p.slot) proposals.push({ field: "slot", value: slot, current: p.slot ?? null, basis: { n: fb.n, weight: fb.weight, uploads: fb.uploads.slice(0, 20), type: fb.type, angle } });
    }
  }
  return { proposals, unmatched, notes };
}
