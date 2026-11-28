// Writes lib/engine_data_d3.json: the engine's data with the win-expectancy tables (and V1.3's per-level count, pitch-mix and
// zone-cell tables) cut to college D3, the only level the site's demo plays. Everything else is kept whole. lib/engine_data_d3.test.ts checks the calls come out the same.
// Run from web/: node scripts/trim-engine-data.cjs
const fs = require("fs"), path = require("path");
const d = require("../lib/engine_data.json");
const out = { ...d, WE: Object.fromEntries(Object.entries(d.WE).filter(([k]) => k.startsWith("college_d3|"))) };
// V1.3's per-level tables (count layer, pitch mix, zone level cells) are cut to college D3 too (audit Nov 27: they added
// ~290 KB, all levels, to the site's largest script; the hybrid opening's CI time went over its budget)
const onlyD3 = (lv) => Object.fromEntries(Object.entries(lv).filter(([k]) => k === "college_d3"));
if (d.TABLES) {
  out.TABLES = { ...d.TABLES };
  for (const k of ["count", "mp"]) if (d.TABLES[k] && d.TABLES[k].levels) out.TABLES[k] = { ...d.TABLES[k], levels: onlyD3(d.TABLES[k].levels) };
  if (d.TABLES.zone && d.TABLES.zone.level_cells) out.TABLES.zone = { ...d.TABLES.zone, level_cells: onlyD3(d.TABLES.zone.level_cells) };
}
fs.writeFileSync(path.join(__dirname, "../lib/engine_data_d3.json"), JSON.stringify(out));
console.log("engine_data_d3.json:", Math.round(JSON.stringify(out).length / 1024), "KB (full:", Math.round(JSON.stringify(d).length / 1024), "KB)");
