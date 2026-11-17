/*
 * The final check's measured half: accessibility (axe-core at several scroll states), the document's head (title,
 * description, canonical, theme colour, share images, icons), every link and button target, the other public routes,
 * headings, focus order, zoom, and console noise. Prints one line per finding; exits 1 on a serious or critical axe
 * violation. Run from the repo root against a running production build:
 *   node web/tests/final_audit.js [--url http://127.0.0.1:3210/] [--browser chromium|webkit|firefox] [--shots dir]
 */
const pw = require("playwright");
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg("--url", "http://127.0.0.1:3210/"), BROWSER = arg("--browser", "chromium"), SHOTS = arg("--shots", "");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js", { paths: [path.join(__dirname, "..")] }), "utf8");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const say = (ok, msg) => console.log((ok ? "  ok   " : "  FLAG ") + msg);

(async () => {
  const browser = await pw[BROWSER].launch(BROWSER === "chromium" ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {});
  const noise = [];
  const open = async (opts, url = URL_) => {
    const ctx = await browser.newContext(opts), page = await ctx.newPage();
    page.on("pageerror", (e) => noise.push("pageerror: " + e));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`); });
    page.on("response", (r) => { if (r.status() >= 400 && !/\/nope-/.test(r.url())) noise.push(`${r.status()} ${r.url()}`); });
    await page.goto(url, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await wait(1200);
    return { ctx, page };
  };
  const to = async (page, y) => { await page.evaluate((yy) => { if (window.__lenis) window.__lenis.scrollTo(yy, { immediate: true }); else scrollTo(0, yy); }, y); await wait(1400); };
  const axe = async (page, label) => {
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations", "incomplete"] }));
    const v = r.violations, hard = v.filter((x) => x.impact === "serious" || x.impact === "critical");
    bad += hard.length;
    say(!hard.length, `axe ${label}: ${v.length} violations (${hard.length} serious or critical), ${r.incomplete.length} to review by hand`);
    for (const x of v) console.log(`         ${x.impact} ${x.id}: ${x.nodes.length} node(s), e.g. ${x.nodes[0].target.join(" ")} :: ${(x.nodes[0].failureSummary || "").replace(/\s+/g, " ").slice(0, 200)}`);
    for (const x of r.incomplete) console.log(`         (review) ${x.id}: ${x.nodes.length} node(s), e.g. ${x.nodes[0].target.join(" ")}`);
  };

  for (const v of [{ name: "desktop", viewport: { width: 1440, height: 900 } }, { name: "phone", viewport: { width: 390, height: 844 }, isMobile: BROWSER !== "firefox" ? true : undefined, hasTouch: true }]) {
    console.log(`\n== ${BROWSER} ${v.name}`);
    const { name, ...opts } = v; if (opts.isMobile === undefined) delete opts.isMobile;
    const { ctx, page } = await open(opts);
    const film = await page.evaluate(() => { const f = document.getElementById("top"); return { top: f.offsetTop, h: f.offsetHeight - innerHeight }; });
    for (const p of [0, 0.17, 0.3, 0.42, 0.56, 0.72, 0.9]) { await to(page, film.top + p * film.h); await axe(page, `film ${p}`); }
    for (const id of ["at-bat", "wrists", "programs", "faq", "contact"]) {
      const s = await page.evaluate((i) => { const e = document.getElementById(i); return { top: e.getBoundingClientRect().top + scrollY, h: e.offsetHeight }; }, id);
      await to(page, s.top + Math.max(0, s.h - v.viewport.height) * 0.6); await axe(page, id);
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(900); await axe(page, "footer");
    if (name === "desktop") {
      console.log("\n== head");
      const head = await page.evaluate(() => {
        const m = (s) => document.querySelector(s)?.getAttribute("content") ?? null, l = (s) => [...document.querySelectorAll(s)].map((e) => `${e.getAttribute("rel")} ${e.getAttribute("href")} ${e.getAttribute("sizes") || ""} ${e.getAttribute("type") || ""}`);
        return { title: document.title, desc: m('meta[name="description"]'), canonical: document.querySelector('link[rel="canonical"]')?.href ?? null, theme: m('meta[name="theme-color"]'), viewport: m('meta[name="viewport"]'),
          og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((e) => [e.getAttribute("property"), e.content])), tw: Object.fromEntries([...document.querySelectorAll('meta[name^="twitter:"]')].map((e) => [e.name, e.content])),
          icons: l('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]'), lang: document.documentElement.lang, h1: document.querySelectorAll("h1").length,
          heads: [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => `${h.tagName} ${h.textContent.trim().slice(0, 50)}`), ld: document.querySelector('script[type="application/ld+json"]')?.textContent.length || 0 };
      });
      console.log(JSON.stringify(head, null, 1));
      for (const u of [head.og["og:image"], head.tw["twitter:image"], ...head.icons.map((i) => i.split(" ")[1])].filter(Boolean)) { const r = await page.request.get(new URL(u, URL_).href.replace(/^https?:\/\/[^/]+/, URL_.replace(/\/$/, ""))); say(r.ok(), `${r.status()} ${u} (${(r.headers()["content-type"] || "")})`); }
      for (const u of ["robots.txt", "sitemap.xml", "favicon.ico", "apple-touch-icon.png", "manifest.webmanifest"]) { const r = await page.request.get(URL_ + u); say(r.ok(), `${r.status()} /${u}`); }
      console.log("\n== links and buttons");
      const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim().slice(0, 30), ok: a.getAttribute("href").startsWith("#") ? !!document.getElementById(a.getAttribute("href").slice(1)) : null })));
      for (const l of links) { if (l.ok === null) { const r = await page.request.get(new URL(l.href, URL_).href); l.ok = r.ok(); l.status = r.status(); } }
      const broken = links.filter((l) => !l.ok);
      say(!broken.length, `${links.length} links, ${broken.length} that go nowhere ${JSON.stringify(broken)}`);
      const dead = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => !b.type || (b.type === "submit" && !b.closest("form"))).map((b) => b.textContent.trim().slice(0, 30)));
      say(!dead.length, `buttons without a type or a form: ${JSON.stringify(dead)}`);
      console.log("\n== anchor links land where they say");
      for (const id of ["pg", "at-bat", "wrists", "programs", "faq", "contact", "top"]) {
        await to(page, id === "top" ? 3000 : 0);
        await page.evaluate((i) => document.querySelector(`a[href="#${i}"]`).click(), id); await wait(2600);
        const r = await page.evaluate((i) => { const e = document.getElementById(i), b = e.getBoundingClientRect(); return { top: Math.round(b.top), live: document.querySelector(".pq-pg")?.classList.contains("is-live"), focus: document.activeElement?.id, y: Math.round(scrollY) }; }, id);
        say(id === "pg" ? r.live : Math.abs(r.top) < 4, `#${id}: section top at ${r.top}px, scrollY ${r.y}, focus on #${r.focus}${id === "pg" ? `, playground live ${r.live}` : ""}`);
      }
    }
    await ctx.close();
  }

  console.log("\n== reduced motion");
  { const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }); await axe(page, "reduced desktop");
    say(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways overflow"); await ctx.close(); }
  { const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", hasTouch: true }); await axe(page, "reduced phone");
    say(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways overflow"); await ctx.close(); }

  console.log("\n== zoom to 200% (a 720x450 viewport is what a 1440x900 window gives at 200%)");
  { const { ctx, page } = await open({ viewport: { width: 720, height: 450 } });
    const film = await page.evaluate(() => { const f = document.getElementById("top"); return { top: f.offsetTop, h: f.offsetHeight - innerHeight }; });
    for (const p of [0, 0.17, 0.3, 0.42, 0.56, 0.72, 0.9]) {
      await to(page, film.top + p * film.h);
      const cut = await page.evaluate(() => [".pq-msg", ".pq-ledger", ".pq-chip", ".pq-explain", ".pq-pgtitle", ".pq-ctl", ".pq-mix"].flatMap((s) => [...document.querySelectorAll(s)].filter((e) => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) o *= +getComputedStyle(x).opacity; const r = e.getBoundingClientRect(); return o > 0.5 && (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1); }).map((e) => `${s} ${Math.round(e.getBoundingClientRect().top)}..${Math.round(e.getBoundingClientRect().bottom)} of ${innerHeight}`)));
      say(!cut.length, `film ${p}: ${cut.length ? "cut off: " + cut.join("; ") : "nothing cut off"}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `zoom200-film-${String(Math.round(p * 100)).padStart(3, "0")}.png`) });
    }
    say(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways overflow at 200%");
    await ctx.close(); }

  console.log("\n== other public routes");
  for (const r of ["nope-not-a-page", "privacy", "terms", "login"]) {
    const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } }, URL_ + r);
    const d = await page.evaluate(() => ({ title: document.title, bg: getComputedStyle(document.body).backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor, font: getComputedStyle(document.querySelector("h1") || document.body).fontFamily.slice(0, 60), h1: document.querySelector("h1")?.textContent.trim().slice(0, 60), home: !!document.querySelector('a[href="/"]') }));
    console.log(`  /${r}: ${JSON.stringify(d)}`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `route-${r}.png`) }); }
    await axe(page, `/${r}`);
    await ctx.close();
  }

  const uniq = [...new Set(noise)];
  console.log(`\n== console and network: ${uniq.length} distinct message(s)`);
  uniq.slice(0, 20).forEach((n) => console.log("   " + n.slice(0, 260)));
  await browser.close();
  console.log(bad ? `\n${bad} serious or critical axe violation(s)` : "\nno serious or critical axe violations");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
