// Part 10 task 4: OUT_TABLE.college_d3 rows under powerRow at power 0 / 0.5 / 1.5 / -0.5: row sums and the out clamp.
const dir = process.argv[2] || "C:/dev/pc-final/app";
const HW = require(dir + "/worlds.js"), OT = require(dir + "/engine_data.json").V08.OUT_TABLE.college_d3;
for (const c of Object.keys(OT)) for (const t of Object.keys(OT[c])) {
  const row = OT[c][t], s0 = row.reduce((a, b) => a + b, 0);
  const out = [0.5, 1.5, 3.0].map((p) => { const r = HW.powerRow(row, p), [po, p1, p2, p3, phr] = row; const up = r[2] + r[3] + r[4] - p2 - p3 - phr; return `p${p}: sum ${r.reduce((a, b) => a + b, 0).toFixed(4)}${po - up < 0 ? " CLAMP" : ""}`; });
  console.log(c.padEnd(6), t.padEnd(3), row.map((x) => x.toFixed(3)).join(" "), "sum", s0.toFixed(4), "|", out.join(" | "));
}
