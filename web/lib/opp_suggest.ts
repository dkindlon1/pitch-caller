// Suggestions after games (docs/PLAN_opponent_database_2026-11-18.md 6): from the at-bats against us, suggest zone
// cells and ratings for a coach to accept or dismiss. Nothing changes on a hitter until a coach accepts. Pure: the
// thresholds are tested in opp_suggest.test.ts, and the server job (report_jobs) stores what this returns.
//   - Zone: a cell where he made hard contact 2+ times -> hot; where he whiffed or made weak contact 3+ times -> cold.
//   - Contact (strikeouts per plate appearance) and power (hard share of balls in play with contact logged): only after
//     10+ plate appearances against us (power also needs 6+ logged balls in play).
//   - A suggestion already decided (accepted or dismissed) stays quiet until its evidence clearly grows: at least double
//     the evidence it was decided on, and 2 more.
// At-bats follow merges: a hitter's history includes the hitters merged into him (his aliases).
import type { Heat, Rating } from "./opp_model.ts";

export const ZONE_HOT_MIN = 2, ZONE_COLD_MIN = 3, RATING_MIN_PA = 10, POWER_MIN_BIP = 6;
export type Ev = { hitterId?: string | null; gameId?: string; res?: string; contact?: string; out?: string; locCell?: unknown; paEnd?: string | null; type?: string; deletedAt?: number | null };
export type HitterState = { id: string; ratings?: Partial<Record<string, Rating>>; zone?: Record<string, Heat>; aliases?: string[]; mergedInto?: string; deletedAt?: number | null };
export type Prior = { hitter_id: string; kind: string; key: string; value: string; status: string; decided_n: number | null };
export type Suggestion = { hitterId: string; kind: "zone" | "rating"; key: string; value: string; n: number; evidence: Record<string, number>; text: string };

const cellOf = (c: unknown) => (Array.isArray(c) && c.length >= 2 && Number.isInteger(+c[0]) && Number.isInteger(+c[1]) && +c[0] >= 0 && +c[0] <= 4 && +c[1] >= 0 && +c[1] <= 4 ? `${+c[0]},${+c[1]}` : null);
const isPitch = (e: Ev) => (e.type === undefined || e.type === "pitch") && !e.deletedAt;

/** Every live hitter's suggestions (merged-away hitters get none; their at-bats count for the hitter they joined). */
export function suggest(evs: Ev[], hitters: HitterState[], prior: Prior[] = [], cellName: (key: string) => string = (k) => `cell ${k}`): Suggestion[] {
  const owner = new Map<string, string>();
  for (const h of hitters) if (!h.mergedInto) owner.set(h.id, h.id);
  for (const h of hitters) { if (h.mergedInto) owner.set(h.id, h.mergedInto); for (const a of h.aliases || []) owner.set(a, h.id); }   // a merge always wins
  const by = new Map<string, Ev[]>();
  for (const e of evs) { if (!isPitch(e) || !e.hitterId) continue; const o = owner.get(e.hitterId); if (!o) continue; (by.get(o) || by.set(o, []).get(o)!).push(e); }
  const out: Suggestion[] = [];
  for (const h of hitters) {
    if (h.mergedInto || h.deletedAt) continue;
    const list = by.get(h.id) || [];
    // zone
    const hard: Record<string, number> = {}, soft: Record<string, number> = {};
    for (const e of list) {
      const c = cellOf(e.locCell); if (!c) continue;
      if (e.res === "play" && e.contact === "hard") hard[c] = (hard[c] || 0) + 1;
      if (e.res === "whiff" || (e.res === "play" && e.contact === "weak")) soft[c] = (soft[c] || 0) + 1;
    }
    for (const c of new Set([...Object.keys(hard), ...Object.keys(soft)])) {
      const hh = hard[c] || 0, ss = soft[c] || 0;
      let value: Heat | null = null, n = 0;
      if (hh >= ZONE_HOT_MIN && hh * ZONE_COLD_MIN >= ss * ZONE_HOT_MIN) { value = "hot"; n = hh; }   // a hot cell wins unless the soft evidence is relatively stronger
      else if (ss >= ZONE_COLD_MIN) { value = "cold"; n = ss; }
      if (!value || (h.zone || {})[c] === value) continue;
      out.push({ hitterId: h.id, kind: "zone", key: c, value, n, evidence: { hard: hh, whiffOrWeak: ss },
        text: value === "hot" ? `Mark ${cellName(c)} hot? ${hh} hard-hit balls there.` : `Mark ${cellName(c)} cold? ${ss} whiffs or weak contact there.` });
    }
    // ratings
    const pa = list.filter((e) => e.paEnd).length, k = list.filter((e) => e.paEnd === "k").length;
    const bip = list.filter((e) => e.res === "play" && (e.contact === "weak" || e.contact === "solid" || e.contact === "hard")), hardBip = bip.filter((e) => e.contact === "hard").length;
    const cur = h.ratings || {};
    if (pa >= RATING_MIN_PA) {
      const kr = k / pa, v: Rating = kr <= 0.12 ? 3 : kr >= 0.3 ? 1 : 2;
      if (cur.contact !== v) out.push({ hitterId: h.id, kind: "rating", key: "contact", value: String(v), n: pa, evidence: { pa, k },
        text: `Contact ${v}? ${k} strikeout${k === 1 ? "" : "s"} in ${pa} plate appearances against us.` });
      if (bip.length >= POWER_MIN_BIP) {
        const hr = hardBip / bip.length, pv: Rating = hr >= 0.4 ? 3 : hr <= 0.15 ? 1 : 2;
        if (cur.power !== pv) out.push({ hitterId: h.id, kind: "rating", key: "power", value: String(pv), n: bip.length, evidence: { bip: bip.length, hard: hardBip },
          text: `Power ${pv}? ${hardBip} of ${bip.length} balls in play hit hard.` });
      }
    }
  }
  // decided ones stay quiet until the evidence clearly grows (same value); a different value is a new question
  return out.filter((s) => {
    const p = prior.find((x) => x.hitter_id === s.hitterId && x.kind === s.kind && x.key === s.key);
    if (!p || p.status === "pending" || p.value !== s.value) return true;
    const dn = p.decided_n || 0;
    return s.n >= Math.max(dn * 2, dn + 2);
  });
}

/** A suggestion's question with no evidence ("Contact 2?", "Mark middle hot?"): what the organization's owner sees when
 *  he isn't on the team's staff, since the evidence comes from the games (review fixes, Nov 19). */
export function suggestionQuestion(sg: { kind: string; key: string; value: string }, cellName: (key: string) => string = (k) => `cell ${k}`): string {
  if (sg.kind === "zone") return `Mark ${cellName(sg.key)} ${sg.value}?`;
  if (sg.kind === "rating") return `${sg.key.charAt(0).toUpperCase()}${sg.key.slice(1)} ${sg.value}?`;
  return "A change to his scouting?";
}
