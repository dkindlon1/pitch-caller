"use client";

import { useEffect } from "react";
import { whenStill } from "@/app/components/can3d";

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

  // the demo's engine and tables are fetched and evaluated in a quiet moment while the visitor is still up top (the
  // at-bat and the demo start themselves the same way)
  useEffect(() => whenStill(() => { Promise.all([import("@/lib/engine"), import("@/lib/engine_data_d3.json")]).catch(() => {}); }), []);
  return null;
}
