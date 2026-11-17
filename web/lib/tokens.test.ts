// The token drift test. Floodlight's colours, glass and motion live in lib/tokens/floodlight.json; the site, the portal
// and the game app all read stylesheets generated from it (scripts/tokens.mjs). These checks fail when a generated file
// is stale, when any stylesheet sets a shared token by hand, when the game app's build does not carry the tokens, or
// when the old look (seam red, Instrument Sans) comes back into the portal or the game app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore: a plain .mjs build script
import { build, WEB_OUT, APP_OUT, SOURCE } from "../scripts/tokens.mjs";

const WEB = join(import.meta.dirname, ".."), ROOT = join(WEB, "..");
const read = (p: string) => readFileSync(p, "utf8");
const tokens = JSON.parse(read(SOURCE));
const walk = (dir: string, out: string[] = []): string[] => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };

const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test("the generated stylesheets match the token source", () => {
  const { web, app } = build(tokens);
  assert.equal(read(WEB_OUT), web, "web/app/floodlight.css is stale: run node web/scripts/tokens.mjs");
  assert.equal(read(APP_OUT), app, "app/assets/floodlight.css is stale: run node web/scripts/tokens.mjs");
});

test("the site, the portal and the game app carry the same values", () => {
  const web = read(WEB_OUT), app = read(APP_OUT);
  const decl = (css: string, sel: string) => { const body = css.slice(css.indexOf(sel + " {")); return Object.fromEntries([...body.slice(0, body.indexOf("\n}")).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]])); };
  const w = decl(web, ".pq"), a = decl(app, ":root");
  assert.ok(Object.keys(w).length > 60);
  assert.deepEqual(a, w, "the game app's night values differ from the web's");
});

test("no stylesheet sets a shared token by hand", () => {
  const shared = new Set<string>([...read(WEB_OUT).matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
  shared.delete("glass-blur");   // the one value a surface may turn down: lighter blur on phones, iPads and the game screen
  const files = [join(WEB, "app/(marketing)/site.css"), join(WEB, "app/(marketing)/sections.css"), join(WEB, "app/portal.css"), join(ROOT, "app/index.src.html"), join(ROOT, "app/assets/game.css")];
  for (const f of files) {
    const hits = [...read(f).matchAll(/(?<![\w-])--([a-z0-9-]+)\s*:/g)].map((m) => m[1]).filter((n) => shared.has(n));
    assert.deepEqual([...new Set(hits)], [], `${f} redefines shared tokens`);
  }
});

test("the game app's source and build carry the generated tokens and both fonts", () => {
  const src = read(join(ROOT, "app/index.src.html")), dist = read(join(ROOT, "app/dist/pitch-caller.html"));
  assert.equal(src.split("/*__TOKENS__*/").length - 1, 1, "index.src.html needs exactly one /*__TOKENS__*/ marker");
  for (const f of ["archivo-app.woff2", "hanken-app.woff2"]) assert.ok(readFileSync(join(ROOT, "app/assets", f)).equals(readFileSync(join(WEB, "app/fonts", f))), `app/assets/${f} is not the portal's file`);
  assert.ok(dist.includes(read(APP_OUT).trim()), "app/dist/pitch-caller.html does not contain the current tokens: run python app/build.py");
  assert.ok(/font-family:\s*"Archivo"/.test(dist) && /font-family:\s*"Hanken Grotesk"/.test(dist), "both typefaces must be inlined in the game app");
  assert.ok(!/https?:\/\/fonts\.|url\(\s*["']?https?:/.test(dist), "the game app must not fetch fonts or images over the network");
});

test("seam red and Instrument Sans are gone from the portal and the game app", () => {
  const files = [join(WEB, "app/portal.css"), join(WEB, "app/portal-font.ts"), join(WEB, "lib/nav.ts"), ...walk(join(WEB, "app/app")), ...walk(join(WEB, "app/login")), ...walk(join(WEB, "app/join")), ...walk(join(WEB, "app/admin")),
    join(ROOT, "app/index.src.html"), join(ROOT, "app/assets/game.css"), join(ROOT, "app/build.py"), join(ROOT, "app/roster.js"), join(ROOT, "app/watch.js"), join(ROOT, "app/dist/pitch-caller.html")].filter((f) => /\.(css|tsx?|js|html|py)$/.test(f));
  for (const f of files) {
    const s = read(f);
    assert.ok(!/instrument[ _-]?sans/i.test(s), `${f} still names Instrument Sans`);
    assert.ok(!/#f04a3e|#ff7a6f|240,\s*74,\s*62|--seam\b/i.test(s), `${f} still carries seam red`);
  }
});

test("contrast: text is AA on its surfaces, and the day theme holds 7:1 on the call and the count", () => {
  for (const mode of ["night", "day"] as const) {
    const t = tokens[mode];
    for (const k of ["text", "text-2", "text-3", "text-4"]) for (const s of ["bg", "panel", "panel-2"]) assert.ok(contrast(t[k], t[s]) >= 4.5, `${mode} ${k} on ${s}: ${contrast(t[k], t[s]).toFixed(2)}`);
    for (const k of ["alert", "weigh-text"]) for (const s of ["bg", "panel"]) assert.ok(contrast(t[k], t[s]) >= 4.5, `${mode} ${k} on ${s}`);
    for (const [fg, bg] of [["on-land", "land"], ["on-weigh", "weigh"], ["on-alert", "alert"]]) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${mode} ${fg} on ${bg}`);
    for (const p of tokens.pitchOrder) for (const s of ["panel", "panel-2"]) assert.ok(contrast(t["p-" + p], t[s]) >= 3, `${mode} pitch ${p} on ${s}: ${contrast(t["p-" + p], t[s]).toFixed(2)}`);
  }
  const d = tokens.day;
  assert.ok(contrast(d.land, d.panel) >= 7 && contrast(d.land, d["panel-2"]) >= 7, "day call green under 7:1 on its card");
  assert.ok(contrast(d.text, d.panel) >= 7 && contrast(d.weigh, d.panel) >= 7, "day count / weighing blue under 7:1");
  assert.ok(contrast(tokens.night.land, tokens.night.panel) >= 7 && contrast(tokens.night.text, tokens.night.panel) >= 7);
});
