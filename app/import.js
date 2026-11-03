/*
 * TrackMan and Rapsodo pitch files -> per-pitch-type summaries for a pitcher's arsenal.
 *
 * TrackMan columns are its documented names (TaggedPitchType/AutoPitchType, RelSpeed, InducedVertBreak, HorzBreak,
 * SpinRate, Extension, RelHeight, RelSide, PlateLocSide, PlateLocHeight, PitchCall). Rapsodo's export headers vary by
 * version, so columns are matched by name loosely; anything not recognised is reported, never guessed.
 *
 * Horizontal break and release side are turned into "positive = his arm side", which is what the engine expects.
 * Neither system's sign convention is assumed: a pitcher's fastball always runs to his arm side, so the file is
 * flipped if its fastballs break the other way. With no fastball in the file, his throwing hand decides.
 */
(function (root) {
  "use strict";

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === "," || c === "\t" || c === ";") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ""));
  }

  // "Kindlon, Drew" and "Drew Kindlon" are the same pitcher: compare the words, not the order
  function sameName(a, b) {
    const w = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const x = w(a), y = w(b);
    if (!x.length || !y.length) return true;
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    return short.every((t) => long.includes(t));
  }
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  // each field: exact TrackMan name first, then loose matches for Rapsodo and hand-made sheets
  const FIELDS = {
    type: ["taggedpitchtype", "pitchtype", "autopitchtype", "type", "pitch"],
    velo: ["relspeed", "velocity", "velo", "speed", "releasespeed", "pitchspeed"],
    ivb: ["inducedvertbreak", "vbtrajectory", "inducedverticalbreak", "verticalbreak", "ivb", "vb", "vertbreak", "inducedvb"],
    hb: ["horzbreak", "hbtrajectory", "horizontalbreak", "hb", "horzbrk", "hbreak"],
    spin: ["spinrate", "totalspin", "spin"],
    ext: ["extension", "releaseextension"],
    relH: ["relheight", "releaseheight"],
    relS: ["relside", "releaseside"],
    px: ["platelocside", "strikezoneside", "plateside", "locside", "platex"],
    pz: ["platelocheight", "strikezoneheight", "plateheight", "locheight", "platez"],
    call: ["pitchcall", "isstrike", "strike", "result"],
    pitcher: ["pitcher", "pitchername", "player", "playername"],
    date: ["date", "sessiondate"],
  };

  function findHeader(rows) {   // Rapsodo files can open with player and session lines before the column row
    let best = -1, score = 0;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const cells = rows[i].map(norm);
      let s = 0;
      for (const al of [FIELDS.type, FIELDS.velo, FIELDS.ivb, FIELDS.hb, FIELDS.spin]) if (cells.some((c) => al.includes(c) || al.some((a) => a.length > 3 && c.startsWith(a)))) s++;
      if (s > score) { score = s; best = i; }
    }
    return score >= 2 ? best : -1;
  }
  function mapColumns(header) {
    const cells = header.map(norm), map = {}, used = new Set();
    for (const [f, aliases] of Object.entries(FIELDS)) {
      let idx = -1;
      for (const a of aliases) { idx = cells.findIndex((c, i) => !used.has(i) && c === a); if (idx >= 0) break; }
      if (idx < 0) for (const a of aliases) { if (a.length <= 3) continue; idx = cells.findIndex((c, i) => !used.has(i) && c.startsWith(a)); if (idx >= 0) break; }
      if (idx >= 0) { map[f] = idx; used.add(idx); }
    }
    return { map, unused: header.filter((_, i) => !used.has(i) && header[i].trim() !== "") };
  }

  // real pitch names (both systems' spellings) -> the app's pitch types
  const TYPE_ALIASES = {
    fastball: "Four-seam", fourseam: "Four-seam", fourseamfastball: "Four-seam", ff: "Four-seam", "4seam": "Four-seam", fb: "Four-seam",
    twoseam: "Two-seam", twoseamfastball: "Two-seam", ft: "Two-seam", "2seam": "Two-seam",
    sinker: "Sinker", si: "Sinker", cutter: "Cutter", fc: "Cutter", ct: "Cutter",
    slider: "Slider", sl: "Slider", sweeper: "Sweeper", sw: "Sweeper", slurve: "Slurve",
    curveball: "Curveball", curve: "Curveball", cu: "Curveball", cb: "Curveball", knucklecurve: "Knuckle curve", kc: "Knuckle curve",
    changeup: "Changeup", change: "Changeup", ch: "Changeup", splitter: "Splitter", split: "Splitter", fs: "Splitter", splitfinger: "Splitter", forkball: "Forkball",
  };
  const typeOf = (s) => TYPE_ALIASES[norm(s)] || null;
  const KIND = { "Four-seam": "FB", "Two-seam": "FB", Sinker: "FB", Cutter: "FB", Slider: "SL", Sweeper: "SL", Slurve: "SL",
    Curveball: "CB", "Knuckle curve": "CB", Changeup: "CH", Splitter: "CH", Forkball: "CH" };

  const num = (s) => { if (s === undefined || s === null) return null; const t = String(s).trim(); if (t === "" || t === "-" || /^n\/?a$/i.test(t)) return null; const v = +t; return Number.isFinite(v) ? v : null; };
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
  const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

  /*
   * parse(text, { hand, pitcherName }) -> { source, n, rows, byType: [{ type, kind, n, velo, veloMax, ivb, hb, spin, ext, relH, relS,
   *   zonePct, nLoc, commandHint }], warnings, columns, skipped }
   */
  function parse(text, opts = {}) {
    const all = parseCSV(text);
    const h = findHeader(all);
    if (h < 0) throw new Error("Couldn't find the pitch columns in that file. It needs at least a pitch type and velocity or break columns.");
    const header = all[h], { map, unused } = mapColumns(header);
    if (map.type === undefined) throw new Error("No pitch type column found (looked for TaggedPitchType, Pitch Type and similar).");
    const source = map.velo !== undefined && norm(header[map.velo]) === "relspeed" ? "TrackMan" : "Rapsodo or other";
    const warnings = [];
    let rows = [], skipped = 0, otherPitchers = 0;
    for (const r of all.slice(h + 1)) {
      const get = (f) => (map[f] === undefined ? undefined : r[map[f]]);
      if (opts.pitcherName && map.pitcher !== undefined) {
        if (!sameName(get("pitcher"), opts.pitcherName)) { otherPitchers++; continue; }
      }
      const type = typeOf(get("type"));
      if (!type) { skipped++; continue; }
      rows.push({ type, kind: KIND[type], velo: num(get("velo")), ivb: num(get("ivb")), hb: num(get("hb")), spin: num(get("spin")), ext: num(get("ext")),
        relH: num(get("relH")), relS: num(get("relS")), px: num(get("px")), pz: num(get("pz")), call: get("call") });
    }
    if (otherPitchers) warnings.push(`${otherPitchers} pitches by other pitchers in the file were left out.`);
    if (skipped) warnings.push(`${skipped} rows had no pitch type the app knows (e.g. "Other" or blank) and were skipped.`);
    if (!rows.length) throw new Error("No usable pitches in that file.");

    // plate location: feet (TrackMan) or inches (some Rapsodo exports): a strike zone is about 1.5 to 3.5 ft high
    const pzs = rows.map((r) => r.pz).filter((x) => x !== null);
    if (pzs.length && median(pzs) > 12) { for (const r of rows) { if (r.px !== null) r.px /= 12; if (r.pz !== null) r.pz /= 12; } warnings.push("Plate location looked like inches; converted to feet."); }
    const relHs = rows.map((r) => r.relH).filter((x) => x !== null);
    if (relHs.length && median(relHs) > 12) { for (const r of rows) { if (r.relH !== null) r.relH /= 12; if (r.relS !== null) r.relS /= 12; } warnings.push("Release point looked like inches; converted to feet."); }

    // arm side positive: decided by his fastballs, else by his hand (assuming the catcher's-view convention)
    const fbHb = rows.filter((r) => r.kind === "FB" && r.type !== "Cutter" && r.hb !== null).map((r) => r.hb);
    let flip;
    if (fbHb.length >= 3) flip = median(fbHb) < 0;
    else { flip = opts.hand === "L"; if (rows.some((r) => r.hb !== null)) warnings.push("No fastballs in the file to tell which way is arm side; went by his throwing hand. Check the break numbers."); }
    if (flip) for (const r of rows) { if (r.hb !== null) r.hb = -r.hb; if (r.relS !== null) r.relS = -r.relS; }

    const types = [...new Set(rows.map((r) => r.type))];
    const byType = types.map((type) => {
      const rs = rows.filter((r) => r.type === type), col = (k) => rs.map((r) => r[k]).filter((x) => x !== null);
      const loc = rs.filter((r) => r.px !== null && r.pz !== null);
      const inZone = loc.filter((r) => Math.abs(r.px) <= 0.83 + 0.12 && r.pz >= 1.5 && r.pz <= 3.5).length;   // plate half-width plus a ball's width
      const zonePct = loc.length ? inZone / loc.length : null;
      const velos = col("velo");
      return { type, kind: KIND[type], n: rs.length, velo: r1(mean(velos)), veloMax: velos.length ? r1(Math.max(...velos)) : null,
        ivb: r1(mean(col("ivb"))), ivbSd: r1(sd(col("ivb"))), hb: r1(mean(col("hb"))), hbSd: r1(sd(col("hb"))), spin: col("spin").length ? Math.round(mean(col("spin"))) : null,
        ext: r1(mean(col("ext"))), relH: mean(col("relH")), relS: mean(col("relS")), zonePct: zonePct === null ? null : Math.round(zonePct * 100) / 100, nLoc: loc.length,
        commandHint: commandHint(zonePct, loc.length) };
    }).sort((a, b) => b.n - a.n);

    // release point of each pitch relative to his fastball, in inches: what the engine's tunneling uses
    const fb = byType.find((t) => t.kind === "FB" && t.relH !== null && t.relS !== null);
    for (const t of byType) {
      t.releaseOffset = fb && t.relH !== null && t.relS !== null ? [Math.round((t.relS - fb.relS) * 12 * 10) / 10, Math.round((t.relH - fb.relH) * 12 * 10) / 10] : null;
      t.relH = t.relH === null ? null : Math.round(t.relH * 100) / 100; t.relS = t.relS === null ? null : Math.round(t.relS * 100) / 100;
    }
    return { source, n: rows.length, byType, warnings, columns: Object.fromEntries(Object.entries(map).map(([k, i]) => [k, header[i]])), unused, rows };
  }

  // A rough rule, shown to the coach as a suggestion only: zone rate in a bullpen against a 1-5 command grade.
  // Needs 15+ located pitches of that type.
  function commandHint(zonePct, n) {
    if (zonePct === null || n < 15) return null;
    return zonePct < 0.35 ? 1 : zonePct < 0.42 ? 2 : zonePct < 0.50 ? 3 : zonePct < 0.58 ? 4 : 5;
  }

  // a hitters sheet: name, number, bats, PA, AVG, OBP, SLG, K%, BB% (any order, loose names)
  function parseHitters(text) {
    const all = parseCSV(text);
    if (!all.length) throw new Error("That file is empty.");
    const head = all[0].map((c) => (c.trim() === "#" ? "number" : norm(c)));   // "#" would otherwise normalise to nothing
    const col = (names) => head.findIndex((c) => names.includes(c));
    const ix = { name: col(["name", "player", "hitter", "playername"]), first: col(["first", "firstname"]), last: col(["last", "lastname"]), number: col(["number", "no", "num", "jersey"]),
      bats: col(["bats", "b", "hand", "bat"]), pos: col(["pos", "position"]), pa: col(["pa", "plateappearances"]), ab: col(["ab"]), avg: col(["avg", "ba"]), obp: col(["obp"]), slg: col(["slg"]),
      k: col(["k", "so", "kpct", "k%", "sopct"]), bb: col(["bb", "bbpct", "walks"]) };
    if (ix.name < 0 && ix.last < 0) throw new Error("Needs a Name column (or First and Last).");
    const out = [];
    for (const r of all.slice(1)) {
      const name = ix.name >= 0 ? r[ix.name] : [r[ix.first], r[ix.last]].filter(Boolean).join(" ");
      if (!name || !name.trim()) continue;
      const b = (r[ix.bats] || "R").trim().toUpperCase()[0];
      const pa = num(r[ix.pa]);
      // K and BB may be counts ("SO", "K") or rates ("K%", "K pct"): a header with % or pct, or a cell with %, is a rate
      const rate = (i) => (v) => {
        if (v === null) return null;
        const isRate = /%|pct|rate/i.test(all[0][i] || "") || String(r[i]).includes("%");
        return isRate || !pa ? v : Math.round((v / pa) * 1000) / 10;
      };
      const k = ix.k >= 0 ? rate(ix.k)(num(String(r[ix.k] ?? "").replace("%", ""))) : null;
      const bb = ix.bb >= 0 ? rate(ix.bb)(num(String(r[ix.bb] ?? "").replace("%", ""))) : null;
      out.push({ name: name.trim(), number: ix.number >= 0 ? (r[ix.number] || "").trim() : "", bats: ["R", "L", "S", "B"].includes(b) ? (b === "B" ? "S" : b) : "R", pos: ix.pos >= 0 ? (r[ix.pos] || "").trim() : "",
        stats: { pa: pa ?? "", avg: num(r[ix.avg]) ?? "", obp: num(r[ix.obp]) ?? "", slg: num(r[ix.slg]) ?? "", k_pct: k ?? "", bb_pct: bb ?? "" } });
    }
    return out;
  }

  const api = { parse, parseCSV, parseHitters, typeOf, commandHint, KIND };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PCImport = api;
})(typeof window !== "undefined" ? window : this);
