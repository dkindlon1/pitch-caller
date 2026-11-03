/* Import checks on made-up files shaped like TrackMan and Rapsodo exports. Run: node import_test.js */
const I = require("./import.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const g = (m, s) => m + s * (rnd() + rnd() + rnd() - 1.5);

// a right-hander: four-seam rides and runs arm side, slider sweeps glove side
const PITCHES = [["Fastball", 86, 17, 9, 2250, 40], ["Slider", 77, 2, -8, 2400, 20], ["ChangeUp", 78, 7, 14, 1800, 15]];
function trackman(signArm = 1, extraPitcher = false) {
  const head = "PitchNo,Date,Pitcher,PitcherThrows,TaggedPitchType,AutoPitchType,PitchCall,RelSpeed,SpinRate,RelHeight,RelSide,Extension,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide";
  const lines = [head]; let n = 0;
  for (const [t, v, ivb, hb, spin, cnt] of PITCHES) for (let i = 0; i < cnt; i++) {
    const relS = t === "Slider" ? 1.95 : 1.8;
    lines.push([++n, "2026-10-30", "\"Kindlon, Drew\"", "Right", t, t, rnd() < 0.5 ? "StrikeCalled" : "BallCalled", g(v, 2).toFixed(1), Math.round(g(spin, 80)), g(5.6, 0.1).toFixed(2), (signArm * g(relS, 0.08)).toFixed(2), g(6.1, 0.1).toFixed(2),
      g(ivb, 1.5).toFixed(1), (signArm * g(hb, 1.5)).toFixed(1), g(2.5, t === "Fastball" ? 0.7 : 1.1).toFixed(2), g(0, t === "Fastball" ? 0.6 : 0.9).toFixed(2)].join(","));
  }
  if (extraPitcher) for (let i = 0; i < 10; i++) lines.push([++n, "2026-10-30", "\"Someone, Else\"", "Left", "Fastball", "Fastball", "BallCalled", "80.0", 2000, 6, -2, 6, 12, -10, 2.5, 0].join(","));
  lines.push([++n, "2026-10-30", "\"Kindlon, Drew\"", "Right", "Undefined", "", "BallCalled", "70", "", "", "", "", "", "", "", ""].join(","));
  return lines.join("\n");
}

console.log("1. TrackMan file");
{
  const r = I.parse(trackman(1, true), { hand: "R", pitcherName: "Drew Kindlon" });
  const fb = r.byType.find((t) => t.type === "Four-seam"), sl = r.byType.find((t) => t.type === "Slider"), ch = r.byType.find((t) => t.type === "Changeup");
  console.log(`     ${r.source}: ${r.n} pitches; FB ${fb.velo} mph ${fb.ivb}/${fb.hb} in, SL ${sl.ivb}/${sl.hb}, CH ${ch.ivb}/${ch.hb}; zone FB ${fb.zonePct} -> command hint ${fb.commandHint}`);
  check(r.source === "TrackMan" && r.n === 75, "recognised TrackMan; kept his 75 pitches, dropped the other pitcher and the untagged row");
  check(Math.abs(fb.velo - 86) < 1 && Math.abs(fb.ivb - 17) < 1 && fb.hb > 6 && sl.hb < -5 && ch.hb > 10, "averages land where they should, arm side positive");
  check(sl.releaseOffset && Math.abs(sl.releaseOffset[0] - 1.8) < 1.0, `slider released ${sl.releaseOffset && sl.releaseOffset[0]} in. wider than his fastball (true 1.8)`);
  check(r.warnings.some((w) => w.includes("other pitchers")) && r.warnings.some((w) => w.includes("skipped")), "says what it left out");
}

console.log("2. Same pitcher, file with the opposite sign convention");
{
  const r = I.parse(trackman(-1), { hand: "R" });
  const fb = r.byType.find((t) => t.type === "Four-seam"), sl = r.byType.find((t) => t.type === "Slider");
  check(fb.hb > 6 && sl.hb < -5, `flipped to arm side positive (FB ${fb.hb}, SL ${sl.hb})`);
}

console.log("3. Rapsodo-style file: info lines on top, different names, locations in inches");
{
  const lines = ["Player Name:,Drew Kindlon", "Session:,Bullpen 10/30", "", "No,Date,Pitch Type,Is Strike,Strike Zone Side,Strike Zone Height,Velocity,Total Spin,VB (trajectory),HB (trajectory),Release Height,Release Side,Release Extension (ft)"];
  for (let i = 0; i < 30; i++) lines.push([i + 1, "10/30/2026", i % 3 ? "Fastball" : "Curveball", "YES", g(0, 8).toFixed(1), g(30, 9).toFixed(1), g(i % 3 ? 84 : 71, 1.5).toFixed(1), Math.round(g(2200, 60)), g(i % 3 ? 15 : -12, 1).toFixed(1), g(i % 3 ? 11 : -6, 1).toFixed(1), "5.4", "1.7", "6.0"].join(","));
  const r = I.parse(lines.join("\n"), { hand: "R" });
  const cb = r.byType.find((t) => t.type === "Curveball"), fb = r.byType.find((t) => t.type === "Four-seam");
  console.log(`     columns read: ${Object.entries(r.columns).map(([k, v]) => k + "=" + v).join(", ")}`);
  check(r.n === 30 && cb && fb && cb.ivb < -8 && fb.hb > 8 && Math.abs(fb.velo - 84) < 1.5, "found the header under the info lines and read the pitches");
  check(r.warnings.some((w) => w.includes("inches")) && fb.zonePct > 0.4, `plate location converted from inches (FB zone rate ${fb.zonePct})`);
}

console.log("4. Junk in, clear message out");
{
  let msg = ""; try { I.parse("a,b,c\n1,2,3"); } catch (e) { msg = e.message; }
  check(msg.startsWith("Couldn't find"), `"${msg}"`);
}

console.log("5. Opponent hitters sheet");
{
  const csv = 'Name,#,B,PA,AVG,OBP,SLG,SO,BB\n"Ortiz, Jay",4,L,120,.341,.452,.588,14,22\nSam Lee,12,S,80,.220,.300,.280,24,6\n,,,,\n';
  const hs = I.parseHitters(csv);
  check(hs.length === 2 && hs[0].name === "Ortiz, Jay" && hs[0].bats === "L" && hs[1].bats === "S" && hs[0].number === "4", "names (with commas), numbers from a # column, and bats");
  check(hs[0].stats.k_pct === 11.7 && hs[1].stats.bb_pct === 7.5 && hs[0].stats.obp === 0.452, `strikeout and walk counts turned into rates (${hs[0].stats.k_pct}%, ${hs[1].stats.bb_pct}%)`);
  const hs2 = I.parseHitters("Name,K%,BB%\nA,22%,9\n");
  check(hs2[0].stats.k_pct === 22 && hs2[0].stats.bb_pct === 9, "rates left alone");
}

console.log(fails ? `\n${fails} check(s) failed` : "\nall import checks passed");
process.exit(fails ? 1 : 0);
