/*
 * Pitch-count rules: how many pitches a pitcher may throw in a day, how much rest each count needs, and the day he can
 * pitch again. Presets come from the governing bodies' own pages (source and the date they were checked are on each);
 * the coach picks one for the team and can change any number.
 *
 * A tier [upTo, rest] means "up to upTo pitches needs rest". unit "days" = calendar days off, so he's eligible on the
 * day + rest + 1; unit "nights" (New York) = nights of rest, eligible on the day + rest. maxConsecutive: the most days
 * in a row he may pitch. windows: [{ days, max }]: no more than max pitches in any `days` calendar days.
 * Dates are "YYYY-MM-DD" in the team's time zone; only game pitches count.
 */
(function (root) {
  "use strict";
  const T14 = (max) => [[20, 0], [35, 1], [50, 2], [65, 3], [max, 4]];
  const T15 = (max) => [[30, 0], [45, 1], [60, 2], [75, 3], [max, 4]];
  const T17 = (max) => [[30, 0], [45, 1], [60, 2], [80, 3], [max, 4]];
  const PS = { group: "MLB Pitch Smart", source: "https://www.mlb.com/pitch-smart/pitching-guidelines", checked: "2026-11-05", unit: "days", maxConsecutive: 2, finishBatter: null };
  const LL = { group: "Little League (regular season)", source: "https://www.littleleague.org/playing-rules/pitch-count/", checked: "2026-11-05", unit: "days", maxConsecutive: 2, finishBatter: true };
  const NY = { group: "New York (NYSPHSAA)", source: "https://cdn3.sportngin.com/attachments/document/b52d-1885402/NYSPHSAA_pitch_count_and_rules_Rev_for_2022.pdf",
    checked: "2026-11-05", sourceNote: "The association's document revised for 2022, the latest found. Check with your section.", unit: "nights", maxConsecutive: null, finishBatter: true };
  const NJ = { group: "New Jersey (NJSIAA)", source: "https://www.njsiaa.org/sites/default/files/documents/2025-12/pitch-count-rule-2025-26.pdf", checked: "2026-11-05",
    sourceNote: "Revised Dec 5, 2025.", unit: "days", maxConsecutive: 2, finishBatter: true };
  const GA = { group: "Georgia (GHSA)", source: "https://www.ghsa.net/sites/default/files/documents/baseball/Baseball_Pitch_Count_Policy.pdf", checked: "2026-11-05",
    unit: "days", maxConsecutive: 2, finishBatter: true };
  const p = (base, x) => Object.assign({}, base, x);
  const PRESETS = [
    p(PS, { id: "ps-7-8", name: "Pitch Smart, ages 7-8", max: 50, tiers: [[20, 0], [35, 1], [50, 2]] }),
    p(PS, { id: "ps-9-10", name: "Pitch Smart, ages 9-10", max: 75, tiers: T14(75) }),
    p(PS, { id: "ps-11-12", name: "Pitch Smart, ages 11-12", max: 85, tiers: T14(85) }),
    p(PS, { id: "ps-13-14", name: "Pitch Smart, ages 13-14", max: 95, tiers: T14(95) }),
    p(PS, { id: "ps-15-16", name: "Pitch Smart, ages 15-16", max: 95, tiers: T15(95) }),
    p(PS, { id: "ps-17-18", name: "Pitch Smart, ages 17-18", max: 105, tiers: T17(105) }),
    // the guidelines allow 120 but list rest only up to 105; above 105 is counted as the top tier (4 days)
    p(PS, { id: "ps-19-22", name: "Pitch Smart, ages 19-22", max: 120, tiers: T17(120), sourceNote: "Rest is listed only up to 105 pitches; 106-120 is counted as 4 days." }),
    p(LL, { id: "ll-6-8", name: "Little League, ages 6-8", max: 50, tiers: T14(50) }),
    p(LL, { id: "ll-9-10", name: "Little League, ages 9-10", max: 75, tiers: T14(75) }),
    p(LL, { id: "ll-11-12", name: "Little League, ages 11-12", max: 85, tiers: T14(85) }),
    p(LL, { id: "ll-13-14", name: "Little League, ages 13-14", max: 95, tiers: T14(95) }),
    p(LL, { id: "ll-15-16", name: "Little League, ages 15-16", max: 95, tiers: T15(95) }),
    p(NY, { id: "ny-varsity", name: "New York varsity", byMonth: {
      3: { max: 85, tiers: [[30, 1], [45, 2], [75, 3], [85, 4]] },
      4: { max: 105, tiers: [[30, 1], [65, 2], [95, 3], [105, 4]] },
      5: { max: 125, tiers: [[40, 1], [71, 2], [102, 3], [125, 4]] } } }),
    p(NY, { id: "ny-jv", name: "New York JV and freshman", max: 85, tiers: [[30, 1], [45, 2], [75, 3], [85, 4]] }),
    p(NY, { id: "ny-modified", name: "New York modified", max: 75, tiers: [[20, 1], [40, 2], [60, 3], [75, 4]] }),
    p(NJ, { id: "nj", name: "New Jersey", max: 110, tiers: [[30, 0], [50, 1], [70, 2], [90, 3], [110, 4]], windows: [{ days: 5, max: 150 }] }),
    p(GA, { id: "ga-varsity", name: "Georgia varsity", max: 110, tiers: [[35, 0], [60, 1], [85, 2], [110, 3]], windows: [{ days: 2, max: 110 }] }),
    p(GA, { id: "ga-sub", name: "Georgia sub-varsity", max: 90, tiers: [[24, 0], [44, 1], [64, 2], [90, 3]], windows: [{ days: 2, max: 90 }] }),
    { id: "custom", group: "Other", name: "Custom (college, pro, or your own league)", source: null, checked: null,
      sourceNote: "NCAA has no pitch-count rule. Set your own numbers.", unit: "days", max: 100, tiers: [[30, 0], [45, 1], [60, 2], [80, 3], [100, 4]], maxConsecutive: 2, finishBatter: true },
  ];
  const byId = (id) => PRESETS.find((x) => x.id === id) || null;

  // a team's rule: a preset, with the coach's own numbers on top
  function resolve(setting) {
    const s = setting || {};
    const base = byId(s.preset) || byId("custom");
    const r = JSON.parse(JSON.stringify(base));
    for (const k of ["max", "tiers", "unit", "maxConsecutive", "windows", "finishBatter", "byMonth"]) if (s[k] !== undefined) r[k] = s[k];
    if (s.preset && s.preset !== r.id) r.edited = true;
    if (Object.keys(s).some((k) => k !== "preset")) r.edited = true;
    return r;
  }

  const month = (date) => +String(date).slice(5, 7);
  // the max and tiers on a date (New York varsity changes by month: before March counts as March, after June as May/June)
  function limits(rule, date) {
    if (!rule.byMonth) return { max: rule.max, tiers: rule.tiers };
    const ms = Object.keys(rule.byMonth).map(Number).sort((a, b) => a - b);
    const m = date ? month(date) : ms[0];
    const pick = ms.filter((x) => x <= m).pop() || ms[0];
    return rule.byMonth[pick];
  }
  function restFor(rule, pitches, date) {
    if (!(pitches > 0)) return 0;
    const { tiers } = limits(rule, date);
    for (const [upTo, rest] of tiers) if (pitches <= upTo) return rest;
    return tiers[tiers.length - 1][1];
  }

  const D = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => iso(D(s) + n * 86400000);
  const between = (a, b) => Math.round((D(b) - D(a)) / 86400000);

  // the day each outing's rest ends, and the first day he may pitch again (never before today)
  function eligibleOn(rule, outings, today) {
    const days = new Map();
    for (const o of outings || []) if (o && o.date && o.pitches > 0) days.set(o.date, (days.get(o.date) || 0) + o.pitches);
    const list = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let date = today, why = null;
    const later = (d, reason) => { if (d > date) { date = d; why = reason; } };
    for (const [d, n] of list) {
      const rest = restFor(rule, n, d);
      later(addDays(d, rule.unit === "nights" ? rest : rest + 1), { kind: "rest", date: d, pitches: n, rest, unit: rule.unit });
    }
    // three days in a row (or whatever the rule allows): the day after a full run is off
    if (rule.maxConsecutive && list.length) {
      let run = 1;
      for (let i = list.length - 1; i > 0 && between(list[i - 1][0], list[i][0]) === 1; i--) run++;
      const last = list[list.length - 1][0];
      if (run >= rule.maxConsecutive) later(addDays(last, 2), { kind: "consecutive", date: last, run });
    }
    // no more than max in any `days` days: the first day the window back from it has room for a pitch
    for (const w of rule.windows || []) {
      let d = date;
      for (let guard = 0; guard < 60; guard++) {
        let sum = 0;
        for (const [od, n] of list) { const back = between(od, d); if (back >= 1 && back < w.days) sum += n; }
        if (sum < w.max) break;
        d = addDays(d, 1);
      }
      later(d, { kind: "window", days: w.days, max: w.max });
    }
    return { date, today: date === today, why };
  }

  // during a game: where he is against the limit and the next rest tier
  function liveStatus(rule, count, date, outings) {
    const lim = limits(rule, date), tiers = lim.tiers;
    // a multi-day cap (Georgia's 110 over two days, New Jersey's 150 in five) lowers today's limit by what he threw lately
    let max = lim.max, capped = null;
    for (const w of rule.windows || []) {
      let sum = 0;
      for (const o of outings || []) { const back = between(o.date, date); if (o.pitches > 0 && back >= 1 && back < w.days) sum += o.pitches; }
      if (w.max - sum < max) { max = Math.max(0, w.max - sum); capped = { days: w.days, max: w.max, before: sum }; }
    }
    const rest = restFor(rule, count, date);
    // the tier he's in now (by the next pitch for a count of 0), and where the next one starts
    const i = tiers.findIndex(([upTo]) => Math.max(count, 1) <= upTo);
    const nextAt = i >= 0 && i < tiers.length - 1 && tiers[i][0] + 1 <= max ? tiers[i][0] + 1 : null;
    const level = count >= max ? "limit" : max - count <= 10 ? "near" : "ok";
    return { count, max, left: Math.max(0, max - count), rest, unit: rule.unit, level, capped,
      nextAt, nextRest: nextAt ? tiers[i + 1][1] : null, finishBatter: rule.finishBatter };
  }

  const PCRules = { VERSION: "1.0.0", PRESETS, byId, resolve, limits, restFor, eligibleOn, liveStatus, addDays };
  root.PCRules = PCRules;
  if (typeof module !== "undefined" && module.exports) module.exports = PCRules;
})(typeof self !== "undefined" ? self : this);
