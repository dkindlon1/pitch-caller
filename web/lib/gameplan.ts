// A game set up on the website ahead of time (docs/PLAN_portal_2026-11-12.md): the games record the game app makes at
// the first pitch (app/roster.js, ensureGameRecord), made early with status "planned", plus the date, start time,
// starter and radar choice. The game app on any device opens it with ?game=<id> and starts the game on this record.
// Pure: no database, so the checks run in unit tests (gameplan.test.ts).

export const LEVELS: Record<string, string> = { hs: "High school", travel: "Travel ball", college_d3: "College D3", college_d1: "College D1" };
export const TIERS: [number, string, string][] = [
  [1, "Results only", "Ball, strike, foul, in play, hit or out. The minimum a charter can keep up with."],
  [2, "Plus contact", "Weak, solid or hard on every ball in play."],
  [3, "Plus hitter reads", "Swing timing on whiffs and where fouls go. Helps it learn each hitter."],
  [4, "Plus measured break", "TrackMan or Rapsodo break numbers for each pitch."],
];
export const UMPS = ["tight", "normal", "wide"] as const;
export const defaultInnings = (level: string) => (level === "hs" || level === "travel" ? 7 : 9);

export type Bat = { hitterId: string | null; name: string; hand: "R" | "L" | "S" };
// what the setup screen sends (the portal's form, as JSON)
export type PlanInput = {
  date: string; time: string; home: boolean | null; innings: number | null; extrasRunner: boolean; level: string;
  opponentId: string | null; newOpponent: string; staffIds: string[]; starterId: string | null; catcherId: string | null;
  lineup: Bat[]; inputs: number; logLoc: boolean; radar: boolean; umpSeed: string;
};
// the games record, in the game app's shape
export type GameDoc = {
  id?: string; createdAt?: number; updatedAt?: number; date: string; time: string | null; level: string; inputs: number; logLoc: boolean; radar: boolean;
  opponentId: string | null; catcherId: string | null; staffIds: string[]; starterId: string | null; lineup: Bat[]; status: "planned" | "live" | "suspended" | "final";
  deviceId: string | null; setup: { engine: "v09"; home: boolean | null; innings: number | null; extrasRunner: boolean; umpSeed: string };
  plannedBy?: string | null; plannedAt?: number; [k: string]: unknown;
};

export type Known = { pitcherIds: Set<string>; opponentIds: Set<string>; catcherIds: Set<string>; hitterIds: Map<string, string> /* hitter -> its team */ };

// checks what was sent and builds the record. errors name the step to go back to.
export function buildPlan(inp: PlanInput, known: Known, prev?: GameDoc | null): { doc: GameDoc | null; errors: { step: number; msg: string }[] } {
  const errors: { step: number; msg: string }[] = [];
  const err = (step: number, msg: string) => errors.push({ step, msg });
  const date = String(inp.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + "T12:00:00Z"))) err(1, "Pick the game’s date.");
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(inp.time || "")) ? String(inp.time) : null;
  if (!(inp.level in LEVELS)) err(1, "Pick the level.");
  const innings = inp.innings == null || (inp.innings as unknown) === "" ? null : Math.round(Number(inp.innings));
  if (innings !== null && !(innings >= 5 && innings <= 12)) err(1, "Scheduled innings are between 5 and 12.");
  const home = inp.home === true ? true : inp.home === false ? false : null;
  const newOpp = String(inp.newOpponent || "").trim().slice(0, 80);
  const opponentId = inp.opponentId && known.opponentIds.has(inp.opponentId) ? inp.opponentId : null;
  if (inp.opponentId && !opponentId && inp.opponentId !== "__new") err(1, "That opponent is no longer on your list.");
  if (inp.opponentId === "__new" && !newOpp) err(1, "Type the new opponent’s name.");

  const staffIds = [...new Set((inp.staffIds || []).filter((id) => known.pitcherIds.has(id)))].slice(0, 20);
  if (!staffIds.length) err(2, "Pick at least one pitcher for today’s staff.");
  const starterId = inp.starterId && staffIds.includes(inp.starterId) ? inp.starterId : staffIds[0] || null;
  // the starter goes first: the game app puts the first pitcher on today's staff on the mound
  const ordered = starterId ? [starterId, ...staffIds.filter((x) => x !== starterId)] : staffIds;
  const catcherId = inp.catcherId && known.catcherIds.has(inp.catcherId) ? inp.catcherId : null;

  const lineup: Bat[] = (inp.lineup || []).slice(0, 12).map((b) => ({
    hitterId: b.hitterId && known.hitterIds.has(b.hitterId) && (!opponentId || known.hitterIds.get(b.hitterId) === opponentId) ? b.hitterId : null,
    name: String(b.name || "").trim().slice(0, 80), hand: b.hand === "L" || b.hand === "S" ? b.hand : "R",
  }));
  while (lineup.length < 9) lineup.push({ hitterId: null, name: "", hand: "R" });

  const inputs = [1, 2, 3, 4].includes(Number(inp.inputs)) ? Number(inp.inputs) : 2;
  const umpSeed = (UMPS as readonly string[]).includes(inp.umpSeed) ? inp.umpSeed : "normal";
  if (prev && prev.status !== "planned") err(5, "This game has already started, so its plan can’t be changed here.");
  if (errors.length) return { doc: null, errors };

  const doc: GameDoc = Object.assign({}, prev || {}, {
    date, time, level: inp.level, inputs, logLoc: !!inp.logLoc, radar: !!inp.radar, opponentId, catcherId,
    staffIds: ordered, starterId, lineup, status: "planned" as const, deviceId: null,
    setup: { engine: "v09" as const, home, innings, extrasRunner: !!inp.extrasRunner, umpSeed },
  });
  return { doc, errors };
}

// a record the game app can open on this device: planned, or live on this very device (a reload mid-game)
export function openable(doc: Pick<GameDoc, "status" | "deviceId"> | null, deviceId: string | null): "ok" | "resume" | "elsewhere" | "over" | "missing" {
  if (!doc) return "missing";
  if (doc.status === "planned") return "ok";
  if (doc.status === "final") return "over";
  return doc.deviceId && deviceId && doc.deviceId === deviceId ? "resume" : "elsewhere";
}
