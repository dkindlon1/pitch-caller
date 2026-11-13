// Writes lib/engine_data_d3.json: the engine's data with the win-expectancy tables cut to college D3, the only level
// the site's demo plays. Everything else is kept whole. lib/engine_data_d3.test.ts checks the calls come out the same.
// Run from web/: node scripts/trim-engine-data.cjs
const fs = require("fs"), path = require("path");
const d = require("../lib/engine_data.json");
const out = { ...d, WE: Object.fromEntries(Object.entries(d.WE).filter(([k]) => k.startsWith("college_d3|"))) };
fs.writeFileSync(path.join(__dirname, "../lib/engine_data_d3.json"), JSON.stringify(out));
console.log("engine_data_d3.json:", Math.round(JSON.stringify(out).length / 1024), "KB (full:", Math.round(JSON.stringify(d).length / 1024), "KB)");
