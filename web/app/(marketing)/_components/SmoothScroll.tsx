"use client";

import { useEffect } from "react";

// Scrolling is the browser's own (no smooth-scroll library): it runs on the compositor thread, so it stays smooth and
// answers the wheel or finger at once even while the page is busy, and the scroll scenes follow it almost 1:1. This
// component keeps those scenes measured and warms up the heavy parts ahead of time.
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

  // the heavy parts further down (the at-bat's 3D, the demo's engine and tables, the staff cloud) are fetched and evaluated
  // while the visitor is still reading the top of the page, one per idle moment, so none of them freezes a scroll later
  useEffect(() => {
    const warm: (() => Promise<unknown>)[] = [
      () => import("./atbatScene"),
      () => Promise.all([import("@/lib/engine"), import("@/lib/engine_data_d3.json")]),
      () => import("@/app/components/cloud3d"),
    ];
    let dead = false, id = 0;
    const idle = (f: () => void): number => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 300) as unknown as number);
    const next = () => { const job = warm.shift(); if (!job || dead) return; id = idle(() => { if (!dead) job().catch(() => {}).finally(next); }); };
    const start = () => window.setTimeout(next, 1200);
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => { dead = true; if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id); window.removeEventListener("load", start); };
  }, []);
  return null;
}
