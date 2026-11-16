"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { motion, reducedMotion } from "./motion";

// One smooth-scroll engine for the whole page: Lenis, stepped by the GSAP ticker so the scroll scenes and the scroll
// position are always computed in the same frame. Under reduced motion there is no Lenis and scrolling is the
// browser's own. In-page links scroll through Lenis; the scenes are measured again when fonts or late content settle.
declare global { interface Window { __lenis?: Lenis } }

export function Smooth() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    let lenis: Lenis | null = null;
    const tick = (t: number) => lenis?.raf(t * 1000);
    if (!reducedMotion()) {
      lenis = new Lenis({ lerp: motion().lerp });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      window.__lenis = lenis;
    }
    // something inside a pinned scene (the playground in the film) is reached by scrolling the scene to its moment
    const anchorY = (el: HTMLElement) => {
      const host = el.closest<HTMLElement>("[data-anchor]");
      return host && host !== el && !reducedMotion() ? host.getBoundingClientRect().top + window.scrollY + parseFloat(host.dataset.anchor!) * (host.offsetHeight - window.innerHeight) : null;
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement, host = t.closest?.<HTMLElement>("[data-anchor]");
      if (!host || !t.closest(".pq-pg") || t.closest(".pq-pg.is-live")) return;
      const y = anchorY(t); if (y != null) { if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y); }
    };
    document.addEventListener("focusin", onFocus);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const id = a.getAttribute("href")!.slice(1), el = id ? document.getElementById(id) : document.body;
      if (!el) return;
      e.preventDefault();
      history.pushState(null, "", `#${id}`);
      // a section can name the point inside itself a link should land on (the playground sits deep in the film)
      const y = anchorY(el) ?? el;
      if (lenis) lenis.scrollTo(y as number | HTMLElement, { duration: 1.4, easing: (x: number) => 1 - Math.pow(1 - x, 4) });
      else if (typeof y === "number") window.scrollTo(0, y); else el.scrollIntoView();
      // keyboard and screen-reader users land in the section they asked for
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);

    let dead = false, t = 0, last = document.body.scrollHeight;
    const refresh = () => { if (!dead) ScrollTrigger.refresh(); };
    document.fonts?.ready.then(refresh);
    if (document.readyState === "complete") refresh(); else window.addEventListener("load", refresh, { once: true });
    const ro = new ResizeObserver(() => {
      const h = document.body.scrollHeight;
      if (Math.abs(h - last) < 2) return;
      last = h; window.clearTimeout(t); t = window.setTimeout(refresh, 200);
    });
    ro.observe(document.body);
    return () => {
      dead = true; ro.disconnect(); window.clearTimeout(t); window.removeEventListener("load", refresh); document.removeEventListener("click", onClick); document.removeEventListener("focusin", onFocus);
      gsap.ticker.remove(tick); lenis?.destroy(); delete window.__lenis;
    };
  }, []);
  return null;
}
