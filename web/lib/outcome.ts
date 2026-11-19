// Build 3: what the outing report and the recap show for outcome tracking (docs/PLAN_outcome_tracking_2026-11-18.md),
// from the raw events with the shared module (web/lib/peak.js = app/peak.js, the same code the game app's drift check
// runs). No "server-only" import, so the check script and tests can load it.
//   outingOutcome: his normal from the outings BEFORE this game (recency-weighted, half weight across a season break),
//                  this game's findings against it, the drift notes as they fired, and his peak archetype.
//   seasonOutcome: the season's findings against his season normal (situations that differ from his own season).
import PCPeak, { type Baseline, type DriftNote, type Findings } from "./peak";

type E = Record<string, unknown> & { gameId?: string; n?: number; pcRaw?: number; type?: string; deletedAt?: number | null };
export type Season = { name: string; start: string; end: string };
export type OutcomeOuting = { findings: Findings; drift: DriftNote[]; archetype: string | null; base: Baseline; priorOutings: number };
export type OutcomeSeason = { findings: Findings; archetype: string | null; base: Baseline };

/** the season a date falls in (by the seasons a coach marked over; after the last one: the season so far) */
export const seasonOf = (date: string, seasons: Season[]) => (seasons.find((s) => date >= s.start && date <= s.end) || { name: "so far" }).name;

/** a pitcher's events with each pitch's count in his game filled in from the order when the field isn't there (a
 *  pitcher's own view has it redacted); pitches only, in order */
export function ordered(evs: E[]): E[] {
  const ps = evs.filter((e) => (e.type === undefined || e.type === "pitch") && !e.deletedAt)
    .sort((a, b) => String(a.gameId).localeCompare(String(b.gameId)) || (Number(a.n) || 0) - (Number(b.n) || 0));
  const seen: Record<string, number> = {};
  return ps.map((e) => { const g = String(e.gameId), i = seen[g] || 0; seen[g] = i + 1; return typeof e.pcRaw === "number" ? e : { ...e, pcRaw: i }; });
}
function outingsOf(evs: E[], games: { id: string; date: string }[], seasons: Season[]) {
  const by = new Map<string, E[]>();
  for (const e of evs) { const g = String(e.gameId); (by.get(g) || by.set(g, []).get(g)!).push(e); }
  return games.filter((g) => by.has(g.id)).map((g) => ({ date: g.date, season: seasonOf(g.date, seasons), pitches: by.get(g.id)! as Record<string, unknown>[] }));
}
const kindsOf = (pitches: { id?: string | null; kind?: string | null }[] = []) => Object.fromEntries(pitches.filter((p) => p.id).map((p) => [String(p.id), String(p.kind || "?")]));

/** one outing: his history (every earlier game of his) is the baseline; this game's pitches are looked at */
export function outingOutcome(allEvs: E[], games: { id: string; date: string }[], gameId: string, seasons: Season[], pitches: { id?: string | null; kind?: string | null }[] = []): OutcomeOuting {
  const evs = ordered(allEvs), g = games.find((x) => x.id === gameId);
  const before = games.filter((x) => g && (x.date < g.date || (x.date === g.date && x.id < g.id)));
  const outs = outingsOf(evs, before, seasons), kinds = kindsOf(pitches);
  const base = PCPeak.baseline(outs, { season: g ? seasonOf(g.date, seasons) : undefined, kinds });
  const tonight = evs.filter((e) => e.gameId === gameId) as Record<string, unknown>[];
  const withTonight = PCPeak.baseline([...outs, ...(g ? [{ date: g.date, season: seasonOf(g.date, seasons), pitches: tonight }] : [])], { season: g ? seasonOf(g.date, seasons) : undefined, kinds });
  return { findings: PCPeak.findings(tonight, base, { kinds }), drift: PCPeak.driftLog(tonight, base, { kinds }), archetype: PCPeak.archetype(withTonight), base, priorOutings: outs.length };
}

/** a season (or the season so far): his season normal is the baseline; the season's pitches are looked at */
export function seasonOutcome(seasonEvs: E[], games: { id: string; date: string }[], seasons: Season[], pitches: { id?: string | null; kind?: string | null }[] = []): OutcomeSeason {
  const evs = ordered(seasonEvs), kinds = kindsOf(pitches), outs = outingsOf(evs, games, seasons);
  const base = PCPeak.baseline(outs, { kinds, flat: true });
  return { findings: PCPeak.findings(evs as Record<string, unknown>[], base, { kinds }), archetype: PCPeak.archetype(base), base };
}

/** his peak archetype from every outing he has (recency-weighted normal): for his profile */
export function peakLabel(allEvs: E[], games: { id: string; date: string }[], pitches: { id?: string | null; kind?: string | null }[] = []): string | null {
  return PCPeak.archetype(PCPeak.baseline(outingsOf(ordered(allEvs), games, []), { kinds: kindsOf(pitches) }));
}
