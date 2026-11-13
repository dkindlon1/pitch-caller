// Renders the "Inside the call" 3D shot offline into PNG frames (plus where its labels point), for one screen shape.
//   node scripts/render-inside.cjs <set> <lw> <lh> <scale> <frames> <subs> [from] [to]
// STEP (px per motion-blur subframe, default 2) and MAXSUBS (default 48) trade quality for time.
// Needs the harness bundled into $RENDER_WWW (default /home/claude/inside_render/www) and served on $RENDER_URL.
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const [set, lw, lh, scale, N, subs] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7]];
  const from = +(process.argv[8] || 0), to = +(process.argv[9] || N);
  const outDir = path.join(process.env.RENDER_OUT || "/home/claude/inside_render/out4", set);
  fs.mkdirSync(outDir, { recursive: true });
  const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--force-color-profile=srgb"] });
  const pg = await br.newPage({ viewport: { width: 400, height: 300 } });
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await pg.goto(process.env.RENDER_URL || "http://localhost:3300/");
  const info = await pg.evaluate(([a, b, c]) => window.setup(a, b, c), [lw, lh, scale]);
  fs.writeFileSync(path.join(outDir, "info.json"), JSON.stringify({ set, lw, lh, scale, frames: N, subs, ...info }));
  const du = 1 / (N - 1);
  for (let i = from; i < to; i++) {
    const f = path.join(outDir, String(i + 1).padStart(4, "0") + ".png");
    if (fs.existsSync(f) && !process.env.FORCE) continue;
    const t0 = Date.now(), u = i / (N - 1), still = i === 0 || i === N - 1;   // the two docking frames stand still
    const r = await pg.evaluate(([u, du, s, st, mx]) => window.frame(u, du, s, 0.6, st, mx), [u, still ? 0 : du, subs, +(process.env.STEP || 2), +(process.env.MAXSUBS || 48)]);
    fs.writeFileSync(f, Buffer.from(r.png, "base64"));
    fs.writeFileSync(f.replace(/\.png$/, ".json"), JSON.stringify(r.anchors));
    console.log(set, i, r.subs + " subs", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  }
  if (errs.length) console.log("ERRORS", errs.slice(0, 5).join("\n"));
  await br.close();
})();
