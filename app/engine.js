/*
 * Pitch Caller engine v1.0, JavaScript port of engine.py (same math, same order of operations).
 * cost08(p,q|s) = sum_e P(e|p,q,s) * [value after e] over the at-bat table; calls drawn inside a stakes-scaled window.
 * Data tables (run values, outcome fit) come from engine_data.json, exported from the Python engine.
 * Works in the browser (window.PitchEngine) and in Node (module.exports) for parity tests.
 */
(function (root) {
  "use strict";
  let D = null;                       // tables, set by init(data)

  const QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle", "down-middle"];   // v1.0 Step 7: down-middle = "keep it down"
  // v0.7b coach rule W1 (Drew): never a chase target at 3-0 or 3-1
  // v0.8 (Drew's rule): attack the zone at 2-2 too
  const targets = (b, k) => (((b === 3 && (k === 0 || k === 1)) || (b === 2 && k === 2)) ? QUADS.filter((q) => q !== "chase") : QUADS);
  const ZONES = ["heart", "edge", "off", "noncomp"];
  const COUNTS = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2]];
  const EV_ADJ = { "up-in": 3.0, "up-away": 0.0, "down-in": 0.0, "down-away": -3.0, middle: 0.0, chase: -3.0, "down-middle": -1.5 };
  const HBP_LOC = { "up-in": 1.6, "down-in": 1.6, chase: 0.8, middle: 0.5, "up-away": 0.3, "down-away": 0.3, "down-middle": 0.5 };
  // v1.0 #10: chase is class-aware (fastball chase is up: plays fast, hits batters like an away spot)
  const evAdj = (p, q) => (q === "chase" ? (isOffspeed(p.kind) ? -3.0 : 3.0) : EV_ADJ[q]);
  const hbpLoc = (p, q) => (q === "chase" ? (isOffspeed(p.kind) ? 0.8 : 0.3) : HBP_LOC[q]);   // FB chase 0.3: Drew, Nov 10
  const CONF_DELTA = { ball: -0.02, cstrike: 0.03, whiff: 0.05, hard: -0.08, shakeoff: -0.05 };   // v1.2.1: shake-off 0.05 (was 0.20), as engine.py
  const CONF_CAP_ABOVE = 0.10, CONF_REGRESS = 0.15, LOC_WINDOW = 0.010;
  // v1.3 Part 2 (docs/TABLES_v13.md): the band base rates S0 C0 W0 F0 Q0 ZONE_IN, the hand class terms (W_FB, KIND_W_OS, the
  // off-speed line, chase, hanger), the zone table's cells and the count layer come from engine_data.json's TABLES (the
  // versioned files engine.py loaded; zone_v12 / count_v12 = v1.2's numbers), set in initTables.
  let S0 = null, C0 = null, W0 = null, F0 = null, Q0 = null, ZONE_IN = null, W_FB = null, KIND_W_OS = null, ZCLASS = null, HANGER = null;
  // v1.3 core: the quality-gated hanger (ruling 3; zone class.hanger_gate, absent = 0) and the ground-ball logit by kind
  // (ruling 2's P3 row; zone class.gb_kind, absent = 0), as engine.py HANGER_GATE / HANGER_GATE_FULL / GB_KIND
  let HANGER_GATE = 0.0, GB_KIND = {};
  const HANGER_GATE_FULL = 0.30;
  let ZT = null, CT = null, MP = null;   // MP: v1.3 ruling 12, the mean-preservation scalars (mp_<v>.json; engine.py mp_cells)
  const ZCELL = new Map(), CNTC = new Map(), CNTBO = new Map(), GBV = new Map();
  const T_ZONE_OUT = ["swing", "cstrike", "whiff", "foul", "hard"], T_COUNT_BAND_OUT = ["swing", "whiff", "foul", "hard"];
  const TABLE_LEVEL_ALIAS = { travel: "hs", college: "college_d1" };
  const T_HT = { up: "up", middle: "mid", down: "down" };
  function initTables(T) {
    ZT = T.zone; CT = T.count.levels; MP = T.mp.levels; ZCLASS = ZT.class;
    const b = ZT.base;
    S0 = b.swing; C0 = b.cstrike; W0 = b.whiff; F0 = b.foul; Q0 = b.quality; ZONE_IN = b.zone_in;
    W_FB = ZCLASS.whiff_fb; KIND_W_OS = ZCLASS.whiff_os; HANGER = ZCLASS.hanger_hard;
    HANGER_GATE = ZCLASS.hanger_gate ?? 0.0; GB_KIND = ZCLASS.gb_kind || {};
    ZCELL.clear(); CNTC.clear(); CNTBO.clear(); GBV.clear();
  }
  const ctLevel = (level) => CT[level] || CT[TABLE_LEVEL_ALIAS[level]];
  // the zone table's profile and count group (mirror of engine.py zone_profile / count_group)
  const zoneProfile = (p) => (p.kind === "SL" && p.shape === "sweeper" ? "SW" : (p.kind === "CH" && p.shape === "split" ? "SP" : p.kind));
  const countGroup = (b, k) => (k === 2 ? "two" : (b === 0 && k === 0 ? "first" : (b > k ? "ahead" : (b === k ? "even" : "behind"))));
  function zoneCells(level, prof, cg, ht) {   // {band: [swing, cstrike, whiff, foul, hard]} (mirror of engine.py zone_cells)
    const key = level + "|" + prof + "|" + cg + "|" + ht;
    let v = ZCELL.get(key);
    if (!v) {
      const lc = ZT.level_cells || {};
      const cells = lc[level] || lc[TABLE_LEVEL_ALIAS[level] || level] || ZT.cells;
      v = {};
      for (const z of ZONES) v[z] = T_ZONE_OUT.map((o) => cells[o][z][prof][cg][ht]);
      ZCELL.set(key, v);
    }
    return v;
  }
  function countCells(level, b, k) {   // [{band: [swing, whiff, foul, hard]}, cstrike kappa, bip_gb] (mirror of engine.py count_cells)
    const key = level + "|" + b + "-" + k;
    let v = CNTC.get(key);
    if (!v) {
      const L = ctLevel(level), c = b + "-" + k, byZ = {};
      const M = MP[level] || MP[TABLE_LEVEL_ALIAS[level]];   // v1.3 ruling 12: + the mean-preservation scalars (engine.py count_cells)
      const msw = M.swing[c], mwh = M.whiff[c], mfo = M.foul[c], mcs = M.cstrike[c], mgb = M.bip_gb[c];
      for (const z of ZONES) byZ[z] = [L.swing[c][z] + msw, L.whiff[c][z] + mwh, L.foul[c][z] + mfo, L.hard[c][z]];
      v = [byZ, L.cstrike[c] + mcs, L.bip_gb[c] + mgb];
      CNTC.set(key, v);
    }
    return v;
  }
  const countBaseOut = (level, outs, bases) => ctLevel(level).swing_base_out[outs + "|" + basesKey(bases)];
  function gbByCount(level) {   // the level's bip_gb differs between counts (mirror of engine.py gb_by_count)
    let v = GBV.get(level);
    if (v === undefined) {
      const L = CT[level] || CT[TABLE_LEVEL_ALIAS[level] || ""];
      v = !!L && new Set(COUNTS.map(([b, k]) => countCells(level, b, k)[2])).size > 1;
      GBV.set(level, v);
    }
    return v;
  }
  // v1.1 Step 1b: each kind and tag's speed gap and movement by level (mirror of engine.py PROFILES, plan 2.2)
  // --- PROFILES: generated by profiles_fit.py --write-engines from 2024 Statcast (results/v11/profiles.json); do not edit ---
  // [dmph off his main fastball, IVB, HB arm side +] for a right-hander, by level, "kind|tag"
  const PROFILES = {
    mlb: { "FB|": [0.0, 16.2, 7.7], "FB|rides": [0.0, 19.2, 6.5], "FB|runs": [0.0, 14.4, 12.5], "FB|cuts": [0.0, 14.9, 0.8], "FB|straight": [0.0, 13.0, 8.0], "SI|": [0.4, 8.4, 15.2], "SI|two-seam": [0.2, 13.3, 13.8], "SI|drop": [0.6, 2.8, 16.1], "SI|run": [0.4, 7.9, 18.2], "FC|": [4.8, 7.9, -2.5], "FC|big": [7.8, 4.6, -6.5], "FC|hard": [3.0, 9.2, -1.1], "FC|ride": [4.6, 12.5, -4.2], "SL|": [9.2, 1.6, -6.0], "SL|sweeper": [11.5, 0.8, -13.7], "SL|slurve": [11.3, -4.4, -8.8], "SL|gyro": [8.0, 2.5, -1.4], "SL|tight": [8.4, 1.9, -5.2], "CB|": [14.0, -10.3, -8.8], "CB|12-6": [13.5, -12.7, -3.7], "CB|sweeping": [13.8, -7.0, -12.4], "CB|power": [8.3, -10.6, -7.4], "CB|slow": [17.0, -13.9, -9.8], "CH|": [8.0, 5.2, 14.0], "CH|firm": [4.2, 4.4, 14.8], "CH|split": [8.2, 2.5, 11.5], "CH|drop": [8.0, 2.8, 15.2], "CH|fade": [8.3, 8.8, 14.9] },
    college_d1: { "FB|": [0.0, 16.0, 8.0], "FB|rides": [0.0, 19.0, 6.8], "FB|runs": [0.0, 14.2, 12.8], "FB|cuts": [0.0, 14.7, 1.1], "FB|straight": [0.0, 12.8, 8.3], "SI|": [0.4, 8.4, 15.2], "SI|two-seam": [0.2, 13.3, 13.8], "SI|drop": [0.6, 2.8, 16.1], "SI|run": [0.4, 7.9, 18.2], "FC|": [4.8, 7.9, -2.5], "FC|big": [7.8, 4.6, -6.5], "FC|hard": [3.0, 9.2, -1.1], "FC|ride": [4.6, 12.5, -4.2], "SL|": [9.0, 4.0, -1.5], "SL|sweeper": [11.3, 3.2, -9.2], "SL|slurve": [11.1, -2.0, -4.3], "SL|gyro": [7.8, 4.9, 3.1], "SL|tight": [8.2, 4.3, -0.7], "CB|": [12.0, -1.0, -8.8], "CB|12-6": [11.5, -3.4, -3.7], "CB|sweeping": [11.8, 2.3, -12.4], "CB|power": [6.3, -1.3, -7.4], "CB|slow": [15.0, -4.6, -9.8], "CH|": [7.0, 5.2, 14.0], "CH|firm": [3.2, 4.4, 14.8], "CH|split": [7.2, 2.5, 11.5], "CH|drop": [7.0, 2.8, 15.2], "CH|fade": [7.3, 8.8, 14.9] },
    college_d3: { "FB|": [0.0, 16.0, 8.0], "FB|rides": [0.0, 19.0, 6.8], "FB|runs": [0.0, 14.2, 12.8], "FB|cuts": [0.0, 14.7, 1.1], "FB|straight": [0.0, 12.8, 8.3], "SI|": [0.4, 8.4, 15.2], "SI|two-seam": [0.2, 13.3, 13.8], "SI|drop": [0.6, 2.8, 16.1], "SI|run": [0.4, 7.9, 18.2], "FC|": [4.8, 7.9, -2.5], "FC|big": [7.8, 4.6, -6.5], "FC|hard": [3.0, 9.2, -1.1], "FC|ride": [4.6, 12.5, -4.2], "SL|": [9.0, 4.0, -1.5], "SL|sweeper": [11.3, 3.2, -9.2], "SL|slurve": [11.1, -2.0, -4.3], "SL|gyro": [7.8, 4.9, 3.1], "SL|tight": [8.2, 4.3, -0.7], "CB|": [12.0, -1.0, -8.8], "CB|12-6": [11.5, -3.4, -3.7], "CB|sweeping": [11.8, 2.3, -12.4], "CB|power": [6.3, -1.3, -7.4], "CB|slow": [15.0, -4.6, -9.8], "CH|": [7.0, 5.2, 14.0], "CH|firm": [3.2, 4.4, 14.8], "CH|split": [7.2, 2.5, 11.5], "CH|drop": [7.0, 2.8, 15.2], "CH|fade": [7.3, 8.8, 14.9] },
    hs: { "FB|": [0.0, 13.6, 6.8], "FB|rides": [0.0, 16.1, 5.8], "FB|runs": [0.0, 12.1, 10.9], "FB|cuts": [0.0, 12.5, 0.9], "FB|straight": [0.0, 10.9, 7.1], "SI|": [0.4, 7.1, 12.9], "SI|two-seam": [0.2, 11.3, 11.7], "SI|drop": [0.6, 2.4, 13.7], "SI|run": [0.4, 6.7, 15.5], "FC|": [4.8, 6.7, -2.1], "FC|big": [7.8, 3.9, -5.5], "FC|hard": [3.0, 7.8, -0.9], "FC|ride": [4.6, 10.6, -3.6], "SL|": [9.0, 3.4, -1.3], "SL|sweeper": [11.3, 2.7, -7.8], "SL|slurve": [11.1, -1.7, -3.7], "SL|gyro": [7.8, 4.2, 2.6], "SL|tight": [8.2, 3.7, -0.6], "CB|": [12.0, -0.8, -7.5], "CB|12-6": [11.5, -2.9, -3.1], "CB|sweeping": [11.8, 2.0, -10.5], "CB|power": [6.3, -1.1, -6.3], "CB|slow": [15.0, -3.9, -8.3], "CH|": [7.0, 4.4, 11.9], "CH|firm": [3.2, 3.7, 12.6], "CH|split": [7.2, 2.1, 9.8], "CH|drop": [7.0, 2.4, 12.9], "CH|fade": [7.3, 7.5, 12.7] },
    travel: { "FB|": [0.0, 13.6, 6.8], "FB|rides": [0.0, 16.1, 5.8], "FB|runs": [0.0, 12.1, 10.9], "FB|cuts": [0.0, 12.5, 0.9], "FB|straight": [0.0, 10.9, 7.1], "SI|": [0.4, 7.1, 12.9], "SI|two-seam": [0.2, 11.3, 11.7], "SI|drop": [0.6, 2.4, 13.7], "SI|run": [0.4, 6.7, 15.5], "FC|": [4.8, 6.7, -2.1], "FC|big": [7.8, 3.9, -5.5], "FC|hard": [3.0, 7.8, -0.9], "FC|ride": [4.6, 10.6, -3.6], "SL|": [9.0, 3.4, -1.3], "SL|sweeper": [11.3, 2.7, -7.8], "SL|slurve": [11.1, -1.7, -3.7], "SL|gyro": [7.8, 4.2, 2.6], "SL|tight": [8.2, 3.7, -0.6], "CB|": [12.0, -0.8, -7.5], "CB|12-6": [11.5, -2.9, -3.1], "CB|sweeping": [11.8, 2.0, -10.5], "CB|power": [6.3, -1.1, -6.3], "CB|slow": [15.0, -3.9, -8.3], "CH|": [7.0, 4.4, 11.9], "CH|firm": [3.2, 3.7, 12.6], "CH|split": [7.2, 2.1, 9.8], "CH|drop": [7.0, 2.4, 12.9], "CH|fade": [7.3, 7.5, 12.7] },
  };
  const PROFILE_T = { fb_rides_ivb: 2.0, fb_runs_hb: 3.0, fb_cuts_hb: -5.0, fb_straight_ivb: -2.0, fb_straight_hb: 3.0, si_twoseam_ivb: 3.0, si_drop_ivb: -3.0, si_run_hb: 2.0, fc_big_hb: -7.0, fc_big_dmph: 7.0, fc_hard_dmph: 4.0, fc_hard_hb: -4.0, fc_ride_ivb: 3.0, sl_sweeper_hb: -10.0, sl_slurve_ivb: -3.0, sl_slurve_hb: -6.0, sl_gyro_abshb: 3.0, cb_power_dmph: 9.0, cb_slow_dmph: 15.0, ch_firm_dmph: 5.0, ch_split_divb: -12.0, ch_split_dhb: 4.0, ch_drop_divb: -11.0, ch_fade_dhb: 4.0 };
  const MOVE_RATIO = { mlb: 1.0, college_d1: 1.0, college_d3: 1.0, hs: 0.85, travel: 0.85 };
  // --- end PROFILES ---
  // --- PROFILE_TERMS: generated by profile_terms_tables.py --write-engines from the Step 2 fits; do not edit ---
  const PT_C = {"whiff": {"FB": [-0.0378, 0.0295, -0.0104, -0.0132], "SL": [0.041, 0.0218, 0.0059, 0.0051], "CB": [0.0193, 0.0076, -0.0005, -0.0017], "CH": [0.0757, 0.0138, 0.007, 0.0164]}, "chase": {"FB": [0.0174, -0.0276, 0.0055, 0.0054], "SL": [-0.0336, 0.0018, -0.0273, 0.0007], "CB": [-0.0161, 0.0163, -0.0234, -0.0034], "CH": [0.0085, -0.0317, 0.0081, 0.0062]}, "cstrike": {"FB": [0.0249, -0.011, 0.0066, 0.0054], "SL": [0.0186, -0.0048, 0.002, -0.0013], "CB": [0.0025, -0.0012, 0.0027, -0.0004], "CH": [0.0281, 0.0038, 0.0126, -0.0014]}, "hard": {"FB": [-0.0063, 0.016, 0.0128, 0.0001], "SL": [-0.0356, -0.0229, 0.0166, -0.0048], "CB": [-0.0531, -0.0199, 0.0127, -0.0019], "CH": [-0.0706, -0.0218, -0.0243, -0.0104]}};
  const PT_B = {"whiff": {"FB|rides": 0.3925, "FB|runs": -0.0333, "FB|cuts": -0.0185, "FB|straight": -0.2454, "FB|": 0.0, "SI|run": -0.307, "SI|drop": -0.4105, "SI|two-seam": -0.0315, "SI|": -0.4128, "FC|hard": 0.2013, "FC|big": 0.6067, "FC|ride": 0.3573, "FC|": 0.32, "SL|gyro": 0.0284, "SL|tight": 0.0, "SL|sweeper": -0.0646, "SL|slurve": -0.1443, "SL|": 0.0, "CB|12-6": 0.0698, "CB|sweeping": 0.069, "CB|power": 0.1485, "CB|slow": 0.0877, "CB|": 0.0, "CH|fade": 0.0564, "CH|drop": 0.0807, "CH|split": 0.0665, "CH|firm": 0.0215, "CH|": 0.0}, "chase": {"FB|rides": 0.1834, "FB|runs": -0.0384, "FB|cuts": 0.1239, "FB|straight": -0.1672, "FB|": 0.0, "SI|run": 0.251, "SI|drop": 0.085, "SI|two-seam": 0.0984, "SI|": -0.0376, "FC|hard": 0.48, "FC|big": 0.6515, "FC|ride": 0.4582, "FC|": 0.5702, "SL|gyro": 0.0351, "SL|tight": 0.0, "SL|sweeper": -0.0255, "SL|slurve": -0.0368, "SL|": 0.0, "CB|12-6": 0.0318, "CB|sweeping": 0.0182, "CB|power": -0.0015, "CB|slow": 0.0432, "CB|": 0.0, "CH|fade": -0.1459, "CH|drop": -0.0724, "CH|split": -0.0651, "CH|firm": -0.0759, "CH|": 0.0}};
  const PT_FBZ_W = {"FB|rides": [-0.2524, -0.1116, -0.0142, 0.1186], "FB|runs": [0.0466, 0.0484, -0.2847, 0.294], "FB|cuts": [0.068, 0.4008, 0.1325, -0.0904], "FB|straight": [0.2204, 0.085, -0.036, -0.127], "FB|": [0.0, 0.0, 0.0, 0.0], "SI|run": [-0.1934, 0.7404, 0.2343, 0.0962], "SI|drop": [-0.1535, 0.9954, 0.2439, -0.1097], "SI|two-seam": [0.0271, 0.2791, -0.2844, 0.2056], "SI|": [0.222, 0.8249, -0.0352, -0.0042], "FC|hard": [0.098, 0.8676, -0.1092, 0.0502], "FC|big": [0.0572, 1.1182, -0.2993, 0.1373], "FC|ride": [0.1988, 1.1039, -0.1821, 0.1494], "FC|": [0.1988, 1.1039, -0.1821, 0.1494]};
  const PT_FBZ_H = {"FB|rides": [0.0084, -0.0154, 0.0185, 0.0309, 0.03, 0.0283, 0.0107, -0.0232, -0.061, 0.0078, -0.0245, -0.017], "FB|runs": [-0.0945, -0.0916, 0.0741, 0.0406, 0.0067, -0.0014, -0.0115, 0.0039, 0.06, 0.1332, -0.1261, -0.1308], "FB|cuts": [0.0782, 0.0794, -0.1229, -0.0477, 0.0212, -0.0097, 0.0039, 0.0608, -0.1912, -0.2011, 0.1805, -0.0237], "FB|straight": [-0.0205, -0.0819, -0.0216, 0.001, -0.0085, 0.0384, -0.0277, 0.0578, -0.0154, 0.0638, 0.0402, -0.135], "FB|": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "SI|run": [-0.3756, -0.3465, 0.1356, 0.0694, -0.0563, -0.0774, 0.0151, 0.0096, 0.2053, 0.1905, -0.2094, -0.284], "SI|drop": [-0.2382, -0.2403, 0.1446, 0.1179, -0.0666, -0.0593, 0.0088, -0.0319, 0.0464, 0.0595, -0.2027, -0.2669], "SI|two-seam": [-0.1534, -0.1551, 0.0024, 0.0315, -0.0581, -0.0204, -0.0013, 0.0369, 0.1611, 0.1166, -0.0843, -0.2151], "SI|": [-0.2281, -0.2647, 0.1317, 0.0591, -0.0639, -0.0486, 0.0105, 0.0293, 0.1389, 0.1562, -0.21, -0.2914], "FC|hard": [0.1602, 0.1192, -0.1267, -0.1524, 0.0401, 0.0195, -0.0072, 0.0004, -0.2743, -0.2253, 0.0638, -0.0701], "FC|big": [0.095, 0.1869, -0.2692, -0.1001, -0.0023, 0.1128, 0.076, 0.1093, -0.1662, -0.2589, -0.0862, -0.3622], "FC|ride": [0.2104, 0.1869, -0.0944, -0.1001, -0.0259, 0.0078, 0.0168, -0.0466, -0.2422, -0.2181, 0.0756, -0.1148], "FC|": [0.2104, 0.1869, -0.1607, -0.1001, 0.0101, 0.0078, -0.0394, -0.0466, -0.2422, -0.2181, 0.0756, -0.1148]};
  const PT_FBL_H = {"SI|run": [-0.0214, 0.3121, 0.3606, -0.2615, 0.0843, 0.0687], "SI|drop": [0.0087, 0.1587, 0.1247, -0.1902, 0.0341, 0.0266], "SI|two-seam": [-0.0292, 0.0443, 0.2708, -0.0976, 0.0414, -0.0026], "SI|": [-0.0221, 0.1662, 0.2247, -0.2083, 0.056, 0.0382]};
  const PT_PLAT = {"whiff": {"FB|rides": [0.0234, 0.0193, -0.0213, -0.0216], "FB|runs": [-0.2271, -0.1816, 0.1507, 0.1246], "FB|cuts": [0.2469, 0.079, -0.2343, -0.0802], "FB|straight": [0.1296, 0.0583, -0.091, -0.0421], "FB|": [0.0751, 0.0743, -0.0566, -0.0608], "SI|run": [-0.0136, 0.0272, -0.001, -0.0625], "SI|drop": [0.0598, 0.1028, -0.1147, -0.1991], "SI|two-seam": [-0.2454, -0.1905, 0.2851, 0.1795], "SI|": [-0.0577, -0.0536, 0.0693, 0.0531], "FC|hard": [0.1693, 0.0647, -0.1202, -0.0384], "FC|big": [0.0842, 0.0624, -0.1611, -0.1272], "FC|ride": [0.2639, 0.1274, -0.266, -0.1463], "FC|": [0.1322, 0.0389, -0.1279, -0.0369], "SL|gyro": [-0.0354, -0.0415, -0.0069, 0.0319], "SL|tight": [-0.0199, -0.0345, -0.0461, 0.0194], "SL|sweeper": [0.0004, 0.0293, -0.1232, -0.1227], "SL|slurve": [-0.0839, -0.0151, 0.0715, 0.0018], "SL|": [-0.0199, -0.0345, -0.0461, 0.0194], "CB|12-6": [-0.1315, -0.1098, 0.1028, 0.0879], "CB|sweeping": [0.0148, -0.0332, -0.0132, 0.0324], "CB|power": [-0.3925, -0.2068, 0.2514, 0.1387], "CB|slow": [0.0083, -0.0256, 0.0279, 0.0363], "CB|": [-0.1618, -0.1352, 0.1159, 0.1003], "CH|fade": [-0.1279, -0.0507, 0.086, 0.0544], "CH|drop": [-0.0467, 0.0396, 0.0656, 0.0106], "CH|split": [0.0737, 0.0586, 0.0114, -0.0173], "CH|firm": [-0.0233, 0.1597, 0.0591, -0.0426], "CH|": [0.0846, 0.0708, 0.0356, 0.0016]}, "hard": {"FB|rides": [0.1314, 0.1256, -0.1236, -0.1143], "FB|runs": [-0.0315, -0.167, 0.0173, 0.1225], "FB|cuts": [0.2613, 0.3993, -0.1809, -0.3272], "FB|straight": [0.1136, 0.1328, -0.0879, -0.0939], "FB|": [0.1013, 0.122, -0.0855, -0.0937], "SI|run": [-0.0338, -0.2482, 0.0828, 0.3227], "SI|drop": [-0.0987, -0.0673, 0.1397, 0.0914], "SI|two-seam": [-0.0339, -0.1076, 0.0964, 0.1367], "SI|": [-0.07, -0.1199, 0.1436, 0.1751], "FC|hard": [-0.0486, -0.1028, 0.0181, 0.0678], "FC|big": [-0.0572, -0.123, 0.1212, 0.195], "FC|ride": [-0.1611, 0.0, 0.0999, 0.0], "FC|": [-0.0586, -0.0918, 0.0541, 0.0906], "SL|gyro": [-0.0737, -0.0547, 0.1514, 0.1134], "SL|tight": [-0.0479, -0.0453, 0.1276, 0.1172], "SL|sweeper": [-0.0485, -0.0458, 0.1547, 0.1664], "SL|slurve": [0.0071, 0.0681, 0.0177, -0.059], "SL|": [-0.0479, -0.0453, 0.1276, 0.1172], "CB|12-6": [0.044, 0.0866, -0.0333, -0.0733], "CB|sweeping": [-0.0892, -0.036, 0.0814, 0.0393], "CB|power": [0.0, 0.0, 0.0, -0.0921], "CB|slow": [0.0965, 0.0685, -0.0599, -0.0623], "CB|": [0.0562, -0.0578, -0.0405, 0.019], "CH|fade": [0.4169, 0.3315, -0.0936, -0.1385], "CH|drop": [0.3227, 0.1571, -0.094, -0.0933], "CH|split": [0.0523, 0.0844, -0.0332, -0.0703], "CH|firm": [0.1676, 0.2959, -0.0582, -0.1289], "CH|": [0.1165, 0.1763, -0.0422, -0.0983]}, "cstrike": {"FB|rides": [-0.0, -0.0, 0.0, 0.0], "FB|runs": [0.0, 0.0, -0.0, -0.0], "FB|cuts": [-0.0, -0.0, 0.0, 0.0], "FB|straight": [0.0, 0.0, -0.0, -0.0], "FB|": [-0.0, 0.0, 0.0, -0.0], "SI|run": [0.0, -0.0, -0.0, 0.0], "SI|drop": [0.0, -0.0, -0.0, -0.0], "SI|two-seam": [-0.0, 0.0, -0.0, -0.0], "SI|": [0.0, -0.0, -0.0, 0.0], "FC|hard": [-0.0, -0.0, 0.0, 0.0], "FC|big": [-0.0, -0.0, 0.0, 0.0], "FC|ride": [-0.0, -0.0, 0.0, 0.0], "FC|": [-0.0, -0.0, 0.0, 0.0], "SL|gyro": [-0.0, 0.0, 0.0, -0.0], "SL|tight": [-0.0, -0.0, 0.0, 0.0], "SL|sweeper": [-0.0, -0.0, 0.0, 0.0], "SL|slurve": [-0.0, -0.0, 0.0, 0.0], "SL|": [-0.0, -0.0, 0.0, 0.0], "CB|12-6": [-0.0, -0.0, 0.0, -0.0], "CB|sweeping": [-0.0, -0.0, 0.0, 0.0], "CB|power": [-0.0, 0.0, 0.0, -0.0], "CB|slow": [-0.0, 0.0, 0.0, -0.0], "CB|": [-0.0, 0.0, 0.0, -0.0], "CH|fade": [0.0, 0.0, 0.0, -0.0], "CH|drop": [0.0, 0.0, -0.0, -0.0], "CH|split": [-0.0, 0.0, 0.0, -0.0], "CH|firm": [0.0, 0.0, -0.0, -0.0], "CH|": [0.0, 0.0, 0.0, -0.0]}};
  const PT_CHASE_OPP = {"FB": [0.0, 0.0052, 0.0145], "SL": [-0.0401, 0.0263, -0.006], "CB": [0.0, 0.0307, -0.0099], "CH": [-0.0441, 0.0193, 0.0069]};
  const PT_CHASE_MEAN = {"FB": -0.0074, "OS": 0.0072};
  const GB_PROFILE = {"FB|rides": 0.2497, "FB|runs": 0.3661, "FB|cuts": 0.4177, "FB|straight": 0.4136, "FB|": 0.3287, "SI|run": 0.5739, "SI|drop": 0.6483, "SI|two-seam": 0.4275, "SI|": 0.5492, "FC|hard": 0.4309, "FC|big": 0.389, "FC|ride": 0.3522, "FC|": 0.4187, "SL|gyro": 0.4352, "SL|tight": 0.4168, "SL|sweeper": 0.3617, "SL|slurve": 0.4629, "SL|": 0.4168, "CB|12-6": 0.5246, "CB|sweeping": 0.4206, "CB|power": 0.5735, "CB|slow": 0.4504, "CB|": 0.5139, "CH|fade": 0.4601, "CH|drop": 0.5529, "CH|split": 0.5386, "CH|firm": 0.5695, "CH|": 0.4805};
  const SLOT_ANGLE = {"sidearm": 14.8, "low three-quarter": 29.5, "three-quarter": 40.0, "high three-quarter": 48.9, "over the top": 58.6, "submarine": 0.0};
  const PT_FB_IVB = 16.2;
  const SLOT_MOVE = {"FB": [0.0801, -0.0686, 41.5], "SI": [0.0891, -0.0103, 33.3], "FC": [0.0295, -0.0679, 39.8], "SL": [-0.0495, 0.0129, 37.4], "CB": [-0.088, 0.0543, 44.7], "CH": [0.1969, -0.112, 37.8]};
  // --- end PROFILE_TERMS ---
  const BASE_FB_MPH = 85.0, PROFILE_LEVEL = "college_d3";
  const PROFILE_NAMES = { "Two-seam": "two-seam", Sweeper: "sweeper", Slurve: "slurve", Splitter: "split", Forkball: "split", "12-6 curve": "12-6" };
  // v1.3 (plan 3.5): college D2 uses D3's profiles until profiles_fit.py has D2 rows (engine.py _fill_d2_placeholders)
  PROFILES.college_d2 = PROFILES.college_d3; MOVE_RATIO.college_d2 = MOVE_RATIO.college_d3;   // PLACEHOLDER_D2
  function profile(kind, shape, level) {
    const tab = PROFILES[level || PROFILE_LEVEL] || PROFILES[PROFILE_LEVEL];
    return tab[kind + "|" + (shape || "")] || tab[kind + "|"];
  }
  const defaultMph = (kind, shape) => Math.round((BASE_FB_MPH - profile(kind, shape || "", PROFILE_LEVEL)[0]) * 10) / 10;
  // v1.1 Step 1: six kinds; fastball class = FB, SI, FC (mirror of engine.py is_fastball / pclass / key_kind)
  const FASTBALL_KINDS = ["FB", "SI", "FC"];
  const isFastball = (k) => FASTBALL_KINDS.includes(k);
  const pclass = (k) => (FASTBALL_KINDS.includes(k) ? "FB" : "OS");
  const keyKind = (k) => (FASTBALL_KINDS.includes(k) ? "FB" : k);
  // v1.1 Step 1: the one migration table (mirror of engine.py MIGRATE_BY_TYPE / MIGRATE_BY_TAG); idempotent
  const MIGRATE_BY_TYPE = {
    "Four-seam": ["FB", "rides"], "Two-seam": ["SI", "two-seam"], "Sinker": ["SI", "run"], "Cutter": ["FC", ""],
    "Slider": ["SL", "tight"], "Sweeper": ["SL", "sweeper"], "Slurve": ["SL", "slurve"], "Curveball": ["CB", ""],
    "Knuckle curve": ["CB", ""], "12-6 curve": ["CB", "12-6"], "Changeup": ["CH", "fade"],
    "Splitter": ["CH", "split"], "Forkball": ["CH", "split"],
  };
  // the v1.0 kind and tag each type was stored with: a type migrates a pitch only while it still carries exactly these
  const V10_TYPE_TAGS = {
    "Four-seam": ["FB", "ride"], "Two-seam": ["FB", "run"], "Sinker": ["FB", "sink"], "Cutter": ["FB", "cut"],
    "Slider": ["SL", "tight"], "Sweeper": ["SL", "sweeper"], "Slurve": ["SL", ""], "Curveball": ["CB", "loopy"],
    "Knuckle curve": ["CB", "sharp"], "12-6 curve": ["CB", "sharp"], "Changeup": ["CH", "fade"],
    "Splitter": ["CH", "drop"], "Forkball": ["CH", "drop"],
  };
  const MIGRATE_BY_TAG = { "FB|ride": ["FB", "rides"], "FB|run": ["FB", "runs"], "FB|cut": ["FB", "cuts"],
    "FB|sink": ["SI", "run"], "CB|loopy": ["CB", "slow"], "CB|sharp": ["CB", "power"],
    // a v1.0 fastball tag that reaches a v1.1 sinker or cutter (an old portal proposal) maps to that kind's nearest tag
    "SI|sink": ["SI", "run"], "SI|ride": ["SI", "two-seam"], "SI|cut": ["SI", ""], "FC|cut": ["FC", ""], "FC|run": ["FC", ""], "FC|sink": ["FC", ""] };
  const SHAPE_TAGS = { FB: ["rides", "runs", "cuts", "straight", ""], SI: ["run", "drop", "two-seam", ""],
    FC: ["hard", "big", "ride", ""], SL: ["gyro", "tight", "sweeper", "slurve", ""],
    CB: ["12-6", "sweeping", "power", "slow", ""], CH: ["fade", "drop", "split", "firm", ""] };
  function migratePitch(kind, shape, type) {
    shape = shape || "";
    if (type && Object.prototype.hasOwnProperty.call(MIGRATE_BY_TYPE, type) && V10_TYPE_TAGS[type][0] === kind && V10_TYPE_TAGS[type][1] === shape) return MIGRATE_BY_TYPE[type].slice();
    const m = MIGRATE_BY_TAG[kind + "|" + shape];
    return m ? m.slice() : [kind, shape];
  }
  const SLOTS = { "over the top": [1.05, 1.0], "high three-quarter": [0.95, 1.6], "three-quarter": [0.88, 2.0],
    "low three-quarter": [0.78, 2.5], "sidearm": [0.62, 3.0], "submarine": [0.35, 3.2] };
  const FLIGHT_FT = 54.0, DECISION_S = 0.175, G_IN = 32.17 * 12;

  // One engine, v0.9 (Drew, Nov 6): no flags. Same logic as engine.py; golden/golden_v09.js checks both against one reference.

  const VERSION = "1.2.3";    // engine logic version (v1.2.3, Nov 14: umpire prior 200 takes; v1.2.2, Nov 14: confidence band under the cutoff; v1.2.1, Nov 14: second shake-off is a hard switch; v1.2, Nov 14; was "1.0" through v1.1; the saved setup label stays "v09"); the tables carry their own fingerprint (data.version)
  function init(data) {
    D = data;
    // v0.7c travel ball (Drew): uses the high school numbers until there's travel-ball data of its own
    for (const t of [D.RE, D.CV, D.OUTCOME_ADJ, D.LW, D.LEVEL]) if (t && t.hs && !t.travel) t.travel = t.hs;
    if (D.TABLES) initTables(D.TABLES);   // v1.3 Part 2: zone table and count layer
    if (D.V08) initV08(D.V08);
  }
  const dataVersion = () => (D && D.version) || null;

  // ---------------------------------------------------------------- objects
  function Pitch(o) {
    const p = Object.assign({ shape: "", velo: 0, base_conf: -1, ivb: null, hb: null, slot: "three-quarter",
      height_ft: 6.1, release_offset_in: [0, 0], strike_rate: null, strike_ref: null, traits: null }, o);
    if (p.base_conf < 0) p.base_conf = p.conf;
    [p.kind, p.shape] = migratePitch(p.kind, p.shape, p.type);   // v1.1 Step 1: the one migration point
    return p;
  }
  function Situation(o) {
    return Object.assign({ inning: 1, margin: 0, pitch_count: 0, batters_faced: 0, level: "college_d3",
      same_side: true, last: null, hitter_seen: {}, usage_this_count: {}, timing: {}, hitter_damage: {},
      catcher_block: 3, landing_today: {}, wild_true: {},
      // v0.8 inputs (inert at their defaults, so v0.7c callers are unchanged)
      sit_sigma: null, look: null, familiar: {}, crowding: false, grades: null, ump_u: 0.0, radar: {}, infield_in: false,
      win: null, usage_by_call: {}, b_h: {}, steal: null, pitch_cap: 105, home: null, sched_innings: null, extras_runner: false,
      matchup: {}, since_thrown: {}, pa_log: [] }, o);   // v1.2 Part B: hitter_tags stays absent unless set (engine.py), so snapshots don't change   // v0.9 item 6; v1.1 since_thrown: his pitches since he last threw each pitch today
  }
  const replace = (s, o) => Object.assign({}, s, o);
  // v1.1 Step 1b: a pitch with no speed is his main fastball's entered speed less the profile's gap (resolveSpeeds sets
  // fb_mph); with no fastball speed entered, the default fastball (85) less the gap
  const mph = (p) => p.velo || (p.fb_mph ? Math.round((p.fb_mph - profile(p.kind, p.shape || "", PROFILE_LEVEL)[0]) * 10) / 10 : defaultMph(p.kind, p.shape));

  // ---------------------------------------------------------------- state values
  const basesKey = (b) => (b[0] ? "1" : "0") + (b[1] ? "2" : "0") + (b[2] ? "3" : "0");
  const re = (outs, bases, level) => (outs >= 3 ? 0.0 : D.RE[level][outs + "|" + basesKey(bases)]);
  // v1.3 (Drew's ruling 10): the denominator is pinned at v1.2's MLB RE[0|000] = 0.481, not the refit table's value, until
  // college run values exist; after that college levels take no scale from MLB (engine.py RUN_SCALE_MLB_RE00)
  const RUN_SCALE_MLB_RE00 = 0.481;
  // v1.3 full data (ruling 10 takes effect): college levels' run values are fit on their own play-by-play, so they take
  // no scale from MLB (run scale 1); the pin stays for MLB and HS / travel (engine.py RUN_SCALE_OWN)
  const RUN_SCALE_OWN = ["college", "college_d1", "college_d2", "college_d3"];
  const runScale = (level) => (RUN_SCALE_OWN.includes(level) ? 1.0 : D.RE[level]["0|000"] / RUN_SCALE_MLB_RE00);
  const cvKey = (b, k) => b + "-" + k;

  // ---------------------------------------------------------------- confidence
  function updateConfidence(p, event) {
    let d = CONF_DELTA[event];
    if (event === "whiff" && isFastball(p.kind)) d += 0.02;
    // v0.7: news measured against his usual strike rate; v1.0 Step 3: the average pitcher's rate (strike_ref) comes from
    // the same model as his, served with it by the learner (LAND_CENTER is gone)
    if (p.strike_rate !== null && p.strike_rate !== undefined && p.strike_ref !== null && p.strike_ref !== undefined) {
      const c = Math.min(0.95, Math.max(0.05, p.strike_ref)), q = Math.min(0.95, Math.max(0.05, p.strike_rate));
      if (event === "ball") d *= (1 - c) / (1 - q);
      else if (event === "cstrike" || event === "whiff") d *= c / q;
    }
    p.conf = Math.max(0.0, Math.min(p.base_conf + CONF_CAP_ABOVE, 1.0, p.conf + d));
  }
  function regressConfidence(p) { p.conf += CONF_REGRESS * (p.base_conf - p.conf); }

  // ---------------------------------------------------------------- helpers
  function logit(p) { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(p / (1 - p)); }
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const isOffspeed = (k) => k === "SL" || k === "CB" || k === "CH";
  // v1.0 #8: "late" = the last three innings of the scheduled game (sched is defined with the WE blend below)
  const isBigSpot = (s) => s.inning >= sched(s) - 2 && Math.abs(s.margin) <= 2 && (s.bases[1] || s.bases[2]);
  const anyBase = (b) => b[0] || b[1] || b[2];

  // ---------------------------------------------------------------- landing today (v0.6d; v1.0 Step 3 one anchor)
  // record per pitch: [strikes, expected strikes, pitches], non-chase targets only (engine.py landing_estimate)
  const LAND_K = 20.0, LAND_GAIN = 1.8, LAND_MAX = 0.6, LAND_SHARP_MAX = 0.3;   // two-sided (Drew, Nov 10, D1); K and GAIN fitted (v1.0 Step 5)
  const DMG_SCALE = 3.0;   // v0.6e: a strong masher is worth ~+0.03 runs per pitch, like the best real fastball hitters
  function expectedStrike(p, q, s, arsenal) {
    const P = outcomeProbs(p, q, Object.assign({}, s, { landing_today: {}, wild_true: {} }), arsenal);
    return 1.0 - P.ball - P.wp_ball - P.hbp;
  }
  function landingRecord(rec, strike, expected) {
    const [st, ex, n] = rec || [0, 0.0, 0];
    return [st + (strike ? 1 : 0), ex + expected, n + 1];
  }
  // a pre-v1.0 [strikes, pitches] pair is read once as expected = pitches x the old typical rate (engine.py landing_triple)
  const LEGACY_LAND_RATE = { FB: 0.66, OS: 0.58 };
  function landingTriple(p, rec) {
    if (rec && rec.length === 2) return [rec[0], rec[1] * LEGACY_LAND_RATE[isOffspeed(p.kind) ? "OS" : "FB"], rec[1]];
    return rec;
  }
  function landingEstimate(p, s) {
    const ev = s.landing_today ? landingTriple(p, s.landing_today[p.name]) : null;
    if (!ev || !ev[ev.length - 1]) return [0.0, null, 0];
    const [st, ex, n] = ev;
    return [(st - ex) / (LAND_K + n), ex / n, n];
  }
  function wildToday(p, s) {
    if (s.wild_true && Object.keys(s.wild_true).length) return s.wild_true[p.name] || 0.0;
    const [est, , n] = landingEstimate(p, s);
    return n ? Math.max(-LAND_SHARP_MAX, Math.min(LAND_MAX, -LAND_GAIN * est)) : 0.0;   // < 0: sharper than normal today
  }
  // v1.0 Step 3: a ball on a chase target is no confidence debit unless it went way off (engine.py ball_conf_event)
  const ballConfEvent = (q, loc) => (q === "chase" && loc !== "noncomp" ? null : "ball");

  // ---------------------------------------------------------------- landing
  // v0.7 personal traits (see engine.py TRAIT_KEYS); absent = the default engine
  const TRAIT_KEYS = ["side_cmd", "side_grade", "ahead_cmd", "behind_cmd", "stretch_cmd", "miss_heart"];
  function effective(p, s) {
    const t = p.traits;
    if (!t) return [p.command, p.grade];
    const side = s.same_side ? 0.5 : -0.5, g = (k) => t[k] || 0.0;
    let cmd = p.command + side * g("side_cmd") + g("stretch_cmd") * ((s.bases[0] || s.bases[1] || s.bases[2]) ? 1.0 : 0.0);
    if (s.strikes > s.balls) cmd += g("ahead_cmd");
    else if (s.balls > s.strikes) cmd += g("behind_cmd");
    return [cmd, p.grade + side * g("side_grade")];
  }

  // ---------------------------------------------------------------- v1.2 location model (engine.py, plan 2.2-2.3)
  // At lean 0 / spread 1 nothing here runs. Otherwise a 2-D normal miss model (inches, batter frame) gives the difference
  // the lean makes; its size is solved per call from landing()'s own pre-floor shares.
  const LEAN_MAX = 6.0, SPREAD_MIN = 0.5, SPREAD_MAX = 2.0;
  const GEO_HEART = [6.7, 8.04], GEO_ZONE = [13.3, 15.96], GEO_EXT = [20.0, 24.0];   // Savant attack zones (engine.py)
  const GEO_Q = { "up-in": [20.0 / 3.0, 8.0], "up-away": [-20.0 / 3.0, 8.0], "down-in": [20.0 / 3.0, -8.0],
    "down-away": [-20.0 / 3.0, -8.0], middle: [0.0, 0.0], "down-middle": [0.0, -8.0] };
  const GEO_DOWN = ["down-in", "down-away", "down-middle"];
  const GEO_HBP_BANDS = [[12.0, 0.00359], [15.0, 0.0142], [18.0, 0.0401], [21.0, 0.0987], [24.0, 0.196], [27.0, 0.33], [30.0, 0.521]];
  function geoNcdf(x) {   // Abramowitz & Stegun 7.1.26, written as in engine.py
    const z = Math.abs(x) / 1.4142135623730951;
    const t = 1.0 / (1.0 + 0.3275911 * z);
    const y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? 0.5 * (1.0 + y) : 0.5 * (1.0 - y);
  }
  const geoIn = (m, sd, a) => geoNcdf((a - m) / sd) - geoNcdf((-a - m) / sd);
  function geoShares(mx, mz, sx, sz) {
    const h = geoIn(mx, sx, GEO_HEART[0]) * geoIn(mz, sz, GEO_HEART[1]);
    const zn = geoIn(mx, sx, GEO_ZONE[0]) * geoIn(mz, sz, GEO_ZONE[1]);
    const e = geoIn(mx, sx, GEO_EXT[0]) * geoIn(mz, sz, GEO_EXT[1]);
    return { heart: h, edge: zn - h, off: e - zn, noncomp: 1.0 - e };
  }
  const geoTarget = (p, q) => (q === "chase" ? [0.0, isOffspeed(p.kind) ? -18.0 : 18.0] : GEO_Q[q]);
  function geoSigma(mx, mz, ext) {
    ext = Math.min(0.999, Math.max(0.05, ext));
    let lo = 0.25, hi = 120.0;
    for (let i = 0; i < 48; i++) {
      const mid = 0.5 * (lo + hi);
      if (geoIn(mx, mid, GEO_EXT[0]) * geoIn(mz, mid, GEO_EXT[1]) > ext) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  const hasLean = (p) => !!(p.lean_x || p.lean_z) || (p.spread !== undefined && p.spread !== null && p.spread !== 1.0);
  const spreadOf = (p) => (p.spread === undefined || p.spread === null ? 1.0 : p.spread);
  function leanGeometry(p, q, s, zPre) {
    const [mx, mz] = geoTarget(p, q);
    const lx = s.same_side ? (p.lean_x || 0.0) : -(p.lean_x || 0.0);
    return [mx, mz, lx, p.lean_z || 0.0, geoSigma(mx, mz, 1.0 - zPre.noncomp), spreadOf(p)];
  }
  function leanDelta(p, q, s, zPre) {
    const [mx, mz, lx, lz, sd, sp] = leanGeometry(p, q, s, zPre);
    const a = geoShares(mx + lx, mz + lz, sd * sp, sd * sp), b = geoShares(mx, mz, sd, sd);
    const out = {}; for (const k of ZONES) out[k] = a[k] - b[k];
    if (s.strikes === 2 && lz > 0 && mz > 0 && out.noncomp > 0) { out.off += out.noncomp; out.noncomp = 0.0; }   // v1.2 L5 (engine.py)
    return out;
  }
  function geoHbpWeight(mx, sd) {
    let w = 0.0;
    for (let i = 0; i < GEO_HBP_BANDS.length; i++) {
      const [x0, h] = GEO_HBP_BANDS[i];
      const top = i + 1 < GEO_HBP_BANDS.length ? geoNcdf((GEO_HBP_BANDS[i + 1][0] - mx) / sd) : 1.0;
      w += h * (top - geoNcdf((x0 - mx) / sd));
    }
    return w;
  }
  function leanHbpWp(p, q, s) {
    if (!hasLean(p)) return [1.0, 1.0];
    const [mx, mz, lx, lz, sd, sp] = leanGeometry(p, q, s, landingPre(p, q, s));
    const s1 = sd * sp;
    const n0 = geoShares(mx, mz, sd, sd).noncomp, n1 = geoShares(mx + lx, mz + lz, s1, s1).noncomp;
    const b0 = geoHbpWeight(mx, sd), b1 = geoHbpWeight(mx + lx, s1);
    const rh = (b0 > 1e-12 && n0 > 1e-9 && n1 > 1e-9) ? (b1 / n1) / (b0 / n0) : 1.0;
    let rw = 1.0;
    if ((GEO_DOWN.includes(q) || (q === "chase" && isOffspeed(p.kind))) && lz < 0) {
      const d0 = geoNcdf((-GEO_EXT[1] - mz) / sd), d1 = geoNcdf((-GEO_EXT[1] - mz - lz) / s1);
      rw = (d0 > 1e-12 && n0 > 1e-9 && n1 > 1e-9) ? (d1 / n1) / (d0 / n0) : 1.0;
    }
    return [rh, rw];
  }

  function landing(p, q, s) {
    let z = landingPre(p, q, s);
    if (hasLean(p)) { const dz = leanDelta(p, q, s, z); const z2 = {}; for (const k of ZONES) z2[k] = z[k] + dz[k]; z = z2; }
    for (const k of ZONES) z[k] = Math.max(z[k], 0.01);
    let t = 0; for (const k of ZONES) t += z[k];
    const out = {}; for (const k of ZONES) out[k] = z[k] / t;
    return out;
  }

  function landingPre(p, q, s) {   // landing()'s shares before its final floor and divide (v1.2 split; v1.1's arithmetic)
    const A = D.OUTCOME_ADJ[s.level];
    const [command] = effective(p, s);
    const sc = D.LEVEL[s.level].cmd_scale ?? 1.0;   // v0.7 spread calibration (engine.py)
    const d = sc === 1.0 ? Math.min(5, Math.max(1, command + A.cmd + 2.0 * (p.conf - 0.6))) - 3   // the v0.6 formula exactly
      : Math.min(8.0, Math.max(-8.0, sc * (command - 3) + A.cmd + 2.0 * (p.conf - 0.6)));
    let z0, sl, z;
    if (q === "chase") { z0 = { heart: 0.05, edge: 0.24, off: 0.57, noncomp: 0.14 }; sl = { heart: -0.01, edge: 0.0, off: 0.04, noncomp: -0.03 }; }
    else if (q === "middle") { z0 = { heart: 0.50, edge: 0.30, off: 0.13, noncomp: 0.07 }; sl = { heart: 0.03, edge: 0.0, off: -0.02, noncomp: -0.01 }; }
    else if (q === "down-middle") { z0 = { heart: 0.38, edge: 0.36, off: 0.175, noncomp: 0.085 }; sl = { heart: 0.0, edge: 0.04, off: -0.025, noncomp: -0.015 }; }   // v1.0 Step 7
    else { z0 = { heart: 0.26, edge: 0.42, off: 0.22, noncomp: 0.10 }; sl = { heart: -0.03, edge: 0.08, off: -0.03, noncomp: -0.02 }; }
    if (sc === 1.0) {   // the v0.6 straight-line shares, exactly
      z = {}; for (const k of ZONES) z[k] = z0[k] + sl[k] * d;
      if (isOffspeed(p.kind)) { z.edge -= 0.12; z.off += 0.07; z.noncomp += 0.05; }
    } else {            // v0.7: exponential shares, same first-order change around an average pitcher (engine.py)
      if (isOffspeed(p.kind)) z0 = { heart: z0.heart, edge: z0.edge - 0.12, off: z0.off + 0.07, noncomp: z0.noncomp + 0.05 };
      const w = {}; let t = 0; for (const k of ZONES) { w[k] = z0[k] * Math.exp(sl[k] / z0[k] * d); t += w[k]; }
      z = {}; for (const k of ZONES) z[k] = w[k] / t;
    }
    let mhT = p.traits ? p.traits.miss_heart || 0.0 : 0.0;
    if (mhT) {   // v0.7: where his misses go, beyond what command says
      mhT = Math.min(1.0, Math.max(-1.0, mhT));
      if (mhT > 0) { const m = 0.3 * mhT * z.off; z.off -= m; z.heart += m; }
      else { const m = 0.3 * -mhT * z.heart; z.heart -= m; z.off += m; }
    }
    const w = A.wild;
    if (w) {
      const mh = w * z.heart, me = w * z.edge;
      z.heart -= mh; z.edge -= me; z.off += 0.6 * (mh + me); z.noncomp += 0.4 * (mh + me);
    }
    let wt = wildToday(p, s);
    if (wt < 0 && q === "chase") wt = 0.0;   // v1.0 review (Drew, Nov 11): no sharpening on a chase target (engine.py)
    if (wt) {   // v0.6e: misses go both ways
      const me = wt * z.edge, mh = 0.6 * wt * z.heart;
      z.edge += 0.6 * mh - me; z.heart += 0.30 * me - mh; z.off += 0.45 * me + 0.4 * mh; z.noncomp += 0.25 * me;
    }
    const over = s.pitch_count - D.LEVEL[s.level].fatigue;
    if (over > 0) { const shift = Math.min(z.edge - 0.05, 0.02 * over / 10); z.edge -= shift; z.heart += shift; }
    return z;
  }


  // ---------------------------------------------------------------- tunneling
  function movement(p, level) {   // measured when entered, else the profile's typical movement at his level and slot
    const base = profile(p.kind, p.shape, level);
    let ivb = base[1], hb = base[2];
    if (p.kind in SLOT_MOVE && !p.shape) {   // v1.1 Step 2 (E10): mirror of engine.py movement's slot adjustment (typical tag only)
      const [si, sh, ref] = SLOT_MOVE[p.kind];
      const da = (SLOT_ANGLE[p.slot] ?? SLOT_ANGLE["three-quarter"]) - ref, r = MOVE_RATIO[level || PROFILE_LEVEL] ?? 1.0;
      ivb = ivb + r * si * da; hb = hb + r * sh * da;
    }
    return [p.ivb !== null && p.ivb !== undefined ? p.ivb : ivb, p.hb !== null && p.hb !== undefined ? p.hb : hb];
  }
  const flightTime = (p) => FLIGHT_FT / (mph(p) * 1.4667 * 0.92);
  function targetXY(q, sameSide, offspeed) {
    const inside = sameSide ? 1 : -1;
    switch (q) {
      case "up-in": return [7 * inside, 38];
      case "up-away": return [-7 * inside, 38];
      case "down-in": return [7 * inside, 22];
      case "down-away": return [-7 * inside, 22];
      case "middle": return [0, 30];
      case "down-middle": return [0, 22];
      default: return offspeed ? [-10 * inside, 14] : [0, 46];
    }
  }
  function pathAt(p, q, sameSide, secs, level) {
    const tf = flightTime(p);
    const u = Math.max(0.0, 1 - secs / tf);
    const sl = SLOTS[p.slot] || SLOTS["three-quarter"];
    const rx = sl[1] * 12 + p.release_offset_in[0];
    const rz = sl[0] * p.height_ft * 12 + p.release_offset_in[1];
    const [ivb, hb] = movement(p, level);
    const mx = hb, mz = ivb - 0.5 * G_IN * tf ** 2;
    const [tx, tz] = targetXY(q, sameSide, isOffspeed(p.kind));
    const ax = tx - mx, az = tz - mz;
    return [rx + (ax - rx) * u + mx * u * u, rz + (az - rz) * u + mz * u * u];
  }
  function remainingBreak(p, secs, level) {
    const tf = flightTime(p);
    const u = Math.max(0.0, 1 - secs / tf);
    const [ivb, hb] = movement(p, level);
    const mx = hb, mz = ivb - 0.5 * G_IN * tf ** 2;
    return [mx * (1 - u * u), mz * (1 - u * u)];
  }
  function tunnelScore(p1, q1, p2, q2, sameSide, level) {
    const a1 = pathAt(p1, q1, sameSide, DECISION_S, level), a2 = pathAt(p2, q2, sameSide, DECISION_S, level);
    const b1 = pathAt(p1, q1, sameSide, 0.0, level), b2 = pathAt(p2, q2, sameSide, 0.0, level);
    const r1 = remainingBreak(p1, DECISION_S, level), r2 = remainingBreak(p2, DECISION_S, level);
    const dT = ((a1[0] - a2[0]) ** 2 + (a1[1] - a2[1]) ** 2) ** 0.5;
    const dP = ((b1[0] - b2[0]) ** 2 + (b1[1] - b2[1]) ** 2) ** 0.5;
    const dB = ((r1[0] - r2[0]) ** 2 + (r1[1] - r2[1]) ** 2) ** 0.5;
    const dR = ((p1.release_offset_in[0] - p2.release_offset_in[0]) ** 2 + (p1.release_offset_in[1] - p2.release_offset_in[1]) ** 2) ** 0.5;
    const score = 0.6 * Math.min(dB, 18) / 18 + 0.4 * Math.min(dP, 24) / 24 - dT / 10 - dR / 8;
    return [Math.max(-1.0, Math.min(1.0, score)), dT, dB, dP];
  }


  // v1.1 (plan 2.1/2.2): main fastball, shape relative to it, and the tag for a measured pitch (mirror of engine.py)
  function primaryFb(arsenal) {
    for (const x of arsenal) if (x.main) return x;
    for (const k of FASTBALL_KINDS) for (const x of arsenal) if (x.kind === k) return x;
    const own = (x) => x.velo || defaultMph(x.kind, x.shape);
    return arsenal.reduce((a, b) => (own(b) > own(a) ? b : a));
  }
  function resolveSpeeds(arsenal) {   // mirror of engine.py resolve_speeds
    const fb = arsenal && arsenal.length ? primaryFb(arsenal) : null, v = fb && fb.velo ? +fb.velo : 0;
    for (const x of arsenal) x.fb_mph = v;
    return arsenal;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  function relShape(p, arsenal, level) {
    const fb = primaryFb(arsenal), [ivb, hb] = movement(p, level);
    return [r3(mph(fb) - mph(p)), r3(ivb - movement(fb, level)[0]), hb];
  }
  function tagFor(kind, ivb, hb, v, fbMph, fbIvb, fbHb, level, type) {
    if (type && Object.prototype.hasOwnProperty.call(PROFILE_NAMES, type) && MIGRATE_BY_TYPE[type] && MIGRATE_BY_TYPE[type][0] === kind) return PROFILE_NAMES[type];
    const lv = level || PROFILE_LEVEL, t = PROFILE_T, r = MOVE_RATIO[lv] ?? 1.0;
    const [, ti, th] = profile(kind, "", lv);
    const dmph = fbMph - v, divb = ivb - fbIvb, dhb = hb - fbHb;
    if (kind === "FB") {
      if (ivb >= ti + t.fb_rides_ivb * r) return "rides";
      if (hb >= th + t.fb_runs_hb * r) return "runs";
      if (hb <= th + t.fb_cuts_hb * r) return "cuts";
      if (ivb <= ti + t.fb_straight_ivb * r && Math.abs(hb - th) <= t.fb_straight_hb * r) return "straight";
    } else if (kind === "SI") {
      if (ivb >= ti + t.si_twoseam_ivb * r) return "two-seam";
      if (ivb <= ti + t.si_drop_ivb * r) return "drop";
      if (hb >= th + t.si_run_hb * r) return "run";
    } else if (kind === "FC") {
      if (hb <= t.fc_big_hb * r || dmph >= t.fc_big_dmph) return "big";
      if (dmph <= t.fc_hard_dmph && hb >= t.fc_hard_hb * r) return "hard";
      if (ivb >= ti + t.fc_ride_ivb * r) return "ride";
    } else if (kind === "SL") {
      if (hb <= t.sl_sweeper_hb * r) return "sweeper";
      if (ivb <= t.sl_slurve_ivb * r && hb <= t.sl_slurve_hb * r) return "slurve";
      if (Math.abs(hb) <= t.sl_gyro_abshb * r) return "gyro";
      return "tight";
    } else if (kind === "CB") {
      const drop = -ivb;
      if (drop >= 2 * Math.abs(hb)) return "12-6";
      if (Math.abs(hb) >= drop) return "sweeping";
      if (dmph <= t.cb_power_dmph) return "power";
      if (dmph >= t.cb_slow_dmph) return "slow";
    } else if (kind === "CH") {
      if (dmph <= t.ch_firm_dmph) return "firm";
      if (divb <= t.ch_split_divb * r && Math.abs(dhb) <= t.ch_split_dhb * r) return "split";
      if (divb <= t.ch_drop_divb * r) return "drop";
      if (dhb >= t.ch_fade_dhb * r) return "fade";
    }
    return "";
  }

  // KIND_W_OS: v1.0's off-speed class whiff weights, from the zone table's "class" terms (initTables)
  function classTerms(p, q, s) {   // mirror of engine.py class_terms (v1.0's hand class values, read from the zone table)
    if (isFastball(p.kind)) return { whiff: 0.0, chase: { off: 0.0, noncomp: 0.0 }, cstrike: 0.0, hard: 0.0 };
    const zc = ZCLASS, up = q.startsWith("up"), f = (!up || q === "chase") ? zc.line_low : zc.line_up;
    return { whiff: (KIND_W_OS[p.kind] - W_FB) + zc.line_whiff * f, chase: zc.chase_os, cstrike: 0.0,
      hard: zc.line_hard * f + ((up || q === "middle") ? zc.up_mid_hard : 0.0) };
  }
  function ptKey(p) {   // the (kind, tag) key of the profile tables (mirror of engine.py pt_key)
    const k = p.kind + "|" + (p.shape || "");
    return k in GB_PROFILE ? k : p.kind + "|";
  }
  const PT_REF_MEMO = {};
  function ptRef(c, level) {   // the typical pitch of class c at this level, 3/4 slot (mirror of engine.py pt_ref)
    const k = c + "|" + level;
    if (!(k in PT_REF_MEMO)) {
      const r = MOVE_RATIO[level || PROFILE_LEVEL] ?? 1.0;
      const dm = profile(c, "", level)[0];
      const [ivb, hb] = movement({ kind: c, shape: "", slot: "three-quarter" }, level);
      const fbi = movement({ kind: "FB", shape: "", slot: "three-quarter" }, level)[0];
      const vert = c === "FB" ? ivb / r - PT_FB_IVB : (ivb - fbi) / r;
      PT_REF_MEMO[k] = [dm, vert, hb / r, SLOT_ANGLE["three-quarter"]];
    }
    return PT_REF_MEMO[k];
  }
  function profileTerms(p, q, s, arsenal) {   // v1.1 Step 2 (mirror of engine.py profile_terms)
    const lv = s.level, r = MOVE_RATIO[lv] ?? 1.0;
    const fbc = isFastball(p.kind), c = fbc ? "FB" : p.kind;
    const fb = primaryFb(arsenal);
    const [ivb, hb] = movement(p, lv);
    const vert = fbc ? ivb / r - PT_FB_IVB : (ivb - movement(fb, lv)[0]) / r;
    const x = [mph(fb) - mph(p), vert, hb / r, SLOT_ANGLE[p.slot] ?? SLOT_ANGLE["three-quarter"]];
    const ref = ptRef(c, lv), key = ptKey(p), t = {};
    for (const tgt of ["whiff", "chase", "cstrike", "hard"]) {
      const b = PT_C[tgt][c];
      let v = b[0] * (x[0] - ref[0]) + b[1] * (x[1] - ref[1]) + b[2] * (x[2] - ref[2]) + b[3] * (x[3] - ref[3]);
      if (tgt in PT_B) v += PT_B[tgt][key];
      t[tgt] = v;
    }
    const side = s.same_side ? 0 : 1, ss = 2 * side + (s.strikes === 2 ? 1 : 0);
    if (fbc) {
      const h = (q.startsWith("up") || q === "chase") ? "up" : (q.startsWith("down") ? "down" : "mid");
      const zw = PT_FBZ_W[key];
      t.whiff += (h === "up" ? zw[0] : (h === "down" ? zw[1] : 0.0)) + (q.endsWith("-in") ? zw[2 + side] : 0.0);
      if (key in PT_FBZ_H) t.hard += PT_FBZ_H[key][4 * ["up", "mid", "down"].indexOf(h) + ss];
      // v1.1 Step 4 (Drew): the target is where it crosses; hard contact by that lane. Chase has no lane.
      const ln = q.endsWith("-in") ? "in" : (q.endsWith("-away") ? "away" : ((q === "middle" || q === "down-middle") ? "mid" : null));
      if (ln && key in PT_FBL_H) t.hard += PT_FBL_H[key][2 * ["in", "away", "mid"].indexOf(ln) + side];
    }
    for (const tgt of ["whiff", "hard", "chase", "cstrike"]) if (tgt in PT_PLAT) t[tgt] += PT_PLAT[tgt][key][ss];
    if (!s.same_side) {
      const co = PT_CHASE_OPP[c];
      t.chase += co[0] + co[1] * x[2] + co[2] * x[1] - PT_CHASE_MEAN[pclass(p.kind)];
    }
    const rho = RHO_L[lv] ?? 1.0;
    for (const k of Object.keys(t)) t[k] = rho * t[k];
    return t;
  }

  // v1.2 Part B: hitter tags (mirror of engine.py HIT_FIT / HIT_PATH_RULE / HIT_OS_PRIOR; see the fits there)
  const HIT_FIT = { approach: 0.224 };   // spray dropped (Drew, Nov 13; engine.py)
  const HIT_PATH_RULE = 0.003, HIT_OS_PRIOR = 0.3, HIT_OS_N0 = 3.0;
  const HIT_TAG_VALUES = { approach: { aggressive: 1, patient: -1 }, path: { lift: 1, flat: -1 }, offspeed: { hits: 1 } };
  const hitTag = (s, key) => (s && s.hitter_tags ? (HIT_TAG_VALUES[key][s.hitter_tags[key]] || 0) : 0);
  const isEarly = (s) => (s.balls === 0 && s.strikes === 0) || (s.balls === 1 && s.strikes === 0) || (s.balls === 0 && s.strikes === 1);
  function damage(p, q, s) {
    let total = 0.0;
    const osp = hitTag(s, "offspeed") > 0 && isOffspeed(p.kind);   // v1.2 Part B: the coach's "hits off-speed hard" prior
    for (const key of [pclass(p.kind), keyKind(p.kind) + "|" + q]) {   // v1.0 #21: spot read per pitch kind (v1.1: keyKind)
      let score, n;
      if (osp && key === "OS") {
        const d = s.hitter_damage.OS || [0.0, 0];
        const n2 = d[1] + HIT_OS_N0;
        score = (d[0] * d[1] + HIT_OS_PRIOR * HIT_OS_N0) / n2; n = n2;
      } else if (key in s.hitter_damage) [score, n] = s.hitter_damage[key];
      else continue;
      let eff = score * n / (n + 10.0);
      if (eff < 0 && n < 20) eff *= 0.5;
      total += eff;
    }
    return total;
  }
  function pathCost(p, q, s) {   // v1.2 Part B swing-path coach rule (engine.py path_cost)
    const t = hitTag(s, "path");
    if (!t) return 0.0;
    const ok = (t < 0 && isFastball(p.kind) && (q === "up-in" || q === "up-away")) ||
      (t > 0 && isOffspeed(p.kind) && ["down-in", "down-away", "down-middle", "chase"].includes(q));
    if (!ok) return 0.0;
    const n = (s.hitter_damage[keyKind(p.kind) + "|" + q] || [0, 0])[1];
    return HIT_PATH_RULE * (RHO_L[s.level] ?? 1.0) * 10.0 / (n + 10.0);
  }

  // v0.9 item 6: earlier trips today move whiff | swing (engine.py matchup_whiff; Step 3 fits M1, M2)
  const MM = { succ: 0.131, succ_cap: 4, hard: -0.341, hard_cap: 2 };
  function matchupWhiff(p, q, s) {
    const m = s.matchup || {};
    const x = MM.succ * Math.min(MM.succ_cap, m["succ|" + keyKind(p.kind)] || 0) + MM.hard * Math.min(MM.hard_cap, m["hard|" + keyKind(p.kind) + "|" + q] || 0);   // v1.0 #7: no shared clip
    return (RHO_L[s.level] ?? 1.0) * x;
  }
  // v0.9 item 3 widened: inner vs outer half on and near the plate (engine.py side_shift; Step 5 fit)
  const SIDE = {"hard": {"FB|up|same": -0.736, "FB|up|opp": -0.972, "FB|down|same": 0.052, "FB|down|opp": -0.082, "OS|up|same": -0.069, "OS|up|opp": -0.452, "OS|down|same": 0.553, "OS|down|opp": 0.353}, "whiff": {"FB|up|same": -0.535, "FB|up|opp": -0.361, "FB|down|same": -0.8, "FB|down|opp": -0.602, "OS|up|same": -0.901, "OS|up|opp": -0.747, "OS|down|same": -0.337, "OS|down|opp": 0.2}, "swing": {"FB|up|same": 1.086, "FB|up|opp": 0.61, "FB|down|same": 0.545, "FB|down|opp": -0.042, "OS|up|same": -0.379, "OS|up|opp": -0.339, "OS|down|same": 0.262, "OS|down|opp": 0.382}};
  // v0.9 item 8: more of a power hitter's hard contact leaves the park (engine.py power_hr_shift)
  const POWER_HR = 0.196;   // v1.0 #11/#28: one power-grade point = one SD of hard-hit share
  const powerHrShift = (s, gr) => (RHO_L[s.level] ?? 1.0) * POWER_HR * ((gr.w ?? 3) - 3);
  function sideShift(p, q, s, z, what) {
    if ((z !== "heart" && z !== "edge") || q === "middle" || q === "chase" || q === "down-middle") return 0.0;   // no side over the plate
    const [h, side] = q.split("-");
    const b = SIDE[what][(isOffspeed(p.kind) ? "OS" : "FB") + "|" + h + "|" + (s.same_side ? "same" : "opp")];
    return (RHO_L[s.level] ?? 1.0) * (side === "in" ? 0.5 : -0.5) * b;
  }
  // ---------------------------------------------------------------- outcome model
  // The outcome model in two parts (speed): opPrep computes everything that doesn't depend on the hitter's sit, opEval
  // adds the sit terms. Every sum is formed in the original order, so the result is identical to the one-pass model.
  const pvBin = (x, edges) => { let n = 0; for (const e of edges) if (x >= e) n++; return n; };   // np.digitize (engine.py _bin)
  function pitchVeloFactors(p, s, arsenal) {   // v1.3 core (ruling 4): HS / travel kind x velocity (engine.py pitch_velo_factors)
    const L = CT[s.level] || CT[TABLE_LEVEL_ALIAS[s.level] || ""];
    const T = L ? L.pitch_velo : null;
    if (!T) return null;
    const c = s.balls + "-" + s.strikes;
    let f = T.kind[c][T.engine_kind[p.kind]].slice();
    if (p.velo) {
      const cls = T.engine_class[p.kind];
      const pool = arsenal.includes(p) ? arsenal : arsenal.concat([p]);
      const vs = pool.filter((x) => x.velo && T.engine_class[x.kind] === cls).map((x) => x.velo);
      let sum = 0; for (const v of vs) sum += v;
      const rel = p.velo - sum / vs.length;
      const fr = T.velo_rel[c][cls][pvBin(rel, T.vrel_edges)], fa = T.velo_abs[c][cls][pvBin(p.velo, T.vabs_edges[cls])];
      f = f.map((x, i) => x * fr[i] * fa[i]);
    }
    return f;
  }
  function hangerGate(p, s) {   // v1.3 core (ruling 3): H x min(1, wild_today / 0.30) when wild_today > 0 (engine.py hanger_gate)
    if (!HANGER_GATE || !isOffspeed(p.kind)) return 0.0;
    const wt = wildToday(p, s);
    return wt > 0 ? HANGER_GATE * Math.min(1.0, wt / HANGER_GATE_FULL) : 0.0;
  }
  function opPrep(p, q, s, arsenal, policy, sitGiven) {
    const L = D.LEVEL[s.level], A = D.OUTCOME_ADJ[s.level];
    const big = isBigSpot(s);
    const cL = L.cL * (big ? 1.5 : 1.0);
    const [pw, ps] = pairTerms(p, q, s, arsenal);
    const hL = L.hL;
    const gr = s.grades || GRADES_OVERRIDE;
    const ct = classTerms(p, q, s);
    const pt = profileTerms(p, q, s, arsenal);
    const dmg = damage(p, q, s);
    const tau = (isOffspeed(p.kind) ? s.timing.OS : s.timing.FB) || 0.0;
    const tauEff = isFastball(p.kind) ? tau : -tau;
    const tAppr = hitTag(s, "approach"), rhoH = RHO_L[s.level] ?? 1.0;   // v1.2 Part B
    const land = landing(p, q, s);
    const [leanH, leanW] = leanHbpWp(p, q, s);   // v1.2: [1, 1] without a lean
    let [command, grade] = effective(p, s);
    grade = grade - Math.min(P08.kg_cap, P08.kg * Math.max(0, s.pitch_count - L.fatigue) / 20);
    const gs = 0.25 * (L.stuff_scale ?? 1.0);
    const cw = (L.cmd_whiff ?? 0.0) * (command - 3);   // v0.7b: better command adds contact, not strikeouts (fit_spread.py)
    const zones = [];
    // v1.3 Part 2: the count layer and the zone table's cells (mirror of engine.py outcome_probs)
    const [cnt, kap] = countCells(s.level, s.balls, s.strikes);
    const boSw = countBaseOut(s.level, s.outs, s.bases);
    const tht = q === "middle" ? "middle" : (q.startsWith("up") || (q === "chase" && isFastball(p.kind))) ? "up" : "down";
    const zcell = zoneCells(s.level, zoneProfile(p), countGroup(s.balls, s.strikes), T_HT[tht]);
    const gate = hangerGate(p, s);
    for (const z of ZONES) {
      const pz = land[z], Z = { z, pz };
      const [cSw, cWh, cFo, cHd] = cnt[z], [zSw, zCs, zWh, zFo, zHd] = zcell[z];
      let sl = logit(S0[z]);
      sl += cSw;   // v1.2's count terms (count_v12.json): +0.9 at two strikes, -0.4 at 0-0, -2.0 at 3-0, hitter's counts +0.3 / -0.4
      sl += boSw;
      if (z === "off" || z === "noncomp") sl += ct.chase[z];
      sl += zSw;
      const wz = ZONE_IN[z];
      sl += wz * A.zsw + (1 - wz) * A.osw;
      Z.slPre = sl; Z.s0pos = S0[z] > 0;
      const offz = z === "off" || z === "noncomp"; Z.offz = offz;
      Z.slPost = [];
      if (offz) Z.slPost.push(ps);
      if (gr && offz) Z.slPost.push(-(gval("g_d", s.level) * ((gr.d ?? 3) - 3)));
      Z.slPost.push(sideShift(p, q, s, z, "swing"));
      if (tAppr && isEarly(s)) Z.slPost.push(rhoH * HIT_FIT.approach * tAppr * wz);   // v1.2 Part B: early-count approach
      if (offz) Z.slPost.push(pt.chase);
      Z.C = (z === "edge" || z === "off") ? sig(logit(C0[z]) + A.cs + kap + s.ump_u + ct.cstrike + pt.cstrike + zCs) : C0[z];
      const wl = logit(W0[z]) + W_FB + gs * (grade - 3) + cL * 1.5 * (p.conf - 0.6);
      Z.wlPre = wl; Z.wlD = hL * 0.4 * DMG_SCALE * dmg;
      Z.wlPost = [];
      Z.wlPost.push(pw + ct.whiff);
      Z.wlPost.push(cWh + zWh);
      Z.wlPost.push(wz * A.wz + (1 - wz) * A.wo);
      if (cw) Z.wlPost.push(-cw);
      if (gr) Z.wlPost.push(-(gval("g_c", s.level) * ((gr.c ?? 3) - 3)));
      if (s.matchup && Object.keys(s.matchup).length) Z.wlPost.push(matchupWhiff(p, q, s));
      Z.wlPost.push(sideShift(p, q, s, z, "whiff"));
      Z.wlPost.push(pt.whiff);
      Z.F = sig(logit(F0[z]) + cFo + zFo);   // v1.2: +0.3 at two strikes (count_v12.json)
      Z.h1 = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6); Z.h2 = hL * 0.8 * DMG_SCALE * dmg; Z.h3 = -ct.hard;
      Z.hlPost = [];
      { const c_ = isOffspeed(p.kind) ? "OS" : "FB"; Z.hlPost.push((RHO_L[s.level] ?? 1.0) * Math.min(P08.fam_cap, P08["phi_" + c_] * ((s.familiar || {})[c_] || 0))); }   // #19
      if (gr) Z.hlPost.push(gval("g_w", s.level) * ((gr.w ?? 3) - 3));
      if (s.crowding && (q === "up-in" || q === "down-in")) Z.hlPost.push(-P08.crowd);
      if (z === "heart" && isOffspeed(p.kind)) {
        Z.hlPost.push(HANGER);   // the hanger (zone table class term; v1.2 +0.5)
        if (gate) Z.hlPost.push(gate);   // v1.3 core (ruling 3): the quality-gated hanger (engine.py hanger_gate)
      }
      Z.hlPost.push(cHd + zHd);
      Z.hlPost.push(sideShift(p, q, s, z, "hard"));
      Z.hlPost.push(pt.hard);
      Z.hb = ((z === "noncomp" || z === "off") && A.hbp > 0) ? Math.min(0.9, A.hbp * hbpLoc(p, q) * (z === "noncomp" ? 1.0 : 0.1)) : 0;
      Z.wp = (z === "noncomp" && anyBase(s.bases)) ? (isOffspeed(p.kind) ? 0.12 : 0.04) * (1 - 0.15 * (s.catcher_block - 3)) : 0;
      if (leanH !== 1.0 && Z.hb) Z.hb = Math.min(0.9, Z.hb * leanH);   // v1.2 (engine.py)
      if (leanW !== 1.0 && Z.wp) Z.wp = Math.min(0.9, Z.wp * leanW);
      zones.push(Z);
    }
    return { zones, hL, tauEff, big, pv: pitchVeloFactors(p, s, arsenal) };
  }
  function opEval(pr, p, q, s, arsenal, sit, byZone, zout) {
    const hL = pr.hL;
    if (sit === undefined || sit === null) sit = ["mix", s.sit_sigma !== null && s.sit_sigma !== undefined ? s.sit_sigma : sitPrior(arsenal, s)];
    const [mT, mH, vSit] = sitShift(p, q, arsenal, s, sit);          // 2.2 what he's sitting on
    const tB = (RHO_L[s.level] ?? 1.0) * timingB(p, q, s, vSit) * (pr.big ? 0.5 : 1.0);   // 4: halved in a big spot
    const out = { ball: 0, cstrike: 0, whiff: 0, foul: 0, weak: 0, solid: 0, hard: 0, wp_ball: 0, hbp: 0 };
    let exW = -hL * (P08.sit_tW * mT + P08.sit_hW * mH) + hL * 0.6 * pr.tauEff + P08.beta_T * tB;
    exW = Math.max(-P08.capW * hL, Math.min(P08.capW * hL, exW));
    let hx = hL * (P08.sit_tH * mT + P08.sit_hH * mH) - hL * 0.5 * pr.tauEff - P08.gamma_T * tB;
    hx = Math.max(-P08.capH * hL, Math.min(P08.capH * hL, hx));
    const sSit = hL * (P08.sit_tS * mT + P08.sit_hS * mH);
    for (const Z of pr.zones) {
      const z = Z.z, pz = Z.pz;
      let sl = Z.slPre;
      sl += sSit;
      for (const x of Z.slPost) sl += x;
      const S = Z.s0pos ? sig(sl) : 0;
      const C = Z.C;
      let wl = Z.wlPre;
      wl += exW - Z.wlD;
      for (const x of Z.wlPost) wl += x;
      const W = sig(wl);
      const F = Z.F;
      let hl = Z.h1 + hx + Z.h2 - Z.h3;
      for (const x of Z.hlPost) hl += x;
      const [weak, solid, hard] = Q0[z];
      const hard2 = sig(logit(hard) + hl);
      if (zout) zout[z] = { L: pz, S, C, W, F, H: hard2, offz: Z.offz, cz: z === "edge" || z === "off" };
      const scale = (1 - hard2) / (weak + solid);
      const weak2 = weak * scale, solid2 = solid * scale;
      const take = 1 - S;
      let ballP = pz * take * (1 - C);
      if (Z.hb) { out.hbp += ballP * Z.hb; ballP *= (1 - Z.hb); }
      if (Z.wp) { out.wp_ball += ballP * Z.wp; ballP *= (1 - Z.wp); }
      out.ball += ballP;
      out.cstrike += pz * take * C;
      out.whiff += pz * S * W;
      out.foul += pz * S * (1 - W) * F;
      const contact = pz * S * (1 - W) * (1 - F);
      out.weak += contact * weak2; out.solid += contact * solid2; out.hard += contact * hard2;
      if (byZone) {   // v0.7: the outcome mix given the pitch landed in this zone (for learning from logged location)
        const take_ = 1 - S, bp = take_ * (1 - C);
        let hbpZ = 0, wpZ = 0, ballZ = bp;
        if (Z.hb) { hbpZ = ballZ * Z.hb; ballZ *= (1 - Z.hb); }
        if (Z.wp) { wpZ = ballZ * Z.wp; ballZ *= (1 - Z.wp); }
        const ct = S * (1 - W) * (1 - F);
        byZone[z] = { land: pz, ball: ballZ, wp_ball: wpZ, hbp: hbpZ, cstrike: take_ * C, whiff: S * W, foul: S * (1 - W) * F, weak: ct * weak2, solid: ct * solid2, hard: ct * hard2 };
      }
    }
    if (pr.pv) {   // v1.3 core (ruling 4): HS / travel pitch kind x velocity, then renormalise (engine.py outcome_probs)
      const [mb, mh, mc, mw, mf, mi] = pr.pv;
      out.ball *= mb; out.wp_ball *= mb; out.hbp *= mh; out.cstrike *= mc; out.whiff *= mw; out.foul *= mf;
      out.weak *= mi; out.solid *= mi; out.hard *= mi;
      const tot = out.ball + out.wp_ball + out.hbp + out.cstrike + out.whiff + out.foul + out.weak + out.solid + out.hard;
      for (const k of Object.keys(out)) out[k] /= tot;
    }
    return out;
  }
  function outcomeProbs(p, q, s, arsenal, policy, byZone, sit, zout) {   // byZone (optional): each landing zone's own outcome mix
    if (p.fb_mph === undefined || p.fb_mph === null) { resolveSpeeds(arsenal); if (p.fb_mph === undefined || p.fb_mph === null) resolveSpeeds([p].concat(arsenal.filter((x) => x !== p))); }
    return opEval(opPrep(p, q, s, arsenal, policy, sit !== undefined && sit !== null), p, q, s, arsenal, sit, byZone, zout);
  }

  // ---------------------------------------------------------------- situation terms

  // ---------------------------------------------------------------- decision rule
  // v1.2.2 (Drew, Nov 14): the confidence band, as engine.py. A pitch within RAMP_W under the cutoff is blended in by
  // bandWeight (0 at the bottom, 1 at the cutoff); mix when nothing clears the cutoff (D2); every count (D3).
  const RAMP_W = 0.10, RAMP_MIN_W = 1e-3;
  function bandWeight(p, s) {
    const cutoff = D.LEVEL[s.level].cutoff;
    if (p.conf >= cutoff) return 1.0;
    return Math.max(0.0, (p.conf - (cutoff - RAMP_W)) / RAMP_W);
  }
  function bandPitches(arsenal, s, exclude) {
    const ex = shakenNames(exclude);
    return arsenal.filter((x) => { const w = bandWeight(x, s); return w > 0.0 && w < 1.0 && !ex.has(x.name); }).map((x) => x.name);
  }
  function candidates(arsenal, s, forced, extra) {
    const cutoff = D.LEVEL[s.level].cutoff, ext = extra || [];
    let c = arsenal.filter((x) => x.conf >= cutoff || ext.includes(x.name) || (forced && x.name === forced));
    if (!c.length) c = [arsenal.reduce((a, x) => (x.conf > a.conf ? x : a), arsenal[0])];
    return c;
  }
  function countStakes(b, k, level) {
    const cv = D.CV[level], [bb, kk] = D.LW[level];
    const strike = k === 2 ? kk : cv[cvKey(b, k + 1)];
    const ball = b === 3 ? bb : cv[cvKey(b + 1, k)];
    return ball - strike;
  }
  function stakesFactor(b, k, level) {
    if (!D.LW[level]) return 1.0;
    if (b === 3 && k === 0) return 0.5;   // v0.7c (Drew): 3-0 gets the tightest setting, like 3-2 (engine.py)
    if ((b === 0 || b === 1) && k === 0) return 0.9;   // v1.0 D7 (Drew, Nov 10): 0-0 and 1-0 tightened (engine.py)
    if (b === 3 && k === 1) return 1.3;   // v1.0 D1 (Drew, Nov 10): 3-1 moderate mix, top call ~55-70% (engine.py)
    let avg = 0; for (const [b_, k_] of COUNTS) avg += countStakes(b_, k_, level);
    avg /= COUNTS.length;
    return Math.min(1.5, Math.max(0.5, avg / countStakes(b, k, level)));
  }
  const ck = (name, q) => name + "|" + q;



  const KINDS = ["FB", "SI", "FC", "SL", "CB", "CH"];
  function checkInputs(arsenal, s) {   // v0.7c: impossible input gets a clear error, not a crash or a silent empty call
    if (!arsenal || !arsenal.length) throw new Error("no pitches: the arsenal is empty");
    const names = arsenal.map((x) => x.name);
    if (new Set(names).size !== names.length) throw new Error(`two pitches share a name: ${names.join(", ")}`);
    for (const x of arsenal) if (!KINDS.includes(x.kind)) throw new Error(`unknown pitch kind "${x.kind}" for ${x.name}`);
    for (const x of arsenal) if (!SHAPE_TAGS[x.kind].includes(x.shape || "")) throw new Error(`unknown shape "${x.shape}" for ${x.name} (${x.kind})`);   // v1.1: after migration
    for (const x of arsenal) if (!(Math.abs(x.lean_x || 0) <= LEAN_MAX && Math.abs(x.lean_z || 0) <= LEAN_MAX && spreadOf(x) >= SPREAD_MIN && spreadOf(x) <= SPREAD_MAX))
      throw new Error(`miss lean / spread out of range for ${x.name}: lean ${x.lean_x || 0}, ${x.lean_z || 0} in. (limit ${LEAN_MAX}), spread ${spreadOf(x)} (${SPREAD_MIN}-${SPREAD_MAX})`);   // v1.2
    if (!D.LEVEL[s.level] || !D.RE[s.level]) throw new Error(`unknown level "${s.level}"`);
    for (const [k, v] of Object.entries(s.hitter_tags || {}))   // v1.2 Part B
      if (!HIT_TAG_VALUES[k] || (v !== null && v !== undefined && !(v in HIT_TAG_VALUES[k]))) throw new Error(`unknown hitter tag ${k}=${v}`);
    if (!(s.balls >= 0 && s.balls <= 3 && s.strikes >= 0 && s.strikes <= 2)) throw new Error(`impossible count ${s.balls}-${s.strikes}`);
    if (!(s.outs >= 0 && s.outs <= 2)) throw new Error(`impossible number of outs ${s.outs}`);
    if (!s.bases || s.bases.length !== 3) throw new Error("bases must be three flags (1st, 2nd, 3rd)");
  }



  // ---------------------------------------------------------------- "time for a change" (flags.py)
  function pitcherStatus(arsenal, level, pitchCount, recent) {
    const L = D.LEVEL[level];
    const trusted = arsenal.filter((p) => p.conf >= L.cutoff);
    let slide = 0; for (const p of arsenal) slide += Math.max(0.0, p.base_conf - p.conf); slide /= arsenal.length;
    const over = pitchCount - L.fatigue;
    const last6 = (recent || []).slice(-6);
    const traffic = last6.filter((r) => r === "walk" || r === "hbp" || r === "hard").length;
    const reasons = []; let score = 0;
    if (!trusted.length) { reasons.push("he trusts none of his pitches right now"); score += 3; }
    else if (trusted.length === 1 && arsenal.length > 1) { reasons.push(`he's down to one pitch he trusts (${trusted[0].name})`); score += 1; }
    if (slide >= 0.15) { reasons.push(`confidence is down ${slide.toFixed(2)} from his bullpen on average`); score += 1; }
    if (over >= 20) { reasons.push(`${over} pitches past his usual fatigue point`); score += 2; }
    else if (over >= 0) { reasons.push(`at his fatigue point (${pitchCount} pitches)`); score += 1; }
    if (traffic >= 4) { reasons.push(`${traffic} of his last ${last6.length} batters walked, were hit, or hit it hard`); score += 2; }
    else if (traffic >= 3) { reasons.push(`${traffic} of his last ${last6.length} batters walked, were hit, or hit it hard`); score += 1; }
    return { status: score >= 3 ? "change" : (score >= 1 ? "watch" : "ok"), reasons, trusted: trusted.map((p) => p.name), score };
  }

  // ================================================================ v0.8 (docs/SPEC_v0.8.md), port of engine.py
  // Parity notes: Python 3.12+ sum() over floats is compensated (Neumaier); psum reproduces it. Dicts iterate in insertion
  // order in both languages; min/max keep the first of equal values, as Python's do.
  function psum(xs) {
    if (!xs.length) return 0;
    let f = 0 + xs[0], c = 0.0;
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i], t = f + x;
      if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f;
      f = t;
    }
    if (c && Number.isFinite(c)) f += c;
    return f;
  }
  const byName = (arsenal, n) => arsenal.find((x) => x.name === n);
  const sk = (n, j) => n + "|" + j;                    // sit option key
  const skName = (key) => key.slice(0, key.lastIndexOf("|"));
  const skH = (key) => key.slice(key.lastIndexOf("|") + 1);
  const cntKey = (b, k) => b + "-" + k;

  let P08 = {}, TYPED = {}, RHO_L = {}, SIM = {}, OUT_TABLE = {}, RUNNER_FIT = {}, HITTER_SPREAD = {},
    RUN_GAME = {}, WE = null;
  let GRADES_OVERRIDE = null;
  const HEIGHTS = ["up", "middle", "down"];            // amendment A1
  const Y_TARGET = { "up-in": 3.2, "up-away": 3.2, middle: 2.5, "down-in": 1.8, "down-away": 1.8, "down-middle": 1.8 };
  const V_CENTERS = [1.00, 0.94, 0.88], Y_CENTERS = [3.0, 2.0];
  const QRE_ITERS = 3000, QRE_TOL = 1e-3, QRE_WMIN = 0.002, TAPER = 0.2;
  const B_TYPES = ["GB", "LD", "FB", "PU"];
  function initV08(v) {
    P08 = Object.assign({}, v.P08); TYPED = v.TYPED; RHO_L = v.RHO_L;
    SIM = v.SIM; OUT_TABLE = v.OUT_TABLE; RUNNER_FIT = v.RUNNER_FIT; HITTER_SPREAD = v.HITTER_SPREAD || {}; RUN_GAME = v.RUN_GAME;
    WE = D.WE || null;
    for (const t of [OUT_TABLE, RUNNER_FIT, HITTER_SPREAD, RUN_GAME, SIM.A_BAR || {}, SIM.I_BAR_UMP || {}, SIM.I0_GRADE || {}])
      if (t.hs && !t.travel) t.travel = t.hs;
  }
  const SIGMA_PARSE = new WeakMap();   // speed only: a sit mix's [name, height, prob] list, parsed once
  function parseSigma(sg) {
    let r = SIGMA_PARSE.get(sg);
    if (!r) { r = Object.keys(sg).map((key) => [skName(key), skH(key), sg[key]]); SIGMA_PARSE.set(sg, r); }
    return r;
  }
  const yTarget = (q, kind) => (q === "chase" ? (kind === "SL" || kind === "CB" || kind === "CH" ? 1.2 : 3.8) : Y_TARGET[q]);
  function heightMember(q, kind, j) {
    const h = q === "middle" ? "middle" : (q.startsWith("up") || (q === "chase" && isFastball(kind))) ? "up" : "down";
    return h === j ? 1.0 : 0.0;
  }
  const sitOptions = (arsenal) => { const o = []; for (const x of arsenal) for (const j of HEIGHTS) o.push(sk(x.name, j)); return o; };
  function sitPrior(arsenal, s) {
    const m = arsenal.length, hc = s.balls > s.strikes && s.strikes < 2;
    const fb = arsenal.filter((x) => isFastball(x.kind)), os = arsenal.filter((x) => !isFastball(x.kind));
    const pr = {};
    if (fb.length && os.length) {
      const fs = hc ? 0.65 : (s.strikes === 2 ? 0.35 : 0.5);
      for (const x of arsenal) pr[x.name] = isFastball(x.kind) ? fs / fb.length : (1 - fs) / os.length;
    } else for (const x of arsenal) pr[x.name] = 1 / m;
    const out = {};
    for (const n in pr) for (const j of HEIGHTS) out[sk(n, j)] = pr[n] / HEIGHTS.length;
    return out;
  }
  function speedToday(p, s) {
    if (s.radar && p.name in s.radar) return s.radar[p.name];
    let v = mph(p);
    v -= Math.min(P08.kv_cap, P08.kv * Math.max(0, s.pitch_count - D.LEVEL[s.level].fatigue) / 10);
    return v;
  }
  function sitShift(p, q, arsenal, s, sit) {
    const kt = arsenal.length;
    if (sit[0] === "pure") {
      const i = sit[1], j = sit[2];
      return [(p.name === i ? 1.0 : 0.0) - 1 / kt, heightMember(q, p.kind, j) - 1 / HEIGHTS.length, speedToday(byName(arsenal, i), s)];
    }
    const sg = sit[1], parsed = parseSigma(sg);
    const mt = psum(parsed.filter((e) => e[0] === p.name).map((e) => e[2])) - 1 / kt;
    const mh = psum(parsed.map((e) => e[2] * heightMember(q, p.kind, e[1]))) - 1 / HEIGHTS.length;
    const vs = psum(parsed.map((e) => e[2] * speedToday(byName(arsenal, e[0]), s)));
    return [mt, mh, vs];
  }
  function timingB(p, q, s, vSit) {
    const vHat = s.look ? s.look[0] : vSit;
    const vt = (1 - P08.alpha) * vHat + P08.alpha * vSit;
    const vp = speedToday(p, s) + 0.5 * evAdj(p, q);
    const r = (vt - vp) / vt;
    const sr = Math.min(1.0, Math.max(0.0, (Math.abs(r) - P08.dead) / P08.ramp));
    if (r < 0) return P08.fast_mult * sr;
    if (p.kind === "CH" && r > P08.ch_hi) return sr * Math.exp(-(r - P08.ch_hi) / P08.ch_decay);
    return sr;
  }
  const gMod = (d, ds) => (d > 0 ? (d / ds) * Math.exp(1 - d / ds) : 0.0);
  function pairTerms(p, q, s, arsenal) {
    const yHat = s.look ? s.look[1] : 2.5;
    const ey = gMod((isFastball(p.kind) ? 1 : -1) * (yTarget(q, p.kind) - yHat), P08.dstar_E);
    const rho = RHO_L[s.level] ?? 1.0;   // v1.0 #19: eye level and tunneling scale by RHO_L
    let w = rho * (P08.beta_E * ey), sw = rho * (P08.beta_E_S * ey);
    if (s.last) {
      const last = byName(arsenal, s.last[0]);
      const lq = s.last[1], res = s.last.length > 2 ? s.last[2] : null;
      if (last) {
        if (last.name === p.name) {
          if (res === "whiff") w += lq === q ? P08.rep_whiff_same : P08.rep_whiff_other;
          else if (lq === q && res !== "ball" && res !== "cstrike") w += P08.rep_same_spot;   // v1.0 D8
        } else {
          const ts = tunnelScore(last, lq, p, q, s.same_side, s.level), dTun = ts[1], dPlate = ts[3];
          const dRel = ((last.release_offset_in[0] - p.release_offset_in[0]) ** 2 + (last.release_offset_in[1] - p.release_offset_in[1]) ** 2) ** 0.5;
          const tun = Math.max(-1.0, Math.min(1.0, Math.exp(-dTun / 6) * gMod(dPlate, 18) - dRel / 8));
          const kap = (p.kind === "SL" || p.kind === "CB") ? P08.kappa_brk : 1.0;
          w += rho * (kap * P08.beta_tun_whiff * tun); sw += rho * (kap * P08.beta_tun_chase * tun);   // v1.0 D5
        }
      }
    }
    if (isBigSpot(s)) { w = 0.5 * w; sw = 0.5 * sw; }
    return [w, sw];
  }
  const gval = (name, level) => ((HITTER_SPREAD[level] && HITTER_SPREAD[level][name] !== undefined) ? HITTER_SPREAD[level][name] : P08[name]);
  const zoneArea = (b, k) => 3.03 + 0.22 * b - 0.30 * k;
  const countKappa = (b, k, level) => countCells(level, b, k)[1];   // v1.3 Part 2: the count table's cstrike (zoneArea: the pre-fit rule, reference only)

  // ---------------------------------------------------------------- 7.2 end values, 7.3 typed balls in play
  function vEnd(s, o, bases, r) {
    const base = r + re(o, bases, s.level), w = s.win;
    if (!(w && w.omega > 0)) return base;
    const we = wePitch(w.ctx, o, bases, w.margin0 - r);
    return (1 - w.omega) * base + w.omega * (w.WE0 - we) / w.m0;
  }
  function gbRate(p) {   // v1.1 Step 2e: grounder rate | ball in play by kind and profile (mirror of engine.py gb_rate)
    return GB_PROFILE[ptKey(p)];
  }
  function typeMix(p, q, c, s) {   // s (optional): + the count table's ground-ball offset for its level and count (engine.py type_mix)
    const g = sig(logit(gbRate(p)) + TYPED.beta_y * (yTarget(q, p.kind) - 2.5) + TYPED.gamma[c]
      + (s ? countCells(s.level, s.balls, s.strikes)[2] : 0.0) + (GB_KIND[p.kind] ?? 0.0));
    const l = TYPED.nongb[c];
    return { GB: g, LD: (1 - g) * l[0], FB: (1 - g) * l[1], PU: (1 - g) * l[2] };
  }
  function inPlayValueTyped(c, p, q, s) {
    const o = s.outs, [b1, b2, b3] = s.bases, L = s.level;
    const tab = OUT_TABLE[L][c], rf = RUNNER_FIT[L];
    const ev = (o_, b_, r_) => vEnd(s, o_, b_, r_);
    const tm = typeMix(p, q, c, s);
    const gr = c === "hard" ? (s.grades || GRADES_OVERRIDE) : null;
    const dh = gr ? powerHrShift(s, gr) : 0.0;
    let total = 0.0;
    for (const t of B_TYPES) {
      let [po, p1, p2, p3, phr, pe] = tab[t];
      if (dh && phr > 0 && phr < 1) { const nhr = sig(logit(phr) + dh); po = Math.max(0.0, po - (nhr - phr)); phr = nhr; }   // item 8
      if (s.infield_in && t === "GB") { const sh = Math.min(po, TYPED.gb_babip_in); po -= sh; p1 += sh; }   // v1.0 #12: infield in, more singles
      let vOut;
      if (o + 1 >= 3) vOut = ev(3, [false, false, false], 0);
      else {
        let psc, dp;
        if (t === "GB") { psc = s.infield_in ? TYPED.gb_infield_in : rf.p_GB; dp = b1 ? Math.min(0.95, TYPED.dp[c] * rf.S_DP) : 0.0; }
        else if (t === "FB") { psc = rf.p_FB; dp = 0.0; }
        else { psc = 0.01; dp = 0.0; }
        const vDp = dp ? (o + 2 >= 3 ? ev(3, [false, false, false], 0) : ev(o + 2, [false, false, b2], b3 ? 1 : 0)) : 0.0;
        const adv = TYPED.r2_to_3rd[t] ?? 0.0;
        const after = (scored) => {
          const thirdOpen = !b3 || scored;
          if (b2 && thirdOpen && adv)
            return adv * ev(o + 1, [b1, false, true], (b3 && scored) ? 1 : 0) + (1 - adv) * ev(o + 1, [b1, b2, b3 && !scored], (b3 && scored) ? 1 : 0);
          return ev(o + 1, [b1, b2, b3 && !scored], (b3 && scored) ? 1 : 0);
        };
        const vReg = b3 ? (psc * after(true) + (1 - psc) * after(false)) : after(false);
        vOut = dp * vDp + (1 - dp) * vReg;
      }
      let tt = po * vOut;
      let runs = b3 ? 1 : 0, v1;
      if (b2) v1 = 0.55 * ev(o, [true, b1, false], runs + 1) + 0.45 * ev(o, [true, b1, true], runs);
      else v1 = ev(o, [true, b1, false], runs);
      tt += (p1 + pe) * v1;
      runs = (b2 ? 1 : 0) + (b3 ? 1 : 0);
      let v2;
      if (b1) v2 = 0.4 * ev(o, [false, true, false], runs + 1) + 0.6 * ev(o, [false, true, true], runs);
      else v2 = ev(o, [false, true, false], runs);
      tt += p2 * v2;
      tt += p3 * ev(o, [false, false, true], +b1 + +b2 + +b3);
      tt += phr * ev(o, [false, false, false], +b1 + +b2 + +b3 + 1);
      total += tm[t] * tt;
    }
    return total;
  }

  // ---------------------------------------------------------------- 2.3 sit game
  function sitPayoff(M, ks, pi) {
    const out = {}, calls = Object.keys(M);
    for (const k of ks) out[k] = psum(calls.map((a) => (pi[a] ?? 0.0) * M[a][k]));
    return out;
  }
  function sitResponse(M, ks, pi, T, b) {
    const cb = sitPayoff(M, ks, pi), u = {};
    for (const k of ks) u[k] = cb[k] / T + (b ? (b[k] ?? 0.0) : 0.0);
    let mx = -Infinity; for (const k of ks) if (u[k] > mx) mx = u[k];
    const w = {}; for (const k of ks) w[k] = Math.exp(u[k] - mx);
    const t = psum(ks.map((k) => w[k]));
    const out = {}; for (const k of ks) out[k] = w[k] / t;
    return out;
  }
  function exploitability(M, ks, pi, sigma) {
    const cb = sitPayoff(M, ks, pi);
    let mx = -Infinity; for (const k of ks) if (cb[k] > mx) mx = cb[k];
    return mx - psum(ks.map((k) => sigma[k] * cb[k]));
  }
  function temperature(arsenal, s) {   // v1.0 #18: no uncertainty floor (it never bound)
    const k_ = runScale(s.level), f = stakesFactor(s.balls, s.strikes, s.level);
    return 0.010 * k_ * (isBigSpot(s) ? 0.5 : 1.0) * f;
  }
  function windows(s) {
    const k_ = runScale(s.level), f = Math.min(1.0, stakesFactor(s.balls, s.strikes, s.level));
    return [0.030 * k_ * f, LOC_WINDOW * k_ * f];
  }
  function taper(g, w) {
    if (g >= w) return 0.0;
    const edge = w * (1 - TAPER);
    return g <= edge ? 1.0 : (w - g) / (w - edge);
  }
  function soft(costs, temp, w, ref) {   // costs: [[key, cost]] in order
    const wt = costs.map(([k, c]) => [k, Math.exp(-(c - ref) / temp) * taper(c - ref, w)]);
    const t = psum(wt.map((x) => x[1]));
    return t > 0 ? wt.filter((x) => x[1] > 0).map(([k, v]) => [k, v / t]) : [];
  }
  function policyFromCosts(costs, s, temp) {   // costs: {callKey: cost} in allowed-call order; returns {callKey: prob}
    const [win, lwin] = windows(s);
    const names = [], keys = Object.keys(costs);
    for (const a of keys) { const n = skName(a); if (!names.includes(n)) names.push(n); }
    const bestBy = names.map((n) => { let m = Infinity; for (const a of keys) if (skName(a) === n && costs[a] < m) m = costs[a]; return [n, m]; });
    let overall = Infinity; for (const [, v] of bestBy) if (v < overall) overall = v;
    const pp = soft(bestBy, temp, win, overall);
    const bb = Object.fromEntries(bestBy), pi = {};
    for (const [n, pn] of pp) {
      const lw = Math.max(TAPER * lwin, lwin - (bb[n] - overall));
      const loc = soft(keys.filter((a) => skName(a) === n).map((a) => [skH(a), costs[a]]), temp, lw, bb[n]);
      for (const [q, pq] of loc) pi[ck(n, q)] = pn * pq;
    }
    return pi;
  }
  // The sit game on flat arrays (speed): the same operations in the same order as policy_from_costs / sit_response /
  // solve_sit_game in engine.py, so results are identical (adding a zero never changes a compensated sum).
  function callStruct(calls) {
    const names = [], groups = [], qs = calls.map(skH);
    for (let i = 0; i < calls.length; i++) {
      const n = skName(calls[i]);
      let g = names.indexOf(n);
      if (g < 0) { g = names.length; names.push(n); groups.push([]); }
      groups[g].push(i);
    }
    return { calls, names, groups, qs };
  }
  function softArr(vals, n, temp, w, ref, out) {   // weights for vals[0..n) into out; returns false if all zero
    let f = 0, c = 0, first = true;
    for (let i = 0; i < n; i++) {
      const x = Math.exp(-(vals[i] - ref) / temp) * taper(vals[i] - ref, w);
      out[i] = x;
      if (first) { f = 0 + x; first = false; continue; }
      const t = f + x;
      if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f;
      f = t;
    }
    if (c && Number.isFinite(c)) f += c;
    if (!(f > 0)) return false;
    for (let i = 0; i < n; i++) out[i] = out[i] / f;
    return true;
  }
  // v1.3 (Drew's Nov 23 ruling 8): the HS / travel fastball-share floor by count (engine.py fb_floor / fb_names /
  // apply_fb_floor; count table levels.hs.fb_floor). Same operations in the same order as engine.py.
  function fbFloor(s) { const L = ctLevel(s.level); const T = L ? L.fb_floor : null; return T ? T[cntKey(s.balls, s.strikes)] : null; }
  function fbNames(arsenal, s) {
    if (fbFloor(s) == null) return null;
    return new Set(arsenal.filter((x) => isFastball(x.kind)).map((x) => x.name));
  }
  function applyFbFloor(pi, s, fb, costs, temp) {   // pi: {callKey: prob} -> fastball calls' share raised to the floor
    if (!fb || !fb.size) return pi;
    const f = fbFloor(s);
    let w = 0.0, t = 0.0;
    for (const a in pi) { t += pi[a]; if (fb.has(skName(a))) w += pi[a]; }
    if (w === 0.0 && costs && t > 0.0) {   // the fastball outside the never-pick window: brought back at the floor
      const fbc = Object.keys(costs).filter((a) => fb.has(skName(a))).map((a) => [a, costs[a]]);
      if (!fbc.length) return pi;
      let best = Infinity; for (const [, c] of fbc) if (c < best) best = c;
      const loc = soft(fbc, temp, windows(s)[1], best), o = {};
      for (const a in pi) o[a] = pi[a] * (1.0 - f);
      for (const [a, pq] of loc) o[a] = (o[a] ?? 0.0) + f * t * pq;
      return o;
    }
    if (!(w > 0.0 && w < f * t)) return pi;
    const kf = f * t / w, ko = (1.0 - f) * t / (t - w), o = {};
    for (const a in pi) o[a] = pi[a] * (fb.has(skName(a)) ? kf : ko);
    return o;
  }
  function floorArr(piOut, st, s, fb, cost, temp, lwin) {   // applyFbFloor on policyArr's array (group order = policy_from_costs' dict order)
    if (!fb || !fb.size) return piOut;
    const f = fbFloor(s);
    let w = 0.0, t = 0.0;
    for (let g = 0; g < st.groups.length; g++) {
      const isF = fb.has(st.names[g]);
      for (const i of st.groups[g]) if (piOut[i] > 0) { t += piOut[i]; if (isF) w += piOut[i]; }
    }
    if (w === 0.0 && t > 0.0) {   // the fastball outside the never-pick window: brought back at the floor (costs in call order)
      const fbc = [];
      for (let i = 0; i < st.calls.length; i++) if (fb.has(skName(st.calls[i]))) fbc.push([i, cost[i]]);
      if (!fbc.length) return piOut;
      let best = Infinity; for (const [, c] of fbc) if (c < best) best = c;
      const loc = soft(fbc, temp, lwin, best);
      for (let i = 0; i < piOut.length; i++) if (piOut[i] > 0) piOut[i] = piOut[i] * (1.0 - f);
      for (const [i, pq] of loc) piOut[i] = piOut[i] + f * t * pq;
      return piOut;
    }
    if (!(w > 0.0 && w < f * t)) return piOut;
    const kf = f * t / w, ko = (1.0 - f) * t / (t - w);
    for (let g = 0; g < st.groups.length; g++) {
      const isF = fb.has(st.names[g]);
      for (const i of st.groups[g]) if (piOut[i] > 0) piOut[i] = piOut[i] * (isF ? kf : ko);
    }
    return piOut;
  }
  function policyArr(cost, st, temp, win, lwin, piOut, s, fb) {   // pi over calls (Float64Array); zero where not picked
    const G = st.groups.length, best = new Float64Array(G), pn = new Float64Array(G);
    for (let g = 0; g < G; g++) { let m = Infinity; for (const i of st.groups[g]) if (cost[i] < m) m = cost[i]; best[g] = m; }
    let overall = Infinity; for (let g = 0; g < G; g++) if (best[g] < overall) overall = best[g];
    piOut.fill(0);
    if (!softArr(best, G, temp, win, overall, pn)) return piOut;
    const tmpC = new Float64Array(st.calls.length), tmpW = new Float64Array(st.calls.length);
    for (let g = 0; g < G; g++) {
      if (!(pn[g] > 0)) continue;
      const idx = st.groups[g], lw = Math.max(TAPER * lwin, lwin - (best[g] - overall));
      for (let j = 0; j < idx.length; j++) tmpC[j] = cost[idx[j]];
      if (!softArr(tmpC, idx.length, temp, lw, best[g], tmpW)) continue;
      for (let j = 0; j < idx.length; j++) if (tmpW[j] > 0) piOut[idx[j]] = pn[g] * tmpW[j];
    }
    return floorArr(piOut, st, s, fb, cost, temp, lwin);
  }
  function piToObject(pi, st) {   // insertion order as Python's dict: by pitch (first appearance), then its targets
    const o = {};
    for (const idx of st.groups) for (const i of idx) if (pi[i] > 0) o[st.calls[i]] = pi[i];
    return o;
  }
  function policyFromCosts(costs, s, temp, fb) {   // costs: {callKey: cost} in allowed-call order; returns {callKey: prob}
    const calls = Object.keys(costs), st = callStruct(calls), [win, lwin] = windows(s);
    const cost = Float64Array.from(calls.map((a) => costs[a]));
    return piToObject(policyArr(cost, st, temp, win, lwin, new Float64Array(calls.length), s, fb), st);
  }
  function csum(f, c, x) { const t = f + x; if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f; return [t, c]; }
  function solveSitGame(M, ks, s, temp, bH, usage, fb) {
    const calls = Object.keys(M), nA = calls.length, nK = ks.length, st = callStruct(calls);
    const Mat = new Float64Array(nA * nK);
    for (let a = 0; a < nA; a++) for (let k = 0; k < nK; k++) Mat[a * nK + k] = M[calls[a]][ks[k]];
    const us = new Float64Array(nA); let nU = 0; const uvals = [];
    for (const key in (usage || {})) if (key in M) { us[calls.indexOf(key)] = usage[key]; uvals.push(usage[key]); }
    nU = psum(uvals);
    const b = new Float64Array(nK); if (bH) for (let k = 0; k < nK; k++) b[k] = bH[ks[k]] ?? 0.0;
    const [win, lwin] = windows(s);
    const cost = new Float64Array(nA), pi = new Float64Array(nA), pt = new Float64Array(nA), f = new Float64Array(nK), u = new Float64Array(nK);
    const phi = (sg) => {
      for (let a = 0; a < nA; a++) {
        let s_ = 0 + sg[0] * Mat[a * nK], c = 0.0;
        for (let k = 1; k < nK; k++) {
          const x = sg[k] * Mat[a * nK + k], t = s_ + x;
          if (Math.abs(s_) >= Math.abs(x)) c += (s_ - t) + x; else c += (x - t) + s_;
          s_ = t;
        }
        if (c && Number.isFinite(c)) s_ += c;
        cost[a] = s_;
      }
      return policyArr(cost, st, temp, win, lwin, pi, s, fb);
    };
    const response = (p_) => {   // f = sigma*(p~)
      for (let a = 0; a < nA; a++) pt[a] = nU ? (4 * p_[a] + us[a]) / (4 + nU) : p_[a];
      let mx = -Infinity;
      for (let k = 0; k < nK; k++) {
        let s_ = 0, c = 0.0, first = true;
        for (let a = 0; a < nA; a++) {
          if (pt[a] === 0) continue;
          const x = pt[a] * Mat[a * nK + k];
          if (first) { s_ = 0 + x; first = false; continue; }
          const t = s_ + x;
          if (Math.abs(s_) >= Math.abs(x)) c += (s_ - t) + x; else c += (x - t) + s_;
          s_ = t;
        }
        if (c && Number.isFinite(c)) s_ += c;
        u[k] = s_ / temp + b[k];
        if (u[k] > mx) mx = u[k];
      }
      let t = 0, c = 0.0;
      for (let k = 0; k < nK; k++) { f[k] = Math.exp(u[k] - mx); if (k === 0) t = 0 + f[k]; else [t, c] = csum(t, c, f[k]); }
      if (c && Number.isFinite(c)) t += c;
      for (let k = 0; k < nK; k++) f[k] = f[k] / t;
      return f;
    };
    let sg = new Float64Array(nK).fill(1.0 / nK);
    let w = 0.3, last = null, res = 0;
    const out = (sgv, r) => { const so = {}; for (let k = 0; k < nK; k++) so[ks[k]] = sgv[k]; return [piToObject(pi, st), so, r]; };
    for (let t = 0; t < QRE_ITERS; t++) {
      phi(sg); response(pi);
      res = -Infinity; for (let k = 0; k < nK; k++) res = Math.max(res, Math.abs(sg[k] - f[k]));
      if (res < QRE_TOL) return out(sg, res);
      if (last !== null && res > last) w = Math.max(QRE_WMIN, w / 2);
      last = res;
      const ns = new Float64Array(nK); for (let k = 0; k < nK; k++) ns[k] = (1 - w) * sg[k] + w * f[k];
      sg = ns;
    }
    phi(sg); response(pi);
    res = -Infinity; for (let k = 0; k < nK; k++) res = Math.max(res, Math.abs(sg[k] - f[k]));
    return out(sg, res);
  }
  // v0.9 item 9: a pitch that isn't landing today gives way when he is behind in the count or at 0-0 (engine.py
  // not_landing, land_block_count; v1.0 Step 7, Drew: otherwise it is still callable at any spot, for a strike too)
  const landBlockCount = (s) => s.balls > s.strikes || (s.balls === 0 && s.strikes === 0);
  const LAND_BLOCK_N = 4, LAND_BLOCK_EST = -0.15, LAND_BLOCK_K = 5.0;   // v1.0: a deviation from his own expectation; the
  // block is a rule with its own shrinkage, so it doesn't move with the fitted LAND_K (v1.0 Step 5)
  // v1.1 (Drew, Nov 12): the hold lifts once he has gone COMEBACK_N pitches without the pitch (mirror of engine.py)
  const COMEBACK_N = 8;
  const comeback = (p, s) => ((s.since_thrown || {})[p.name] || 0) >= COMEBACK_N;
  function notLanding(p, s) {
    const ev = s.landing_today ? landingTriple(p, s.landing_today[p.name]) : null;
    if (!ev || ev[ev.length - 1] < LAND_BLOCK_N) return false;
    const [st, ex, n] = ev;
    return (st - ex) / (LAND_BLOCK_K + n) <= LAND_BLOCK_EST;
  }
  // v1.0 #6 / D2: a shake-off means "not that pitch" at any spot; entries may be names or older [pitch, spot] pairs
  const shakenNames = (exclude) => new Set((exclude || []).map((e) => (typeof e === "string" ? e : e[0])));
  // v1.2.1 (Drew, Nov 14): pitches shaken off twice or more this at-bat (one exclude entry per shake), as engine.py
  function hardShaken(exclude) {
    const n = {};
    for (const e of exclude || []) { const k = typeof e === "string" ? e : e[0]; n[k] = (n[k] || 0) + 1; }
    return new Set(Object.keys(n).filter((k) => n[k] >= 2));
  }
  function allowedCalls(arsenal, s, exclude, extra) {
    const tq = targets(s.balls, s.strikes), ex = shakenNames(exclude);
    let out = [];
    for (const p of candidates(arsenal, s, undefined, extra)) if (!ex.has(p.name)) for (const q of tq) out.push(ck(p.name, q));
    if (s.landing_today && Object.keys(s.landing_today).length && out.length && landBlockCount(s)) {
      const names = new Set(out.map(skName));
      const bad = new Set(arsenal.filter((p) => names.has(p.name) && notLanding(p, s) && !comeback(p, s)).map((p) => p.name));
      if (bad.size && bad.size !== names.size) out = out.filter((a) => !bad.has(skName(a)));
    }
    return out;
  }

  // ---------------------------------------------------------------- 2.6-2.7 look, 6 planning table
  function vFb(arsenal, s) {
    const fbs = arsenal.filter((x) => isFastball(x.kind));
    let m = -Infinity; for (const x of (fbs.length ? fbs : arsenal)) m = Math.max(m, speedToday(x, s));
    return m;
  }
  // v1.0 #24: mirror of engine.py LOC_ROW_Y / look_update(y): the look follows the logged landing height when there is one
  const LOC_ROW_Y = [3.8, 3.2, 2.5, 1.8, 1.2];
  // v1.0 #7: mirror of engine.py loc_quad: the target a logged landing cell falls in (M2 keys earlier hard hits on it)
  function locQuad(cell, kind, batterRight) {
    const [r, c] = cell;
    if (r === 2 && c === 2) return "middle";
    if ((r === 4 && !isFastball(kind)) || (r === 0 && isFastball(kind))) return "chase";
    if (c === 2 && r >= 3) return "down-middle";   // low over the plate (v1.0 Step 7)
    const inside = batterRight ? c <= 1 : c >= 3;
    return (r <= 1 ? "up" : "down") + (inside ? "-in" : "-away");
  }
  // ---------------------------------------------------------------- v1.1 Step 3: setup and payoff rules (mirror of engine.py)
  const SETUP_RULE = { S1: 0.002, S2: 0.0, S3: 0.003, S4: 0.0, S5: 0.0, S6: 0.004, S7: 0.005, S9: 0.001, N2: 0.001 };   // v1.2 Step 5: S2 / S4 / S5 dropped (engine.py)   // v1.1 Step 4: halved (Drew: lower all sizes; engine.py SETUP_RULE)
  const SETUP_CAP = 0.02, TIE_CAP = 0.05;
  const S4_GAP = 8.0;   // v1.2 Step 5 (L7): engine.py S4_GAP
  const UPS = ["up-in", "up-away"], INS = ["up-in", "down-in"], AWAYS = ["up-away", "down-away"], STRIKE_RES = ["cstrike", "whiff", "foul"];
  function landedNear(e, kind) {
    const [, q, res, landed] = e;
    if (landed === "way") return false;
    if (landed === null || landed === undefined) return STRIKE_RES.includes(res);
    const [r, c, br] = landed;
    if (!(r >= 0 && r <= 4 && c >= 0 && c <= 4)) return false;   // v1.2: a directional "Way off" cell sits outside the grid
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr <= 4 && cc >= 0 && cc <= 4 && locQuad([rr, cc], kind, br) === q) return true;
    }
    return false;
  }
  const squaredUpEntry = (e) => (e[2] === "foul" && e[5] === "back") || e[4] === "hard";
  function onTimeOrEarly(e) {
    const res = e[2], rd = e[5];
    if (res === "foul") return rd !== "opposite";
    if (res === "whiff") return rd === "front";
    return res === "play";
  }
  function paCounts(log) {
    let b = 0, k = 0; const out = [];
    for (const e of log) {
      out.push([b, k]);
      if (e[2] === "ball") b++;
      else if (e[2] === "cstrike" || e[2] === "whiff" || (e[2] === "foul" && k < 2)) k++;
    }
    return out;
  }
  const fbRides = (x) => !!x && ((x.kind === "FB" && x.shape === "rides") || (x.kind === "FC" && x.shape === "ride"));
  function setupPayoff(p, q, s, arsenal) {   // [credit, rule, setup entry] (mirror of engine.py setup_payoff)
    const log = s.pa_log || [];
    if (!log.length || s.balls >= 3 || !targets(s.balls, s.strikes).includes(q)) return [0.0, null, null];
    if (!candidates(arsenal, s).includes(p) || notLanding(p, s)) return [0.0, null, null];
    const counts = paCounts(log), same = s.same_side, twoK = s.strikes === 2;
    let best = [0.0, null, null];
    const osLow = ["down-in", "down-away", "down-middle", "chase"].includes(q);
    const offer = (rule, e) => { const v = SETUP_RULE[rule] ?? 0.0; if (v > best[0]) best = [v, rule, e]; };
    for (let i = 0; i < log.length; i++) {
      const e = log[i], x = arsenal.find((y) => y.name === e[0]);
      if (!x || squaredUpEntry(e) || !landedNear(e, x.kind)) continue;
      const last = i === log.length - 1, bk = s.balls + "-" + s.strikes;
      if (fbRides(x) && UPS.includes(e[1]) && STRIKE_RES.includes(e[2]) && ["0-1", "1-1", "0-2", "1-2", "2-2"].includes(bk) && osLow
          && ((p.kind === "CB" && (p.shape === "12-6" || p.shape === "power")) || (p.kind === "CH" && (p.shape === "drop" || p.shape === "split"))))
        offer("S1", e);
      if (same && (x.kind === "SI" || (x.kind === "FB" && x.shape === "runs")) && INS.includes(e[1]) && !onTimeOrEarly(e)
          && p.kind === "SL" && (q === "down-away" || q === "chase"))
        offer("S2", e);
      if (!same && ((x.kind === "FC" && x.shape === "hard") || x.kind === "FB") && INS.includes(e[1]) && !onTimeOrEarly(e)
          && p.kind === "CH" && ["fade", "split", ""].includes(p.shape || "") && (q === "down-away" || q === "chase"))
        offer("S3", e);
      // v1.2 Step 5 (L7): the fastball away went for a strike, and the payoff is 8+ mph slower (engine.py S4)
      if (last && isFastball(x.kind) && x.kind !== "FC" && AWAYS.includes(e[1]) && STRIKE_RES.includes(e[2]) && (q === "down-away" || q === "chase")
          && ((p.kind === "CH" && p.shape !== "firm") || p.kind === "CB") && mph(x) - mph(p) >= S4_GAP && ((s.timing || {}).OS ?? 0.0) > -READ_T)
        offer("S4", e);
      if (last && i === 0 && e[2] === "cstrike" && (x.kind === "CB" || (x.kind === "SL" && x.shape === "gyro")) && bk === "0-1"
          && isFastball(p.kind) && q !== "chase")
        offer("S6", e);
      if (twoK && fbRides(x) && UPS.includes(e[1]) && (e[2] === "whiff" || e[2] === "foul") && !onTimeOrEarly(e) && fbRides(p) && q === "chase")
        offer("S7", e);
      if (twoK && counts[i][1] < 2 && isFastball(x.kind) && x.kind !== "SI" && (INS.includes(e[1]) || AWAYS.includes(e[1]))) {
        const sideIn = INS.includes(e[1]);
        if ((sideIn && p.kind === "FC" && INS.includes(q)) || (!sideIn && (p.kind === "SL" || p.kind === "FC") && (AWAYS.includes(q) || q === "chase")))
          offer("S9", e);
      }
      if (twoK && p.command >= 4 && !same && isOffspeed(x.kind) && (AWAYS.includes(e[1]) || e[1] === "chase")
          && ((p.kind === "SI" && INS.includes(q)) || (["SL", "CB", "FC"].includes(p.kind) && AWAYS.includes(q))))
        offer("S5", e);
    }
    let [credit, rule, ent] = best;
    const prev = arsenal.find((y) => y.name === log[log.length - 1][0]) || p;
    if (p.kind === "SI" && log[log.length - 1][0] && prev.kind === "CH") {
      const n2 = SETUP_RULE.N2 ?? 0.0;
      if (n2) { credit = credit - n2; if (!rule) { rule = "N2"; ent = log[log.length - 1]; } }
    }
    return [Math.min(credit, SETUP_CAP), rule, ent];
  }
  function enablesPayoff(a, arsenal, s, exclude) {
    const p = skName(a), q = skH(a);
    if (q === "chase" || s.strikes >= 2 || s.balls >= 3) return false;
    const ent = [p, q, "cstrike", null, null, null];
    const s2 = replace(s, { strikes: s.strikes + 1, pa_log: (s.pa_log || []).concat([ent]) });
    for (const b of allowedCalls(arsenal, s2, exclude)) {
      const [v, , e] = setupPayoff(byName(arsenal, skName(b)), skH(b), s2, arsenal);
      if (v > 0 && e === ent) return true;
    }
    return false;
  }
  function tieBreak(pi, full, arsenal, s, exclude, M) {   // mirror of engine.py tie_break
    if (s.balls >= 3 || s.strikes >= 2) return pi;
    const eps = INTENT_E * runScale(s.level);
    const keys = Object.keys(pi), live = keys.filter((a) => pi[a] > 0);
    const en = new Set(keys.filter((a) => enablesPayoff(a, arsenal, s, exclude)));
    if (!en.size || en.size === keys.length) return pi;
    const out = Object.assign({}, pi);
    let left = TIE_CAP;
    for (const A of [...en].sort((x, y) => full[x] - full[y])) {
      const Bs = live.filter((b) => !en.has(b)).sort((x, y) => Math.abs(full[x] - full[A]) - Math.abs(full[y] - full[A]));
      for (const B of Bs) {
        const gap = Math.abs(full[A] - full[B]);
        if (gap >= eps || left <= 0) continue;
        const mv = Math.min(out[B] * (1 - gap / eps), left);
        out[B] -= mv; out[A] += mv; left -= mv;
      }
    }
    if (M) {
      const ks = Object.keys(M[Object.keys(M)[0]]);
      const brv = (p_) => Math.max(...ks.map((k) => psum(Object.keys(M).map((a) => (p_[a] ?? 0.0) * M[a][k]))));
      const g = brv(out) - brv(pi);
      if (g > eps) { const t = eps / g; const o2 = {}; for (const a of keys) o2[a] = pi[a] + t * (out[a] - pi[a]); return o2; }
    }
    return out;
  }
  function lookUpdate(look, p, q, s, y) {
    const lam = P08.lam, vp = speedToday(p, s) + 0.5 * evAdj(p, q);
    return [lam * look[0] + (1 - lam) * vp, lam * look[1] + (1 - lam) * (y === undefined || y === null ? yTarget(q, p.kind) : y)];
  }
  function interpAxis(x, c) {
    if (x >= c[0]) return [[0, 1.0]];
    if (x <= c[c.length - 1]) return [[c.length - 1, 1.0]];
    for (let i = 0; i < c.length - 1; i++) {
      const hi = c[i], lo = c[i + 1];
      if (lo <= x && x <= hi) { const w = (x - lo) / (hi - lo); return [[i, w], [i + 1, 1 - w]]; }
    }
  }
  function Table(arsenal, s) {
    const bins = [];      // 2.6: values carry the hitter's look
    for (let iv = 0; iv < V_CENTERS.length; iv++) for (let iy = 0; iy < Y_CENTERS.length; iy++) bins.push(iv + "," + iy);
    return { ars: arsenal, s0: s, vfb: vFb(arsenal, s), bins, V: {}, N: {}, sigma: {}, h0: null, sweeps: 0, residuals: [] };
  }
  function binLook(tab, bn) {
    if (bn === "none") return tab.h0;
    const [iv, iy] = bn.split(",").map(Number);
    return [V_CENTERS[iv] * tab.vfb, Y_CENTERS[iy]];
  }
  const BINKEY = [["0,0", "0,1"], ["1,0", "1,1"], ["2,0", "2,1"]];
  function axisW(x, c, out) {   // interpAxis without allocation: out = [i0, w0, i1, w1], i1 = -1 when one center
    if (x >= c[0]) { out[0] = 0; out[1] = 1.0; out[2] = -1; return; }
    if (x <= c[c.length - 1]) { out[0] = c.length - 1; out[1] = 1.0; out[2] = -1; return; }
    for (let i = 0; i < c.length - 1; i++) {
      const hi = c[i], lo = c[i + 1];
      if (lo <= x && x <= hi) { const w = (x - lo) / (hi - lo); out[0] = i; out[1] = w; out[2] = i + 1; out[3] = 1 - w; return; }
    }
  }
  const AXV = [0, 0, 0, 0], AXY = [0, 0, 0, 0];
  function tabValue(tab, b, k, look, which) {
    const t = (which === "N" ? tab.N : tab.V)[cntKey(b, k)];
    axisW(look[0] / tab.vfb, V_CENTERS, AXV); axisW(look[1], Y_CENTERS, AXY);
    let tot = 0.0;
    for (let a = 0; a < 2; a++) {
      const iv = a === 0 ? AXV[0] : AXV[2]; if (iv < 0) break;
      const wv = a === 0 ? AXV[1] : AXV[3];
      for (let c = 0; c < 2; c++) {
        const iy = c === 0 ? AXY[0] : AXY[2]; if (iy < 0) break;
        const wy = c === 0 ? AXY[1] : AXY[3];
        tot += wv * wy * t[BINKEY[iv][iy]];
      }
    }
    return tot;
  }
  function stealCost(p, q, s, tab, nl) {
    const st = s.steal;
    const a = st.a * (st.runner === 2 ? 0.5 : 1.0);
    const y = yTarget(q, p.kind);
    const dL = RUN_GAME[s.level] ?? 0.08;
    const dT = st.t ? Math.min(0.15, Math.max(-0.15, 0.10 * (st.t - 1.4) / 0.2)) : 0.0;
    const pS = Math.min(0.95, Math.max(0.30, 0.64 + 0.20 * Math.min(1.0, Math.max(0.0, (4 - y) / 3)) + dL + dT));
    const [b1, b2, b3] = s.bases, o = s.outs;
    let safe, outB;
    if (st.runner === 2) { safe = [b1, false, true]; outB = [b1, false, b3]; } else { safe = [false, true, b3]; outB = [false, b2, b3]; }
    const here = tabValue(tab, s.balls, s.strikes, nl);
    const baseEnd = vEnd(s, o, s.bases, 0);
    const vSafe = here + vEnd(s, o, safe, 0) - baseEnd;
    const vCaught = o + 1 >= 3 ? vEnd(s, 3, [false, false, false], 0) : here + vEnd(s, o + 1, outB, 0) - baseEnd;
    return a * (pS * vSafe + (1 - pS) * vCaught - here);
  }
  function cost08(p, q, s, arsenal, tab, look, sit, myopic) {
    const s_ = s.look === look ? s : replace(s, { look });
    const P = outcomeProbs(p, q, s_, arsenal, null, null, sit);
    return [costFromP(p, q, s, tab, look, P, myopic), P];
  }
  function buildM(arsenal, sL, tab, look, calls, ks, withMyopic) {   // M[a][k] = C(a | pure sit k); one prep per call (speed)
    const M = {}, Mmy = withMyopic ? {} : null;
    for (const a of calls) {
      const p = byName(arsenal, skName(a)), q = skH(a), pr = opPrep(p, q, sL, arsenal, null, true);
      M[a] = {}; if (Mmy) Mmy[a] = {};
      for (const kk of ks) {
        const P = opEval(pr, p, q, sL, arsenal, pureSit(kk));
        M[a][kk] = costFromP(p, q, sL, tab, look, P, false);
        if (Mmy) Mmy[a][kk] = costFromP(p, q, sL, tab, look, P, true);
      }
    }
    return [M, Mmy];
  }
  // v1.0 D3: mirror of engine.py mashed(): a coaching rule (soft cost), separate from the fitted MM logits
  const MASHED_N = 2;
  const MASHED_PENALTY = 0.015;
  function targetHeight(q, kind) { return q === "middle" ? "middle" : (q.startsWith("up") || (q === "chase" && isFastball(kind))) ? "up" : "down"; }
  function mashed(p, q, s) {
    const m = s.matchup;
    if (!m || !Object.keys(m).length) return false;
    const h = targetHeight(q, p.kind);
    let n = 0; for (const x of QUADS) if (targetHeight(x, p.kind) === h) n += m["hard|" + keyKind(p.kind) + "|" + x] || 0;
    return n >= MASHED_N;
  }
  // v1.0 Step 7: mirror of engine.py's ground-ball rule (a coach rule, not a fit)
  const GB_RULE_BONUS = 0.005, GB_RULE_TARGETS = ["down-in", "down-away", "down-middle"];
  const groundBallSpot = (s) => s.outs < 2 && (s.bases[0] || s.bases[2]) && s.balls < 3 && s.strikes < 2;
  // v1.0 Step 7 (Drew): the coaching reads, each a named soft credit (engine.py COACH_RULE and coach_credit)
  const COACH_RULE = { late_fb: 0.027, early_os: 0.02, crowd: 0.03, squared_up: 0.005, away: 0.012, went_back: 0.03, hot: 0.03, plus_opp: 0.015, ride_up_2k: 0.003 };   // v1.3 (ruling 5): ride_up_2k 0.008 -> 0.003 (engine.py)   // v1.1 Step 4: ride_up_2k (engine.py)   // v1.1 Step 2: away 0.01 -> 0.012 (engine.py)
  const READ_T = 0.2, HOT_EST = 0.10, SIDE_TARGETS = { in: ["up-in", "down-in"], away: ["up-away", "down-away"] };
  // v1.1: "lean on it" wears off once he has leaned (mirror of engine.py HOT_FADE / hot_fade)
  const HOT_FADE = [1.2, 1.6];   // v1.2 Step 5 (L6): by ratio to the normal share (engine.py)
  function hotFade(p, s, arsenal) {
    const lt = s.landing_today || {};
    if (!arsenal || !(p.name in lt)) return 1.0;
    const ns = {}; let sum = 0;
    for (const x of arsenal) if (x.name in lt) { ns[x.name] = landingTriple(x, lt[x.name])[2]; sum += ns[x.name]; }
    const total = Math.max(s.pitch_count || 0, sum);
    if (total <= 0) return 1.0;
    const fbs = arsenal.filter((x) => isFastball(x.kind)).length, oss = arsenal.length - fbs;
    const base = fbs && oss ? (isFastball(p.kind) ? 0.5 / fbs : 0.5 / oss) : 1.0 / arsenal.length;
    const ratio = (ns[p.name] || 0) / total / base;
    return Math.min(1.0, Math.max(0.0, 1.0 - (ratio - HOT_FADE[0]) / (HOT_FADE[1] - HOT_FADE[0])));
  }
  function landingHot(p, s) {
    const ev = s.landing_today ? landingTriple(p, s.landing_today[p.name]) : null;
    if (!ev || ev[ev.length - 1] < LAND_BLOCK_N) return false;
    const [st, ex, n] = ev;
    return (st - ex) / (LAND_BLOCK_K + n) >= HOT_EST;
  }
  // v1.1 Step 4 (Drew): a riding four-seam aimed up with two strikes is a strikeout pitch; a small coaching credit (engine.py ride_up_2k)
  function rideUp2k(p, q, s) {
    return p.kind === "FB" && p.shape === "rides" && s.strikes === 2 && s.balls < 3 && (q === "up-in" || q === "up-away" || q === "chase");
  }
  function coachCredit(p, q, s, arsenal) {
    const R = COACH_RULE, fb = isFastball(p.kind), tm = s.timing || {};
    let c = 0;
    if (fb && (tm.FB || 0) >= READ_T && ["up-in", "up-away", "down-in"].includes(q)) c += R.late_fb;
    if (!fb && (tm.OS || 0) <= -READ_T && ["down-in", "down-away", "down-middle", "chase"].includes(q)) c += R.early_os;
    if (fb && s.crowding && SIDE_TARGETS.in.includes(q)) c += R.crowd;
    if (s.last && s.last.length > 3 && s.last[3] === "back" && s.last[0] === p.name && s.last[1] === q) c -= R.squared_up;
    const m = s.matchup;
    if (m && Object.keys(m).length) {
      for (const [side, other] of [["in", "away"], ["away", "in"]]) {
        if (SIDE_TARGETS[other].includes(q) && SIDE_TARGETS[side].some((x) => m["hard|" + keyKind(p.kind) + "|" + x])) c += R.away;
      }
      if (m["succ|" + keyKind(p.kind) + "|" + q]) c += R.went_back;
    }
    if (s.landing_today && Object.keys(s.landing_today).length && landingHot(p, s)) c += R.hot * hotFade(p, s, arsenal);
    if (!s.same_side && p.grade >= 4 && ((p.kind === "CH" && (q === "down-away" || q === "chase")) || (p.kind === "SL" && q === "down-in"))) c += R.plus_opp;
    if (rideUp2k(p, q, s)) c += R.ride_up_2k * (RHO_L[s.level] ?? 1.0);   // v1.2 Step 5 (Q5): x RHO_L at HS / travel (engine.py)
    c -= pathCost(p, q, s);   // v1.2 Part B
    return c;
  }
  function costFromP(p, q, s, tab, look, P, myopic) {
    const b = s.balls, k = s.strikes, o = s.outs, B = s.bases;
    const nl = myopic ? tab.h0 : lookUpdate(look, p, q, s);
    const en = endsCached(tab, s), baseEnd = en.baseEnd;
    const tv = (b_, k_) => tabValue(tab, b_, k_, nl);
    let v = 0.0;
    v += P.ball * (b + 1 === 4 ? en.walkB : tv(b + 1, k));
    v += P.wp_ball * (b + 1 === 4 ? en.walkNb : tv(b + 1, k) + en.vNb - baseEnd);
    v += P.hbp * en.walkB;
    v += (P.cstrike + P.whiff) * (k + 1 === 3 ? en.kOut : tv(b, k + 1));
    v += P.foul * (k < 2 ? tv(b, k + 1) : tv(b, k));
    for (const c of ["weak", "solid", "hard"]) v += P[c] * ipvCached(tab, c, p, q, s);
    if (s.steal && (s.steal.a || 0) > 0) v += stealCost(p, q, s, tab, nl);
    if (s.matchup && mashed(p, q, s)) v += MASHED_PENALTY * runScale(s.level);   // v1.0 D3: mashed twice at this height today
    if (GB_RULE_TARGETS.includes(q) && groundBallSpot(s)) v -= GB_RULE_BONUS * runScale(s.level);   // v1.0 Step 7: ground-ball rule
    let cc = coachCredit(p, q, s, tab.ars);
    const sp = (s.pa_log && s.pa_log.length) ? setupPayoff(p, q, s, tab.ars)[0] : 0.0;   // v1.1 Step 3 (root only)
    if (sp) cc = sp > 0 ? Math.min(cc + sp, Math.max(cc, SETUP_CAP)) : cc + sp;
    if (cc) v -= cc * runScale(s.level);      // v1.0 Step 7: the coaching reads; v1.1: + setup credits
    if (s.level === "hs" || s.level === "travel") {
      const w_ = Math.min(1.0, Math.max(0.0, (s.pitch_count - (s.pitch_cap - 20)) / 20));
      if (w_ > 0) {
        const nxt = P.ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
          (P.cstrike + P.whiff) * (k + 1 === 3 ? 0 : tabValue(tab, b, k + 1, nl, "N")) +
          P.foul * tabValue(tab, b, Math.min(k + 1, 2), nl, "N") + P.wp_ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N"));
        v += 0.002 * runScale(s.level) * w_ * (1 + nxt);
      }
    }
    return v;
  }
  // Speed only: values that depend on the base-out state and objective but not on the count, look or sit are cached per
  // context (cached numbers are the same numbers). The context key is built once per situation object.
  const CTX_KEY = new WeakMap();
  function ctxOf(tab, s) {
    let key = CTX_KEY.get(s);
    if (key === undefined) {
      const w = s.win;
      key = s.outs + "|" + bitsOf(s.bases) + "|" + (s.infield_in ? 1 : 0) + "|" + s.level + "|" +
        (w && w.omega > 0 ? w.omega + "," + w.WE0 + "," + w.m0 + "," + w.margin0 : "0") + "|" +
        (((s.grades || GRADES_OVERRIDE) || {}).w ?? 3);
      CTX_KEY.set(s, key);
    }
    if (!tab.ctx) tab.ctx = new Map();
    let c = tab.ctx.get(key);
    if (!c) { c = { ipv: new Map(), ends: null }; tab.ctx.set(key, c); }
    return c;
  }
  function ipvCached(tab, c, p, q, s) {
    const cx = ctxOf(tab, s);
    let byP = cx.ipv.get(p);
    if (!byP) { byP = new Map(); cx.ipv.set(p, byP); }
    const qk = gbByCount(s.level) ? q + "|" + s.balls + "-" + s.strikes : q;   // v1.3 Part 2: a count table whose bip_gb varies by count
    let arr = byP.get(qk);
    if (!arr) {
      arr = ["weak", "solid", "hard"].map((cc) => inPlayValueTyped(cc, p, q, s));
      byP.set(qk, arr);
    }
    return arr[c === "weak" ? 0 : c === "solid" ? 1 : 2];
  }
  function endsCached(tab, s) {
    const cx = ctxOf(tab, s);
    if (!cx.ends) {
      const o = s.outs, B = s.bases, nb = [false, B[0], B[1]], r = B[2] ? 1 : 0;
      const walkEnd = (bases, runs) => { const [b1, b2, b3] = bases, r_ = (b1 && b2 && b3) ? 1 : 0; return vEnd(s, o, [true, b1 || b2, b3 || (b1 && b2)], runs + r_); };
      cx.ends = { baseEnd: vEnd(s, o, B, 0), walkB: walkEnd(B, 0), walkNb: walkEnd(nb, r), vNb: vEnd(s, o, nb, r), kOut: vEnd(s, o + 1, B, 0) };
    }
    return cx.ends;
  }
  function pitchesLeft(P, s, tab, nl) {
    const b = s.balls, k = s.strikes;
    return 1 + P.ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
      P.wp_ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
      (P.cstrike + P.whiff) * (k + 1 === 3 ? 0 : tabValue(tab, b, k + 1, nl, "N")) +
      P.foul * tabValue(tab, b, Math.min(k + 1, 2), nl, "N");
  }
  const PURE = new Map();
  const pureSit = (key) => { let r = PURE.get(key); if (!r) { r = ["pure", skName(key), skH(key)]; PURE.set(key, r); } return r; };
  function solveTable(arsenal, s, sweeps = 10, tol = 0.001) {
    checkInputs(arsenal, s);   // v1.0 #9, as in solve_table
    resolveSpeeds(arsenal);    // v1.1 Step 1b
    const tab = Table(arsenal, s);
    const order = COUNTS.slice().sort((a, b) => -(a[0] + a[1]) + (b[0] + b[1]));
    const ks = sitOptions(arsenal);
    const fb = fbNames(arsenal, s);   // v1.3 ruling 8 (null off HS / travel)
    for (const [b, k] of COUNTS) {
      const v0 = vEnd(s, s.outs, s.bases, 0) + D.CV[s.level][cntKey(b, k)];
      tab.V[cntKey(b, k)] = {}; tab.N[cntKey(b, k)] = {};
      for (const bn of tab.bins) { tab.V[cntKey(b, k)][bn] = v0; tab.N[cntKey(b, k)][bn] = 2.0; }
    }
    const prior = sitPrior(arsenal, replace(s, { balls: 0, strikes: 0, pa_log: [] }));
    tab.h0 = [psum(Object.keys(prior).map((key) => prior[key] * speedToday(byName(arsenal, skName(key)), s))), 2.5];
    for (let sw = 0; sw < sweeps; sw++) {
      let delta = 0.0;
      for (const [b, k] of order) {
        const sc = replace(s, { balls: b, strikes: k, last: null, pa_log: [], usage_this_count: {}, usage_by_call: {}, b_h: Object.assign({}, s.b_h) });
        const temp = temperature(arsenal, sc);
        const calls = allowedCalls(arsenal, sc);
        const scH = replace(sc, { look: tab.h0 });
        const [M] = buildM(arsenal, scH, tab, tab.h0, calls, ks, false);
        const [, sg, res] = solveSitGame(M, ks, sc, temp, sc.b_h);
        tab.sigma[cntKey(b, k)] = sg;
        tab.residuals.push(res);
        for (const bn of tab.bins) {
          const look = binLook(tab, bn), cs = {}, Ps = {}, scL = replace(sc, { look }), mix = ["mix", sg];
          for (const a of calls) [cs[a], Ps[a]] = cost08(byName(arsenal, skName(a)), skH(a), scL, arsenal, tab, look, mix);
          const pol = policyFromCosts(cs, sc, temp, fb);
          const nv = psum(Object.keys(pol).map((a) => pol[a] * cs[a]));
          delta = Math.max(delta, Math.abs(nv - tab.V[cntKey(b, k)][bn]));
          tab.V[cntKey(b, k)][bn] = nv;
          tab.N[cntKey(b, k)][bn] = psum(Object.keys(pol).map((a) => pol[a] * pitchesLeft(Ps[a], sc, tab, lookUpdate(look, byName(arsenal, skName(a)), skH(a), sc))));
        }
      }
      const s00 = tab.sigma["0-0"];
      if (s00) tab.h0 = [psum(Object.keys(s00).map((key) => s00[key] * speedToday(byName(arsenal, skName(key)), s))), 2.5];
      tab.sweeps = sw + 1;
      if (delta < tol) break;
    }
    return tab;
  }
  // v1.2.2: with band pitches, the blend over each with / without combination (engine.py root_call); none: one solve
  function rootCall(arsenal, s, tab, exclude, lookValue = true) {
    const band = bandPitches(arsenal, s, exclude);
    if (!band.length) return rootSolve(arsenal, s, tab, exclude, lookValue, []);
    const w = {}; for (const x of arsenal) if (band.includes(x.name)) w[x.name] = bandWeight(x, s);
    const acc = {}, M = {}, cache = {};
    let best = null, bw = -1.0;
    for (let k = 0; k <= band.length; k++) {
      for (const S of combos(band, k)) {
        let wt = 1.0;
        for (const n of band) wt *= S.includes(n) ? w[n] : 1.0 - w[n];
        if (wt < RAMP_MIN_W) continue;
        const [pi_, sg_, , res_, M_] = rootSolve(arsenal, s, tab, exclude, lookValue, S, cache);
        for (const a in pi_) acc[a] = (acc[a] ?? 0.0) + wt * pi_[a];
        for (const a in M_) if (!(a in M)) M[a] = M_[a];
        if (wt > bw) { best = [sg_, res_]; bw = wt; }
      }
    }
    const t = psum(Object.values(acc));   // Python sum() (compensated), as everywhere in the parity code
    const pi = {}; for (const a in acc) pi[a] = acc[a] / t;
    const [sg, res] = best, ks = sitOptions(arsenal), full = {};
    for (const a in M) full[a] = psum(ks.map((kk) => sg[kk] * M[a][kk]));
    return [pi, sg, full, res, M];
  }
  function combos(xs, k) {   // itertools.combinations order
    const out = [];
    const rec = (start, cur) => {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < xs.length; i++) { cur.push(xs[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    return out;
  }
  function rootSolve(arsenal, s, tab, exclude, lookValue, extra, cache) {   // one root solve, trusted pitches plus extra (the v1.2.1 rootCall); cache: the blend's shared costs
    resolveSpeeds(arsenal);    // v1.1 Step 1b
    const ks = sitOptions(arsenal);
    const look = s.look || tab.h0;
    const temp = temperature(arsenal, s);
    let calls = allowedCalls(arsenal, s, exclude, extra);
    if (!calls.length) {   // v1.2.1: shaken once may come back; shaken twice this at-bat stays out while any pitch is left (engine.py)
      const hard = hardShaken(exclude), rest = arsenal.filter((x) => !hard.has(x.name));
      calls = hard.size && rest.length ? allowedCalls(rest, s) : allowedCalls(arsenal, s);
    }
    const sL = replace(s, { look });
    // v1.0 Step 2 (#1, #25): no guardrail cut; the never-pick window in policyFromCosts is the only rule (one operator)
    let M, Mmy;
    if (!cache) [M, Mmy] = buildM(arsenal, sL, tab, look, calls, ks, true);
    else {   // v1.2.2: the blend's combinations share one cost per call (engine.py)
      const need = calls.filter((a) => !(a in cache));
      if (need.length) { const [M1, My1] = buildM(arsenal, sL, tab, look, need, ks, true); for (const a of need) cache[a] = [M1[a], My1[a]]; }
      M = {}; Mmy = {}; for (const a of calls) { M[a] = cache[a][0]; Mmy[a] = cache[a][1]; }
    }
    if (s.balls === 3 || !lookValue) M = Mmy;   // three-ball counts rank by myopic cost (no setups)
    const fb = fbNames(arsenal, s);   // v1.3 ruling 8 (null off HS / travel)
    const [pi0, sg, res] = solveSitGame(M, ks, s, temp, s.b_h, s.usage_by_call);
    const full = {}; for (const a in M) full[a] = psum(ks.map((kk) => sg[kk] * M[a][kk]));
    const pi = applyFbFloor(tieBreak(pi0, full, arsenal, s, exclude, M), s, fb, full, temp);   // v1.1 Step 3 (E5); v1.3 ruling 8
    return [pi, sg, full, res, M];
  }
  function callV08(arsenal, s, opts = {}) {
    checkInputs(arsenal, s);
    resolveSpeeds(arsenal);    // v1.1 Step 1b
    const rng = opts.rng || Math.random;
    let s_ = s;
    if (!s_.win && s_.home !== null && s_.home !== undefined) s_ = replace(s_, { win: winConstants(s_) });
    const tab = opts.tab || solveTable(arsenal, replace(s_, { balls: 0, strikes: 0, last: null }));
    const [pi, sg, full, res, M] = rootCall(arsenal, s_, tab, opts.exclude);
    const pPitch = {};
    for (const a in pi) pPitch[skName(a)] = (pPitch[skName(a)] ?? 0.0) + pi[a];
    const keepN = new Set(Object.keys(pPitch).filter((n) => pPitch[n] > 0.005));
    let dist = [];
    for (const a in pi) if (keepN.has(skName(a)) && pi[a] > 0) dist.push({ prob: pi[a], cost: full[a], pitch: byName(arsenal, skName(a)), quad: skH(a) });
    const t = psum(dist.map((d) => d.prob));
    dist = dist.map((d) => Object.assign(d, { prob: d.prob / t }));
    dist.sort((a, b) => b.prob - a.prob);
    const r = rng();
    let acc = 0.0, pick = dist[dist.length - 1];
    for (const d of dist) { acc += d.prob; if (r <= acc) { pick = d; break; } }
    let best = Infinity; for (const a in full) if (full[a] < best) best = full[a];
    return { pick, dist, best, tab, info: { sigma: sg, residual: res, M, s: s_ } };
  }
  function rootCosts(arsenal, s, tab, sigma) {
    const ks = sitOptions(arsenal), sg = sigma || tab.sigma[cntKey(s.balls, s.strikes)], look = s.look || tab.h0, out = {};
    for (const a of allowedCalls(arsenal, s)) out[a] = psum(ks.filter((k) => sg[k] > 1e-4).map((k) => sg[k] * cost08(byName(arsenal, skName(a)), skH(a), s, arsenal, tab, look, pureSit(k))[0]));
    return out;
  }
  function frozenInputs(arsenal, s) {
    const conf = {}, wild = {};
    for (const x of arsenal) { conf[x.name] = x.conf; wild[x.name] = wildToday(x, s); }
    const out = { conf, wild, ump: s.ump_u, names: arsenal.map((x) => x.name).join("|"), outs: s.outs, bases: basesKey(s.bases),
      infield_in: !!s.infield_in, lean: leanKey(arsenal) };
    if (tagKey(s) !== "0,0,0") out.tags = tagKey(s);   // v1.2 Part B: only when a tag is set (engine.py)
    return out;
  }
  const tagKey = (s) => ["approach", "path", "offspeed"].map((k) => hitTag(s, k)).join(",");
  // v1.2: each pitch's lean and spread; a change re-solves the table (a frozen table from before leans = all at lean 0)
  const leanKey = (arsenal) => arsenal.map((x) => [x.lean_x || 0, x.lean_z || 0, spreadOf(x)].join(",")).join("|");
  function needsResolve(frozen, arsenal, s) {   // v1.0 #2: outs, bases and infield-in also force a re-solve
    if (!frozen || frozen.names !== arsenal.map((x) => x.name).join("|")) return true;
    if ((frozen.lean ?? arsenal.map(() => "0,0,1").join("|")) !== leanKey(arsenal)) return true;   // v1.2
    if ((frozen.tags ?? "0,0,0") !== tagKey(s)) return true;   // v1.2 Part B
    if (frozen.outs !== s.outs || frozen.bases !== basesKey(s.bases) || frozen.infield_in !== !!s.infield_in) return true;
    if (arsenal.some((x) => Math.abs(x.conf - frozen.conf[x.name]) > 0.10)) return true;
    if (arsenal.some((x) => Math.abs(wildToday(x, s) - frozen.wild[x.name]) > 0.10)) return true;
    return Math.abs(s.ump_u - frozen.ump) > 0.20;
  }
  function leanBh(arsenal, s, fooled = []) {   // 2.5 (v1.0 #18: the eta damage lean shipped at 0 and is gone)
    const out = {};
    for (const key of sitOptions(arsenal)) {
      const p = byName(arsenal, skName(key)), c = pclass(p.kind);
      const v = psum(fooled.filter((fc) => fc !== c).map(() => Math.log(1.3)));
      if (v) out[key] = v;
    }
    return out;
  }

  // ---------------------------------------------------------------- 7.1-7.2 win expectancy, 7.7 walk suggestion
  const WE_LEVEL = { travel: "hs", college: "college_d1", college_d2: "college_d3" };   // PLACEHOLDER_D2: D3's win tables (engine.py)
  const sched = (s) => s.sched_innings || ((s.level === "hs" || s.level === "travel") ? 7 : 9);
  const bitsOf = (b) => (b[0] ? 1 : 0) | (b[1] ? 2 : 0) | (b[2] ? 4 : 0);
  function weTab(level, N, xr) { return WE ? WE[(WE_LEVEL[level] || level) + "|" + N + "|" + (xr ? 1 : 0)] : null; }
  function wePitch(ctx, o, bases, margin, field) {
    const N = sched(ctx), t = weTab(ctx.level, N, ctx.extras_runner);
    const i = Math.min(Math.max(1, ctx.inning), N + 1);
    const half = t.tab[i + (ctx.home ? "t" : "b")];
    const mHome = ctx.home ? margin : -margin;
    const j = Math.max(-15, Math.min(15, mHome)) + 15;
    if (field === "L") return half.L[Math.min(o, 2) + "" + bitsOf(bases)][j];
    const v = o >= 3 ? half.E[j] : half.W[o + "" + bitsOf(bases)][j];
    return ctx.home ? v : 1.0 - v;
  }
  function winConstants(s) {
    if (s.home === null || s.home === undefined || !weTab(s.level, sched(s), s.extras_runner)) return null;
    const ctx = { level: s.level, inning: s.inning, home: s.home, sched_innings: s.sched_innings, extras_runner: s.extras_runner };
    const li = wePitch(ctx, s.outs, s.bases, s.margin, "L");
    const we0 = wePitch(ctx, s.outs, s.bases, s.margin);
    const m0 = Math.max(0.005, we0 - wePitch(ctx, s.outs, s.bases, s.margin - 1));
    return { omega: Math.min(1.0, Math.max(0.0, li - 1)), WE0: we0, m0, margin0: s.margin, LI: li, ctx };
  }
  function walkSuggestion(arsenal, s, tab) {
    const [b1, b2, b3] = s.bases, r_ = (b1 && b2 && b3) ? 1 : 0;
    const vWalk = vEnd(s, s.outs, [true, b1 || b2, b3 || (b1 && b2)], r_);
    const vPa = tabValue(tab, 0, 0, tab.h0);
    return [vWalk < vPa - 0.010 * runScale(s.level), vWalk, vPa];
  }

  // ---------------------------------------------------------------- 7.5 umpire, 8.2 grades (learners, A4)
  function takeStats(p, q, s, arsenal, sit) {
    const zo = {}, P = outcomeProbs(p, q, s, arsenal, null, null, sit, zo);
    const den = P.cstrike + P.ball + P.wp_ball + P.hbp;
    const pi = den > 0 ? P.cstrike / den : 0.0;
    const vals = ZONES.filter((z) => z in zo).map((z) => zo[z]);
    const tw = psum(vals.map((v) => v.L * (1 - v.S)));
    const d = tw > 0 ? psum(vals.filter((v) => v.cz).map((v) => v.L * (1 - v.S) * v.C * (1 - v.C))) / tw : 0.0;
    return [pi, d];
  }
  function mapLogitShift(obs, x0, priorMean, priorInfo, lo, hi, iters = 20) {
    const o = obs.filter(([, p_, d]) => p_ > 0 && p_ < 1 && d !== 0).map(([y, p_, d]) => [y, p_, d / (p_ * (1 - p_))]);
    let x = x0;
    for (let it = 0; it < iters; it++) {
      let sc = -priorInfo * (x - priorMean), inf = priorInfo;
      for (const [y, p_, a] of o) { const pp = sig(logit(p_) + a * (x - x0)); sc += (y - pp) * a; inf += pp * (1 - pp) * a * a; }
      if (inf <= 0) break;
      const step = sc / inf;
      x = Math.max(lo, Math.min(hi, x + step));
      if (Math.abs(step) < 1e-6) break;
    }
    return x;
  }
  const UMP_A0 = 200.0;   // v1.2.3: the umpire prior is worth 200 typical takes (was 20), as engine.py UMP_A0: one take moves u by at most ~0.1
  function umpEstimate(takes, level, u0 = 0.0, a0 = UMP_A0) {
    const ib = (SIM.I_BAR_UMP || {})[level] ?? 0.05;
    if (!takes.length) return u0;
    return mapLogitShift(takes, u0, u0, a0 * ib, -1.5, 1.5);
  }
  function gradeStats(p, q, s, arsenal, sit, grades) {
    const out = {};
    for (const g of ["c", "w", "d"]) {
      const gr = Object.assign({}, grades || {}); gr[g] = 3;
      const zo = {};
      outcomeProbs(p, q, replace(s, { grades: gr }), arsenal, null, null, sit, zo);
      const zs = ZONES.filter((z) => z in zo), vals = zs.map((z) => zo[z]);
      const sw = psum(vals.map((v) => v.L * v.S));
      const bipw = vals.map((v) => v.L * v.S * (1 - v.W) * (1 - v.F)), bip = psum(bipw);
      if (g === "c" && sw > 0) {
        const pw = psum(vals.map((v) => v.L * v.S * v.W)) / sw;
        out.c = [pw, -gval("g_c", s.level) * psum(vals.map((v) => v.L * v.S / sw * v.W * (1 - v.W)))];
      } else if (g === "w" && bip > 0) {
        const ph = psum(vals.map((v, i) => bipw[i] * v.H)) / bip;
        out.w = [ph, gval("g_w", s.level) * psum(vals.map((v, i) => bipw[i] / bip * v.H * (1 - v.H)))];
      } else if (g === "d") out.d = [sw, -gval("g_d", s.level) * psum(vals.filter((v) => v.offz).map((v) => v.L * v.S * (1 - v.S)))];
    }
    return out;
  }
  function gradeEstimate(obs, gCoach, I0, gPrev = null, nPitches = null) {
    const est = mapLogitShift(obs, 3.0, gCoach, I0, 1.0, 5.0);
    if ((nPitches !== null ? nPitches : obs.length) < 30) return [gCoach, est, false];
    if (Math.abs(est - gCoach) > 1.0) return [gPrev !== null ? gPrev : gCoach, est, true];
    const base = gPrev !== null ? gPrev : gCoach;
    return [Math.max(base - 0.5, Math.min(base + 0.5, est)), est, false];
  }

  // ---------------------------------------------------------------- 9 "why" line
  const WHY_PARAMS = { sit: ["sit_tW", "sit_hW", "sit_tH", "sit_hH", "sit_tS", "sit_hS"], timing: ["beta_T", "gamma_T"],
    "eye level": ["beta_E", "beta_E_S"], tunneling: ["beta_tun_whiff", "beta_tun_chase"], repeat: ["rep_whiff_same", "rep_whiff_other", "rep_same_spot"],
    familiarity: ["phi_FB", "phi_OS"], setup: [] };   // v1.1 Step 3: "setup" zeroes SETUP_RULE (not P08)
  function rootCostPair(arsenal, s, tab, a, b, sigma, myopic) {
    const look = s.look || tab.h0, ks = sitOptions(arsenal);
    const c = (x) => psum(ks.filter((k) => sigma[k] > 1e-4).map((k) => sigma[k] * cost08(byName(arsenal, skName(x)), skH(x), s, arsenal, tab, look, pureSit(k), myopic)[0]));
    return [c(a), c(b)];
  }
  // v1.0 Step 4 (#3): mirror of engine.py _explain: one comparison for the why line and the intent label
  function explain(arsenal, s, tab, pick, info, exclude) {
    const key = pick.pitch.name + "|" + pick.quad + "|" + [...(exclude || [])].map(String).sort().join(",");
    info.explain = info.explain || {};
    if (key in info.explain) return info.explain[key];
    const sigma = info.sigma, p = pick.pitch, q = pick.quad, a = ck(p.name, q);
    const allowed = Object.keys(info.M), calls = allowed.includes(a) ? allowed : allowed.concat([a]);
    const my = s.balls === 3;
    const cmy = {}; for (const x of calls) cmy[x] = rootCostOne(arsenal, s, tab, x, sigma, true);
    let cful = cmy; if (!my) { cful = {}; for (const x of calls) cful[x] = rootCostOne(arsenal, s, tab, x, sigma, false); }
    let bstar = allowed[0]; for (const x of allowed) if (cmy[x] < cmy[bstar]) bstar = x;
    const others = allowed.filter((x) => x !== a);
    let comp = null;
    if (bstar !== a) comp = bstar;
    else for (const x of others) if (comp === null || cmy[x] < cmy[comp]) comp = x;
    let label = intentFromCosts(s.balls, s.strikes, q, cmy[a], cmy[bstar], cful[a], cful[bstar], INTENT_E * runScale(s.level));
    const deltas = {};
    if (comp !== null) {
      const base = cful[a] - cful[comp];
      for (const term in WHY_PARAMS) {
        const saved = {}; for (const n of WHY_PARAMS[term]) saved[n] = P08[n];
        const savedSR = term === "setup" ? Object.assign({}, SETUP_RULE) : null;
        let ca, cb;
        try {
          for (const n of WHY_PARAMS[term]) P08[n] = 0.0;
          if (savedSR) for (const n in SETUP_RULE) SETUP_RULE[n] = 0.0;
          [ca, cb] = rootCostPair(arsenal, s, tab, a, comp, sigma, my);
        } finally { Object.assign(P08, saved); if (savedSR) Object.assign(SETUP_RULE, savedSR); }
        deltas[term] = base - (ca - cb);
      }
      if (!my) deltas["look value"] = base - (cmy[a] - cmy[comp]);
      for (const [term, sOff] of [["situation", replace(s, { win: null })], ["umpire", replace(s, { ump_u: 0.0 })],
        ["running game", replace(s, { steal: null })], ["grades", replace(s, { grades: null })]]) {
        const [ca, cb] = rootCostPair(arsenal, sOff, tab, a, comp, sigma, my);
        deltas[term] = base - (ca - cb);
      }
    }
    const sp = (s.pa_log && s.pa_log.length) ? setupPayoff(p, q, s, arsenal) : [0.0, null, null];
    const live = sp[0] > 0 && sp[1] !== "N2";
    if (live && s.balls < 3 && s.strikes < 2) label = "Payoff";   // v1.1 Step 3 (mirror of engine.py _explain)
    const out = { a, bstar, comp, cmy, cful, label, deltas, setup: live ? sp : null };
    info.explain[key] = out;
    return out;
  }
  function whyLine(arsenal, s, tab, pick, info, exclude) {
    const X = explain(arsenal, s, tab, pick, info, exclude), deltas = X.deltas, b = X.comp;
    const p = pick.pitch, q = pick.quad, look = s.look || tab.h0, sigma = info.sigma;
    if (X.setup) { const e = X.setup[2]; return [`Set up by the ${e[0].toLowerCase()} ${e[1]}: ${p.name.toLowerCase()} ${q}`, deltas, b]; }
    if (b === null) return ["Only call allowed here", {}, null];
    let term = null; for (const t in deltas) if (t !== "look value" && t !== "setup" && (term === null || deltas[t] < deltas[term])) term = t;
    if (deltas[term] >= -1e-6) return [X.cful[X.a] <= X.cful[b] + 1e-9 ? "Best call on its own merits" : "Mixed in so he can't sit on one pitch", deltas, b];
    let line;
    if (term === "timing") {
      const vs = psum(Object.keys(sigma).map((k) => sigma[k] * speedToday(byName(arsenal, skName(k)), s)));
      const vt = (1 - P08.alpha) * look[0] + P08.alpha * vs, vp = speedToday(p, s) + 0.5 * evAdj(p, q);
      line = `He's timed for ${vt.toFixed(0)} mph; this plays ${Math.abs(vt - vp).toFixed(0)} mph ${vt > vp ? "slower" : "faster"}`;
    } else if (term === "eye level") line = P08.beta_E < 0 ? "Stays at his eye level — a change costs here" : "Changes his eye level";
    else if (term === "familiarity") {
      const c_ = isOffspeed(byName(arsenal, skName(b)).kind) ? "OS" : "FB";
      line = `He's seen the ${skName(b).toLowerCase()} ${(s.familiar || {})[c_] || 0} times today`;
    } else if (term === "sit") {
      const byT = {}, byH = {};
      for (const k of Object.keys(sigma)) { byT[skName(k)] = (byT[skName(k)] ?? 0.0) + sigma[k]; byH[skH(k)] = (byH[skH(k)] ?? 0.0) + sigma[k]; }
      let topT = null; for (const n in byT) if (topT === null || byT[n] > byT[topT]) topT = n;
      if (topT !== p.name) line = `He's sitting ${topT.toLowerCase()} (${Math.round(100 * byT[topT])}%)`;
      else {
        let topH = null; for (const j in byH) if (j !== targetHeight(q, p.kind) && (topH === null || byH[j] > byH[topH])) topH = j;
        line = `He's looking ${topH} (${Math.round(100 * byH[topH])}%)`;
      }
    } else if (term === "situation") line = (s.bases[2] && s.win && Math.abs(s.margin) <= 1) ? "Tying run on third: need a strikeout or a ground ball"
      : s.margin > 0 ? "Game situation: protect the lead" : "Game situation: keep it close";
    else if (term === "umpire") line = `Today's umpire is calling ${s.ump_u > 0 ? "more" : "fewer"} strikes than usual`;
    else if (term === "running game") line = "Runner may go: a pitch he can throw on";
    else if (term === "grades") line = "Matches this hitter's scouting grades";
    else if (term === "repeat") line = "Back to what he just missed";
    else line = "Tunnels off the last pitch";
    return [line, deltas, b];
  }
  // v0.9 item 4: intent labels. DISPLAY ONLY (mirror of engine.py intent_label): nothing here feeds back into a call.
  const INTENT_E = 0.0005;
  const INTENT_TERMS = ["timing", "eye level", "repeat", "tunneling"];
  const INTENT_MECH = { timing: "of his timing", repeat: "he just saw it", tunneling: "it tunnels off the last pitch" };
  function intentMechText(m) {
    if (m === null) return "of the counts it leads to";
    if (m === "eye level") return P08.beta_E < 0 ? "it stays at his eye level" : "it changes his eye level";
    return INTENT_MECH[m];
  }
  function intentFromCosts(balls, strikes, quad, cMyA, cMyBest, cA, cBest, e) {
    if (balls === 3 && strikes < 2) return "Get it over";
    if (strikes === 2) return quad === "chase" ? "Expand" : "Finish";
    return quad === "chase" ? "Early off-zone" : "Get ahead";
  }
  function rootCostOne(arsenal, s, tab, x, sigma, myopic) {
    const look = s.look || tab.h0;
    return psum(sitOptions(arsenal).filter((k) => sigma[k] > 1e-4).map((k) => sigma[k] * cost08(byName(arsenal, skName(x)), skH(x), s, arsenal, tab, look, pureSit(k), myopic)[0]));
  }
  function intentLabel(arsenal, s, tab, pick, info, exclude) {
    const X = explain(arsenal, s, tab, pick, info, exclude), p = pick.pitch, q = pick.quad, label = X.label;
    let mech = null;
    if (label === "Early off-zone" && X.bstar !== X.a) {
      let bestD = -1e-9;
      for (const term of INTENT_TERMS) if (X.deltas[term] < bestD) { bestD = X.deltas[term]; mech = term; }
    }
    const pl = p.name.toLowerCase();
    let line;
    if (label === "Get ahead") line = `Best strike here: ${pl} ${q}`;
    else if (label === "Get it over") line = `Need a strike: ${pl} ${q} is the safest one`;
    else if (label === "Payoff") { const e = X.setup[2]; line = `Payoff: ${pl} ${q}, set up by the ${e[0].toLowerCase()} ${e[1]}`; }
    else if (label === "Expand") line = `Two strikes: ${pl} ${q}, off the zone`;
    else if (label === "Finish") line = `Put-away: ${pl} ${q}`;
    else line = `Off the zone early: ${pl} ${q}` + (mech ? `, because ${intentMechText(mech)}` : "");
    return [label, mech, line];
  }
  function gradeCallV08(arsenal, s, pitchName, quad, tab, opts = {}) {
    // the coach's own call priced the way v0.8 prices its calls: against the hitter's sit mix at the root, with the table
    const r = callV08(arsenal, s, Object.assign({ tab }, opts));
    const sg = r.info.sigma, costs = rootCosts(arsenal, r.info.s, tab, sg), ks = sitOptions(arsenal);
    const key = ck(pitchName, quad), p = byName(arsenal, pitchName);
    const look = r.info.s.look || tab.h0;
    const cHuman = key in costs ? costs[key] : psum(ks.filter((k) => sg[k] > 1e-4).map((k) => sg[k] * cost08(p, quad, r.info.s, arsenal, tab, look, pureSit(k))[0]));
    let best = Infinity; for (const a in r.info.M) { const c = psum(ks.map((k) => sg[k] * r.info.M[a][k])); if (c < best) best = c; }
    const tq = targets(s.balls, s.strikes), allowed = tq.includes(quad);
    let prob = 0; for (const d of r.dist) if (d.pitch.name === pitchName && d.quad === quad) prob += d.prob;
    return { call: pitchName + " " + quad, engine_prob: prob, runs_vs_best: cHuman - best, allowed,
      verdict: !allowed ? "costly" : prob >= 0.02 ? "in the engine's mix" : (cHuman - best <= 0.03 * runScale(s.level) ? "close" : "costly"),
      engine_top: r.dist.slice(0, 3).map((d) => [d.pitch.name, d.quad, d.prob]) };
  }
  const v08 = { psum, gradeCall: gradeCallV08, sitOptions, sitPrior, sitShift, speedToday, timingB, pairTerms, yTarget, countKappa, vEnd, typeMix, inPlayValueTyped,
    sitPayoff, sitResponse, exploitability, temperature, windows, policyFromCosts, solveSitGame, allowedCalls, lookUpdate,
    solveTable, tabValue, rootCall, callV08, coachCredit, COACH_RULE, hotFade, HOT_FADE, COMEBACK_N, comeback, allowedCalls, rootCosts, cost08, LOC_ROW_Y, locQuad, frozenInputs, needsResolve, leanBh, winConstants, wePitch, walkSuggestion,
    takeStats, umpEstimate, gradeStats, gradeEstimate, mapLogitShift, whyLine, intentLabel, intentFromCosts, setupPayoff, SETUP_RULE, tieBreak, enablesPayoff,
    get P08() { return P08; }, get SIM() { return SIM; }, setGradesOverride: (g) => { GRADES_OVERRIDE = g; } };

  const api = { VERSION, dataVersion, init, Pitch, Situation, QUADS, targets, COUNTS, landing, movement, tunnelScore,
    outcomeProbs, candidates, stakesFactor, countStakes,
    runScale, re, updateConfidence, effective, TRAIT_KEYS, regressConfidence, pitcherStatus, isOffspeed, isBigSpot, landingEstimate, wildToday,
    expectedStrike, landingRecord, landingTriple, ballConfEvent,
    v08, callV08, solveTable, whyLine, intentLabel,
    KINDS, FASTBALL_KINDS, SHAPE_TAGS, MIGRATE_BY_TYPE, MIGRATE_BY_TAG, V10_TYPE_TAGS, migratePitch,
    PROFILES, PROFILE_T, MOVE_RATIO, PROFILE_NAMES, profile, defaultMph, primaryFb, relShape, tagFor, mph, resolveSpeeds, isFastball, pclass, keyKind,
    v11profileTerms: profileTerms, ptKey, gbRate,   // v1.1 Step 2
    v11terms: { PT_C, PT_B, PT_FBZ_W, PT_FBZ_H, PT_FBL_H, PT_PLAT, PT_CHASE_OPP, PT_CHASE_MEAN, GB_PROFILE, SLOT_ANGLE, PT_FB_IVB, SLOT_MOVE },
    classTerms,
    v12: { landingPre, leanDelta, leanHbpWp, geoNcdf, geoShares, geoSigma, geoTarget, geoHbpWeight, hasLean, leanKey,
      LEAN_MAX, SPREAD_MIN, SPREAD_MAX, HIT_FIT, HIT_PATH_RULE, HIT_OS_PRIOR, HIT_OS_N0, HIT_TAG_VALUES, hitTag, pathCost, damage, typeMix },   // v1.2 location model, Part B hitter tags
    v13tables: { versions: () => (D && D.TABLES ? D.TABLES.versions : null), zoneCells, countCells, mpCells: (level, b, k) => { const M = MP[level] || MP[TABLE_LEVEL_ALIAS[level]], c = b + "-" + k; return [M.swing[c], M.whiff[c], M.foul[c], M.cstrike[c], M.bip_gb[c]]; }, countBaseOut, zoneProfile, countGroup, hangerGate, pitchVeloFactors, fbFloor, fbNames, applyFbFloor, policyFromCosts } };   // v1.3 Part 2
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PitchEngine = api;
})(typeof window !== "undefined" ? window : this);
