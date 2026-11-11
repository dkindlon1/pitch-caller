"use client";

import { useEffect } from "react";

// Lenis smooth scrolling, driven by GSAP's ticker so pinned scroll scenes stay in step with it. Off on touch screens
// (iPad and phones scroll natively and Lenis fights the finger) and under reduced motion.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let dead = false;
    let cleanup = () => {};
    Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")]).then(([{ default: Lenis }, { gsap }, { ScrollTrigger }]) => {
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
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
      cleanup = () => { document.removeEventListener("click", onClick); gsap.ticker.remove(tick); lenis.destroy(); };
    });
    return () => { dead = true; cleanup(); };
  }, []);
  return null;
}
