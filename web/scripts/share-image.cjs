/*
 * The share image (Open Graph and Twitter card, 1200x630) and the home-screen icon (180x180), drawn from the site's own
 * parts: its ground, its two lights, its fonts, its mark and the film's last frame. Run from web/ after the film or the
 * headline changes:
 *   node scripts/share-image.cjs
 * Writes app/(marketing)/opengraph-image.png, twitter-image.png and apple-icon.png. The words for screen readers are in
 * the two .alt.txt files next to them: change them together.
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), SITE = path.join(ROOT, "app", "(marketing)");
const b64 = (p) => fs.readFileSync(p).toString("base64");
const font = (f) => `data:font/woff2;base64,${b64(path.join(SITE, "fonts", f))}`;
const watch = `data:image/webp;base64,${b64(path.join(ROOT, "public/media/film/watch/head.webp"))}`;
const MARK = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#ecebe6"/><path d="M6.2 4.6c2.3 2 3.4 4.4 3.4 7.4s-1.1 5.4-3.4 7.4M17.8 4.6c-2.3 2-3.4 4.4-3.4 7.4s1.1 5.4 3.4 7.4" fill="none" stroke="#2f5bff" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const CARD = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: url(${font("archivo-site.woff2")}); font-weight: 600 900; font-stretch: 62% 110%; }
@font-face { font-family: Hanken; src: url(${font("hanken-site.woff2")}); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #0c0b0e; color: #ecebe6; font-family: Hanken, Arial, sans-serif; position: relative; }
.light { position: absolute; inset: 0; background:
  radial-gradient(420px 380px at 880px 320px, rgba(98, 240, 122, 0.3), rgba(98, 240, 122, 0.08) 55%, transparent 75%),
  radial-gradient(620px 520px at 900px 300px, rgba(47, 91, 255, 0.34), transparent 72%),
  radial-gradient(700px 500px at 120px 80px, rgba(20, 34, 79, 0.75), transparent 70%); }
.brand { position: absolute; left: 72px; top: 62px; display: flex; align-items: center; gap: 12px; font: 700 30px/1 Archivo; font-stretch: 108%; letter-spacing: -0.03em; }
h1 { position: absolute; left: 72px; top: 196px; font: 650 68px/1 Archivo; font-stretch: 108%; letter-spacing: -0.04em; }
p { position: absolute; left: 72px; top: 368px; width: 520px; font-size: 25px; line-height: 1.36; color: #c5c7cf; }
small { position: absolute; left: 72px; bottom: 54px; font-size: 17px; color: #a3a5ae; }
.w { position: absolute; left: 668px; top: -34px; width: 560px; height: 700px; }
.w img { width: 100%; height: 100%; display: block; }
.face { position: absolute; left: 24.5%; top: 29.6%; width: 51%; height: 40.8%; border-radius: 9%; background: #f4f4f3; color: #121214; display: grid; place-content: center; gap: 11px; text-align: center; font: 700 37px/1.06 Hanken; letter-spacing: 0.02em; }
.face i { display: block; width: 68px; height: 4px; margin: 0 auto; background: #121214; }
.face::after { content: ""; position: absolute; right: 5%; top: 5%; width: 13px; height: 13px; border-radius: 50%; background: #58e06c; }
</style><body><div class="light"></div>
<div class="brand">${MARK(34)}<span>PitchIQ</span></div>
<h1>Every pitch called.<br>Every call explained.</h1>
<p>Pitch calling for high school, travel and college baseball.</p>
<small>The watch is an illustration and a prototype.</small>
<div class="w"><img src="${watch}"><div class="face"><span>FASTBALL</span><i></i><span>OUTSIDE</span></div></div></body>`;

const ICON = `<!doctype html><meta charset="utf-8"><style>* { margin: 0; } body { width: 180px; height: 180px; background: #0c0b0e; display: grid; place-items: center; }</style><body>${MARK(132)}</body>`;

(async () => {
  const browser = await chromium.launch();
  const shoot = async (html, w, h, files) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png" });
    for (const f of files) { fs.writeFileSync(path.join(SITE, f), png); console.log(f, png.length, "bytes"); }
    await page.close();
  };
  await shoot(CARD, 1200, 630, ["opengraph-image.png", "twitter-image.png"]);
  await shoot(ICON, 180, 180, ["apple-icon.png"]);
  const alt = "PitchIQ: Every pitch called. Every call explained. A smartwatch on a dark ground, lit blue and green, with the call on its screen: fastball, outside. The watch is an illustration and a prototype.\n";
  fs.writeFileSync(path.join(SITE, "opengraph-image.alt.txt"), alt); fs.writeFileSync(path.join(SITE, "twitter-image.alt.txt"), alt);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
