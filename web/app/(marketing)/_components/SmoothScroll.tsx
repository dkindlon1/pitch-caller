"use client";

import { useEffect } from "react";

declare global { interface Window { __mkLenis?: { scrollTo: (target: number | HTMLElement, o?: { offset?: number; duration?: number }) => void } } }

// Lenis smooth scrolling, driven by GSAP's ticker so pinned scroll scenes stay in step with it. Off on touch screens
// (iPad and phones scroll natively and Lenis fights the finger) and under reduced motion.
export function SmoothScroll() {
  // every scroll scene is measured again once the web fonts and images have settled the page's real heights
  useEffect(() => {
    let dead = false;
    const refresh = () => import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => { if (!dead) ScrollTrigger.refresh(); });
    document.fonts?.ready.then(refresh);
    if (document.readyState === "complete") refresh(); else window.addEventListener("load", refresh, { once: true });
    // and whenever the page changes height later (the demo grows when its engine loads), debounced
    let t = 0, last = document.body.scrollHeight;
    const ro = new ResizeObserver(() => {
      const hgt = document.body.scrollHeight;
      if (Math.abs(hgt - last) < 2) return;
      last = hgt;
      window.clearTimeout(t);
      t = window.setTimeout(refresh, 200);
    });
    ro.observe(document.body);
    return () => { dead = true; ro.disconnect(); window.clearTimeout(t); window.removeEventListener("load", refresh); };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let dead = false;
    let cleanup = () => {};
    Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")]).then(([{ default: Lenis }, { gsap }, { ScrollTrigger }]) => {
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      // lerp rather than a fixed duration: each frame closes a share of the distance, which reads as one continuous glide
      // however fast the wheel ticks come in
      const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1 });
      window.__mkLenis = lenis;   // so in-page jumps (the at-bat rail) glide with the same scroller
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      // in-page links glide to their section and still update the address bar
      const onClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
        if (!a) return;
        const id = a.getAttribute("href")!;
        const el = id.length > 1 ? document.querySelector<HTMLElement>(id) : null;
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: 0 });
        history.pushState(null, "", id);
        el.focus({ preventScroll: true });
      };
      document.addEventListener("click", onClick);
      cleanup = () => { document.removeEventListener("click", onClick); gsap.ticker.remove(tick); lenis.destroy(); window.__mkLenis = undefined; };
    });
    return () => { dead = true; cleanup(); };
  }, []);
  return null;
}
