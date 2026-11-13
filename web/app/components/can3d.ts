// Whether to load a 3D scene: not with reduced motion, not on Data Saver, and only with WebGL. Everything 3D on the
// site has a flat version that the server renders, which is what these visitors keep.
export function can3d(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return false;
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// run f once the page has loaded and the browser is idle, so 3D never competes with the first paint
export function whenIdle(f: () => void): () => void {
  let id: number | undefined;
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  const go = () => { id = w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 3000 }) : window.setTimeout(f, 1200); };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  return () => { window.removeEventListener("load", go); if (id !== undefined) { if (w.cancelIdleCallback) w.cancelIdleCallback(id); window.clearTimeout(id); } };
}

// Heavy start-up work further down a page (building a 3D scene, initialising an engine) queued to run while the visitor
// isn't scrolling: once the page has loaded, in an idle moment, at least 450ms after the last scroll, one job per idle
// moment, in the order queued. Each job runs at most once; the returned function cancels it if it hasn't run yet.
const still: { f: () => void; dead: boolean }[] = [];
let lastScroll = 0, pumping = false, watching = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const w = window as Window & { requestIdleCallback?: (f: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number };
  const tick = () => {
    while (still.length && still[0].dead) still.shift();
    if (!still.length) { pumping = false; return; }
    const quiet = performance.now() - lastScroll;
    if (quiet < 450) { window.setTimeout(tick, 470 - quiet); return; }
    const run = () => {
      if (performance.now() - lastScroll < 450) { window.setTimeout(tick, 200); return; }   // a scroll began meanwhile
      const job = still.shift();
      if (job && !job.dead) { job.dead = true; try { job.f(); } catch { /* the job's own fallback still runs */ } }
      window.setTimeout(tick, 60);
    };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 }); else window.setTimeout(run, 200);
  };
  tick();
}
export function whenStill(f: () => void): () => void {
  const job = { f, dead: false };
  still.push(job);
  if (!watching) { watching = true; window.addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true }); }
  const go = () => window.setTimeout(pump, 900);
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  return () => { job.dead = true; };
}
