/*
 * A Chrome performance trace of the first seconds of scrolling the public site, and a summary of where the time went.
 * Real Chrome with the real GPU (a window opens), 1440x900 at 2x by default. The scroll starts as soon as the page has
 * painted (or after --settle ms), with mouse-wheel notches, and runs for --secs seconds.
 *   node web/tests/perf_trace.js --url http://127.0.0.1:3197/ --out docs/site-v2-shots/perf --name before
 *     [--variant base|nolens|noglass|nofilter|noblend|bare]   switch effects off to price them
 *     [--settle 0]  ms to wait after first paint before the measured window opens     [--secs 5]  [--query hybrid=1]
 *     [--idle 0]    ms at the start of the window with no scrolling (the hybrid opening plays in them)
 *     [--phone]     390x844 at 3x, touch-sized wheel steps            [--video]   also record a .webm of the run
 *     [--net cable|4g]  throttle the network (cable: 10 Mbps, 40 ms; 4g: 1.6 Mbps, 150 ms)   [--cpu 4]  slow the CPU
 *     [--keep-trace] keep the raw trace JSON (large)                  [--headless]
 * Writes <out>/<name>.json (the summary) and prints it.
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const has = (n) => process.argv.includes(n);
const URL_ = arg("--url", "http://127.0.0.1:3197/"), OUT = arg("--out", "docs/site-v2-shots/perf"), NAME = arg("--name", "trace"), VARIANT = arg("--variant", "base");
const SECS = Number(arg("--secs", "5")), SETTLE = Number(arg("--settle", "0")), QUERY = arg("--query", ""), PHONE = has("--phone"), IDLE = Number(arg("--idle", "0"));
const NET = { cable: [10e6 / 8, 5e6 / 8, 40], "4g": [1.6e6 / 8, 750e3 / 8, 150] }[arg("--net", "")], CPU = Number(arg("--cpu", "0"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// effects switched off by a stylesheet (and ?nolens for the SVG refraction), so nothing in the app changes
const OFF = {
  base: "",
  nolens: "",
  noglass: ".pq-glass{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}",
  nofilter: ".pq-film *{filter:none!important}",
  noblend: ".pq-light,.pq-pglight{mix-blend-mode:normal!important;display:none!important}",
  bare: ".pq-glass{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.pq-film *{filter:none!important}.pq-light,.pq-pglight{display:none!important}",
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const view = PHONE ? { width: 390, height: 844, scale: 3 } : { width: 1440, height: 900, scale: 2 };
  const browser = await chromium.launch({ channel: "chrome", headless: has("--headless"), args: [`--window-size=${view.width + 40},${view.height + 140}`, "--window-position=0,0", "--disable-extensions"] });
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale, isMobile: PHONE, hasTouch: PHONE,
    ...(has("--video") ? { recordVideo: { dir: OUT, size: { width: view.width, height: view.height } } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((css) => {
    // frame times, long tasks, and what the film shows against what the scroll asks for
    const P = (window.__perf = { raf: [], long: [], loaf: [], film: [], t0: 0 });
    let last = 0;
    const loop = (t) => {
      if (P.t0) {
        P.raf.push(t - last);
        const cv = document.querySelector(".pq-cv"), f = document.getElementById("top");
        if (cv && f) P.film.push([Math.round(t - P.t0), Number(cv.dataset.frame || 0), Number(cv.dataset.want || 0), cv.dataset.sharp || "", scrollY / (f.offsetHeight - innerHeight)]);
      }
      last = t; requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true }); } catch {}
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.loaf.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.startTime + e.duration - e.renderStart), style: Math.round(e.startTime + e.duration - e.styleAndLayoutStart),
      scripts: (e.scripts || []).map((s) => ({ dur: Math.round(s.duration), src: (s.sourceURL || "").split("/").pop().slice(0, 40), fn: s.sourceFunctionName, inv: s.invoker.slice(0, 60) })).filter((s) => s.dur >= 5) }))).observe({ type: "long-animation-frame", buffered: true }); } catch {}
    if (css) document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); });
  }, OFF[VARIANT] ?? "");

  const cdp = await ctx.newCDPSession(page);
  if (NET) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: NET[0], uploadThroughput: NET[1], latency: NET[2] }); }
  if (CPU) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const tracePath = path.join(OUT, `${NAME}.trace.json`);
  await browser.startTracing(page, { path: tracePath, categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink", "blink.user_timing", "cc", "gpu", "viz", "benchmark", "loading", "v8", "latencyInfo", "disabled-by-default-v8.cpu_profiler"] });
  const q = [VARIANT === "nolens" || VARIANT === "bare" ? "nolens" : "", QUERY].filter(Boolean).join("&");
  await page.goto(URL_ + (q ? `?${q}` : ""), { waitUntil: "commit" });
  await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0, null, { timeout: 15000 });
  if (SETTLE) await wait(SETTLE);
  await page.mouse.move(view.width / 2, view.height / 2);
  const fcp = await page.evaluate(() => { const t = performance.now(); window.__perf.t0 = t; performance.mark("pq-scroll-start"); return { fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime, start: t }; });
  // wheel notches the way a mouse sends them: 100px each, eight a second (800 px/s)
  if (IDLE) await wait(IDLE);
  const t0 = Date.now() - IDLE; let ticks = Math.ceil(IDLE / 125);
  while (Date.now() - t0 < SECS * 1000) { await page.mouse.wheel(0, PHONE ? 60 : 100); ticks++; const due = t0 + ticks * 125; await wait(Math.max(0, due - Date.now())); }
  const data = await page.evaluate(() => { performance.mark("pq-scroll-end"); const P = window.__perf, t0 = P.t0, t1 = performance.now(); P.t0 = 0;
    const res = performance.getEntriesByType("resource").map((r) => ({ n: r.name.replace(location.origin, ""), s: Math.round(r.startTime), e: Math.round(r.responseEnd), kb: Math.round(r.transferSize / 1024) }));
    return { raf: P.raf, long: P.long, loaf: P.loaf, film: P.film, t0, t1, res, y: scrollY, canvas: (() => { const c = document.querySelector(".pq-cv"); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null; })(), dpr: devicePixelRatio, lenis: !!window.__lenis }; });
  await wait(300);
  await browser.stopTracing();
  const video = page.video();
  await ctx.close();
  if (video) { const dest = path.join(OUT, `${NAME}.webm`); fs.renameSync(await video.path(), dest); }
  await browser.close();

  // ---------- the summary ----------
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8")), ev = trace.traceEvents || trace;
  const mark = (n) => ev.find((e) => e.name === n && e.cat && e.cat.includes("blink.user_timing"));
  const m0 = mark("pq-scroll-start"), m1 = mark("pq-scroll-end");
  const T0 = m0.ts, T1 = m1 ? m1.ts : T0 + SECS * 1e6, rpid = m0.pid;
  const threads = {};
  for (const e of ev) if (e.ph === "M" && e.name === "thread_name") threads[`${e.pid}:${e.tid}`] = e.args.name;
  const procs = {};
  for (const e of ev) if (e.ph === "M" && e.name === "process_name") procs[e.pid] = e.args.name;
  const tname = (e) => threads[`${e.pid}:${e.tid}`] || "?";
  const inWin = (e) => e.ph === "X" && e.ts < T1 && e.ts + (e.dur || 0) > T0;
  const clip = (e) => (Math.min(T1, e.ts + (e.dur || 0)) - Math.max(T0, e.ts)) / 1000;
  const isMain = (e) => e.pid === rpid && tname(e) === "CrRendererMain";
  // how busy each thread was (top-level tasks only), in ms over the window
  const busy = {};
  for (const e of ev) if (inWin(e) && (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask" || e.name === "ThreadPool_RunTask")) {
    const k = `${procs[e.pid] || e.pid} / ${tname(e).replace(/\d+$/, "").replace(/Worker.*/, "Worker")}`; busy[k] = (busy[k] || 0) + clip(e);
  }
  // named work, total ms and count (these nest, so they are not exclusive of each other)
  const NAMES = ["FunctionCall", "EvaluateScript", "v8.compile", "V8.CompileCode", "TimerFire", "FireAnimationFrame", "EventDispatch", "UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "ParseHTML", "ParseAuthorStyleSheet", "MinorGC", "MajorGC", "V8.GC_SCAVENGER", "V8.GC_MARK_COMPACTOR",
    "Decode Image", "ImageDecodeTask", "Decode LazyPixelRef", "Draw LazyPixelRef", "ImageUploadTask", "RasterTask", "GPUTask", "DrawFrame", "Display::DrawAndSwap", "SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass", "DirectRenderer::DrawFrame", "SkiaRenderer::DrawRenderPass", "XHRReadyStateChange", "ResourceReceivedData", "HitTest"];
  const named = {};
  for (const e of ev) if (inWin(e) && NAMES.includes(e.name)) { const k = e.name + (isMain(e) ? " [main]" : ` [${tname(e).replace(/\d+$/, "").replace(/Worker.*/, "Worker")}]`); const o = (named[k] ||= { ms: 0, n: 0, max: 0 }); o.ms += clip(e); o.n++; o.max = Math.max(o.max, (e.dur || 0) / 1000); }
  // main-thread tasks over 16 ms and 50 ms, with the biggest thing inside each
  const tasks = ev.filter((e) => inWin(e) && isMain(e) && e.name === "RunTask" && e.dur >= 16000).sort((a, b) => b.dur - a.dur);
  const inside = (t) => { const kids = ev.filter((e) => e.ph === "X" && e.pid === t.pid && e.tid === t.tid && e.ts >= t.ts && e.ts + (e.dur || 0) <= t.ts + t.dur && e !== t && NAMES.concat(["v8.callFunction", "V8.DeserializeContext", "v8.run", "EvaluateScript", "v8.produceCache", "CpuProfiler::StartProfiling"]).includes(e.name)).sort((a, b) => b.dur - a.dur).slice(0, 3);
    return kids.map((k) => `${k.name} ${(k.dur / 1000).toFixed(0)}ms${k.args?.data?.url ? " " + String(k.args.data.url).split("/").pop().slice(0, 36) : ""}${k.args?.data?.functionName ? " " + k.args.data.functionName : ""}`).join("; "); };
  const longTasks = tasks.slice(0, 14).map((t) => ({ at: Math.round((t.ts - T0) / 1000), ms: Math.round(t.dur / 1000), what: inside(t) }));
  // frames: what the compositor presented and what it dropped
  let dropped = 0, presented = 0, partial = 0; const states = {};
  for (const e of ev) if (e.name === "PipelineReporter" && e.ph === "b" && e.pid === rpid && e.ts >= T0 && e.ts <= T1) {
    const r = e.args?.frame_reporter || e.args?.chrome_frame_reporter; if (!r) continue; const s = r.state; states[s] = (states[s] || 0) + 1;
    if (/DROPPED/.test(s)) { if (r.affects_smoothness) dropped++; } else if (/PARTIAL/.test(s)) partial++; else presented++;
  }
  // what reached the screen: the gaps between the display compositor's swaps, and the GPU thread's long tasks
  const gpuMain = (e) => procs[e.pid] === "GPU Process" && tname(e) === "CrGpuMain";
  const sw = ev.filter((e) => e.name === "Display::DrawAndSwap" && e.ts >= T0 && e.ts <= T1).map((e) => e.ts).sort((a, b) => a - b), gaps = sw.slice(1).map((x, i) => (x - sw[i]) / 1000), gs = gaps.slice().sort((a, b) => a - b), gp = (p) => +(gs[Math.min(gs.length - 1, Math.floor(gs.length * p))] || 0).toFixed(1);
  const gt = ev.filter((e) => inWin(e) && gpuMain(e) && e.name === "RunTask");
  const gpu = { mainBusyMs: Math.round(gt.reduce((a, e) => a + clip(e), 0)), tasksOver8ms: gt.filter((e) => e.dur > 8000).length, tasksOver16ms: gt.filter((e) => e.dur > 16000).length, maxMs: +Math.max(0, ...gt.map((e) => e.dur / 1000)).toFixed(1),
    longAt: gt.filter((e) => e.dur > 8000).map((e) => `${Math.round((e.ts - T0) / 1000)}ms:${Math.round(e.dur / 1000)}`).join(" ") };
  const swaps = { n: sw.length, p50: gp(0.5), p95: gp(0.95), p99: gp(0.99), max: gp(1), gapsOver12ms: gaps.filter((x) => x > 12).length, gapsOver20ms: gaps.filter((x) => x > 20).length, gapsOver34ms: gaps.filter((x) => x > 34).length, gapsOver50ms: gaps.filter((x) => x > 50).length,
    worstAt: gaps.map((g, i) => [g, (sw[i] - T0) / 1000]).filter((g) => g[0] > 20).map((g) => `${Math.round(g[1])}ms:${Math.round(g[0])}`).join(" ") };
  const decodes = ev.filter((e) => inWin(e) && e.name === "Decode Image").map((e) => e.dur / 1000), dl = ev.filter((e) => inWin(e) && e.name === "Decode LazyPixelRef").map((e) => e.dur / 1000);
  const raf = data.raf, sorted = raf.slice().sort((a, b) => a - b), pctl = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
  // the film: how far what is drawn is from what the scroll position asks for (150-frame film; A, B and T4 as in Film.tsx)
  const ft = (p) => (p < 0.36 ? (p / 0.36) * 0.507 : Math.min(1, 0.507 + ((p - 0.36) / 0.29) * 0.493));
  const lag = data.film.filter((f) => f[2]).map((f) => Math.abs(f[1] - f[2]));
  const shown = data.film.map((f) => f[1]), steps = shown.slice(1).map((x, i) => Math.abs(x - shown[i])).filter((d) => d > 0);
  const blank = data.film.filter((f) => !f[1]).length, firstShown = (data.film.find((f) => f[1]) || [null])[0];
  const behind = data.film.filter((f) => f[1]).map((f) => Math.abs(f[1] - 1 - ft(f[4]) * 149)), bs = behind.slice().sort((a, b) => a - b);
  const win = (r) => r.e >= data.t0 && r.s <= data.t1;
  const sum = {
    name: NAME, variant: VARIANT, idleMs: IDLE, net: arg("--net", "none"), cpu: CPU || 1, url: URL_ + (q ? `?${q}` : ""), viewport: `${view.width}x${view.height}@${view.scale}x`, dpr: data.dpr, canvas: data.canvas, seconds: +((data.t1 - data.t0) / 1000).toFixed(2),
    fcpMs: Math.round(fcp.fcp), scrollStartMs: Math.round(fcp.start), scrolledPx: Math.round(data.y), lenis: data.lenis,
    frames: { rafCount: raf.length, fps: +(raf.length / ((data.t1 - data.t0) / 1000)).toFixed(1), p50: +pctl(0.5).toFixed(1), p95: +pctl(0.95).toFixed(1), p99: +pctl(0.99).toFixed(1), max: +Math.max(0, ...raf).toFixed(1), over20ms: raf.filter((d) => d > 20).length, over34ms: raf.filter((d) => d > 34).length, over50ms: raf.filter((d) => d > 50).length,
      compositor: { presented, partial, droppedAffectingSmoothness: dropped, states }, swaps },
    gpu,
    mainThread: { tasksOver16ms: tasks.length, tasksOver50ms: tasks.filter((t) => t.dur >= 50000).length, longest: longTasks },
    busyMs: Object.fromEntries(Object.entries(busy).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v)])),
    workMs: Object.fromEntries(Object.entries(named).sort((a, b) => b[1].ms - a[1].ms).slice(0, 34).map(([k, v]) => [k, `${Math.round(v.ms)} ms in ${v.n} (max ${v.max.toFixed(1)})`])),
    imageDecode: { decodeImage: { n: decodes.length, totalMs: Math.round(decodes.reduce((a, b) => a + b, 0)), maxMs: +Math.max(0, ...decodes).toFixed(1) }, lazyPixelRef: { n: dl.length, totalMs: Math.round(dl.reduce((a, b) => a + b, 0)), maxMs: +Math.max(0, ...dl).toFixed(1) } },
    film: { samples: data.film.length, blankSamples: blank, firstFrameAtMs: firstShown, distinctFramesShown: new Set(shown).size, steps: steps.length, biggestStep: Math.max(0, ...steps), stepsOver2: steps.filter((d) => d > 2).length,
      framesFromScrollPosition: { mean: +(behind.reduce((a, b) => a + b, 0) / (behind.length || 1)).toFixed(1), p95: +(bs[Math.floor(bs.length * 0.95)] || 0).toFixed(1), max: +Math.max(0, ...behind).toFixed(1) },
      framesFromWanted: lag.length ? { mean: +(lag.reduce((a, b) => a + b, 0) / lag.length).toFixed(2), max: Math.max(...lag), samplesOff: lag.filter((d) => d >= 1).length } : "not reported by this build",
      sharpShare: data.film.some((f) => f[3]) ? +(data.film.filter((f) => f[3] === "1").length / data.film.length).toFixed(2) : "not reported by this build" },
    loafs: data.loaf.filter((l) => l.start + l.dur >= data.t0 && l.start <= data.t1).sort((a, b) => b.dur - a.dur).slice(0, 8),
    network: { duringScroll: data.res.filter(win).length, frames: data.res.filter((r) => win(r) && /film\/watch/.test(r.n)).length, kb: data.res.filter(win).reduce((a, r) => a + r.kb, 0), scripts: data.res.filter((r) => win(r) && /\.js/.test(r.n)).map((r) => `${r.n.split("/").pop().slice(0, 30)} ${r.kb}KB @${Math.round(r.s - data.t0)}ms`) },
    errors,
  };
  fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify(sum, null, 1));
  if (!has("--keep-trace")) fs.unlinkSync(tracePath);
  if (has("--brief")) console.log(JSON.stringify({ name: NAME, frames: { fps: sum.frames.fps, p99: sum.frames.p99, max: sum.frames.max, over20ms: sum.frames.over20ms, over50ms: sum.frames.over50ms, comp: sum.frames.compositor }, swaps, gpu, main: sum.mainThread, busy: sum.busyMs, decode: sum.imageDecode, film: sum.film, net: { n: sum.network.frames, kb: sum.network.kb } }, null, 1));
  else console.log(JSON.stringify(sum, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
