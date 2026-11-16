import { useEffect, type DependencyList, type RefObject } from "react";

// Motion for the public site, in one place.
// 1. Tokens: the timing and easing values live with every other token in site.css (.pq { --m-* }); motion() reads
//    them once, so they are changed in one place.
// 2. The kit: GSAP (with ScrollTrigger, SplitText, Flip) and Lenis are not in the page's first bundle. loadKit() fetches
//    them after the first paint, so the headline and the first frame are on screen before any animation code runs.
//    useKit() is the hook the sections use: its setup runs once the kit is in, inside a GSAP context scoped to the
//    section, and everything it made is reverted when the component unmounts.
type Tokens = { out: string; soft: string; inn: string; move: string; durIn: number; durFlip: number; durLand: number; stagger: number; scrub: number | true; lerp: number; wheel: number };
let cached: Tokens | null = null;
export function motion(): Tokens {
  if (cached) return cached;
  const el = document.querySelector(".pq") || document.documentElement, cs = getComputedStyle(el);
  const s = (n: string, d: string) => cs.getPropertyValue(n).trim() || d, n = (k: string, d: number) => { const x = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(x) ? x : d; };   // (0 is a real value)
  cached = { out: s("--m-ease-out", "expo.out"), soft: s("--m-ease-soft", "power4.out"), inn: s("--m-ease-in", "power2.in"), move: s("--m-ease-move", "power3.inOut"),
    durIn: n("--m-dur-in", 0.9), durFlip: n("--m-dur-flip", 0.55), durLand: n("--m-dur-land", 0.5), stagger: n("--m-stagger", 0.07), scrub: n("--m-scrub", 0.12), lerp: n("--m-lerp", 0.18), wheel: n("--m-wheel", 1.1) };
  if (cached.scrub === 0) cached.scrub = true;      // a scrub of 0: the scenes follow the scroll directly
  // Pacing switches for trying the scroll feel on a preview, e.g. ?film=700&scrub=0.2&lerp=0.15&wheel=1.2
  // (no switch: the tokens above; Drew's pick on Nov 16 is film 575vh, scrub 0.12, lerp 0.18, wheel 1.1). scrub=0 means the scene follows the scroll directly.
  const scrub = tune("scrub", 0, 3), lerp = tune("lerp", 0.02, 1), wheel = tune("wheel", 0.5, 3);
  if (scrub !== null) cached.scrub = scrub === 0 ? true : scrub;
  if (lerp !== null) cached.lerp = lerp;
  if (wheel !== null) cached.wheel = wheel;
  return cached;
}
function tune(key: string, lo: number, hi: number): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get(key);
  if (v === null || v.trim() === "") return null;
  const x = parseFloat(v);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null;
}
// the film section's scroll length in vh, when ?film= is set (300 to 1400); null keeps the stylesheet's length
export const filmLength = () => tune("film", 300, 1400);
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const tallScreen = () => typeof window !== "undefined" && window.matchMedia("(max-aspect-ratio: 9/10)").matches;

export type Kit = {
  gsap: typeof import("gsap").gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
  SplitText: typeof import("gsap/SplitText").SplitText;
  Flip: typeof import("gsap/Flip").Flip;
  Lenis: typeof import("lenis").default;
};
let loading: Promise<Kit> | null = null;
let ready: Kit | null = null;
export const kit = () => ready;          // the kit if it has loaded (event handlers use this and skip the motion if not)
// resolved a moment after the browser reports its first contentful paint (never before it), or after two seconds
export const afterPaint = () => new Promise<void>((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; window.setTimeout(r, 60); } };
  try {
    const po = new PerformanceObserver((list) => { if (list.getEntries().some((e) => e.name === "first-contentful-paint")) { po.disconnect(); go(); } });
    po.observe({ type: "paint", buffered: true });
  } catch { requestAnimationFrame(() => requestAnimationFrame(go)); }
  window.setTimeout(go, 2000);
});
export function loadKit(): Promise<Kit> {
  loading ||= afterPaint()
    .then(() => Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText"), import("gsap/Flip"), import("lenis")]))
    .then(([g, st, sp, fl, le]) => {
      g.gsap.registerPlugin(st.ScrollTrigger, sp.SplitText, fl.Flip);
      ready = { gsap: g.gsap, ScrollTrigger: st.ScrollTrigger, SplitText: sp.SplitText, Flip: fl.Flip, Lenis: le.default };
      return ready;
    });
  return loading;
}
// Each section's setup runs in a task of its own, one after another, so the kit's arrival is a run of short tasks with
// room for a frame between them, not one long one (it can land while the visitor is already scrolling).
let line: Promise<unknown> = Promise.resolve();
const breath = () => new Promise<void>((r) => { requestAnimationFrame(() => window.setTimeout(r, 0)); window.setTimeout(r, 120); });      // (the timer: a hidden tab has no frames)
export function useKit(setup: (k: Kit) => void | (() => void), deps: DependencyList = [], scope?: RefObject<Element | null>) {
  useEffect(() => {
    let dead = false, off: void | (() => void), ctx: { revert(): void } | null = null;
    loadKit().then((k) => {
      line = line.then(breath).then(() => {
        if (dead) return;
        ctx = k.gsap.context(() => { off = setup(k); }, scope?.current || undefined);
      }).catch(() => {});
    }).catch(() => { /* no motion: the page is complete without it */ });
    return () => { dead = true; if (off) off(); ctx?.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
