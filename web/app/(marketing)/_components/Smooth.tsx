"use client";
import { useEffect } from "react";
import { loadKit, motion, reducedMotion } from "./motion";

// One smooth-scroll engine for the whole page: Lenis, stepped by the GSAP ticker so the scroll scenes and the scroll
// position are always computed in the same frame. Both arrive after the first paint (motion.ts, loadKit); until then,
// and under reduced motion, scrolling is the browser's own. In-page links scroll through Lenis when it is there; the
// scenes are measured again when fonts or late content settle.
type LenisLike = { raf(t: number): void; on(e: string, f: () => void): void; scrollTo(t: number | HTMLElement, o?: Record<string, unknown>): void; destroy(): void };
declare global { interface Window { __lenis?: LenisLike } }

export function Smooth() {
  useEffect(() => {
    let lenis: LenisLike | null = null, dead = false, t = 0, last = document.body.scrollHeight, undo = () => {};
    // something inside a pinned scene (the playground in the film) is reached by scrolling the scene to its moment
    const anchorY = (el: HTMLElement) => {
      const host = el.closest<HTMLElement>("[data-anchor]");
      return host && host !== el && !reducedMotion() ? host.getBoundingClientRect().top + window.scrollY + parseFloat(host.dataset.anchor!) * (host.offsetHeight - window.innerHeight) : null;
    };
    const onFocus = (e: FocusEvent) => {
      const tg = e.target as HTMLElement, host = tg.closest?.<HTMLElement>("[data-anchor]");
      if (!host || !tg.closest(".pq-pg") || tg.closest(".pq-pg.is-live")) return;
      const y = anchorY(tg); if (y != null) { if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y); }
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const id = a.getAttribute("href")!.slice(1), el = id ? document.getElementById(id) : document.body;
      if (!el) return;
      e.preventDefault();
      history.pushState(null, "", `#${id}`);
      const y = anchorY(el) ?? el;
      if (lenis) lenis.scrollTo(y, { duration: 1.4, easing: (x: number) => 1 - Math.pow(1 - x, 4) });
      else if (typeof y === "number") window.scrollTo(0, y); else el.scrollIntoView();
      // keyboard and screen-reader users land in the section they asked for
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onClick);

    loadKit().then(({ gsap, ScrollTrigger, Lenis }) => {
      if (dead) return;
      const tick = (time: number) => lenis?.raf(time * 1000);
      if (!reducedMotion()) {
        lenis = new Lenis({ lerp: motion().lerp, wheelMultiplier: motion().wheel }) as unknown as LenisLike;
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        window.__lenis = lenis;
      }
      const refresh = () => { if (!dead) ScrollTrigger.refresh(); };
      document.fonts?.ready.then(refresh);
      if (document.readyState === "complete") refresh(); else window.addEventListener("load", refresh, { once: true });
      const ro = new ResizeObserver(() => {
        const h = document.body.scrollHeight;
        if (Math.abs(h - last) < 2) return;
        last = h; window.clearTimeout(t); t = window.setTimeout(refresh, 200);
      });
      ro.observe(document.body);
      undo = () => { ro.disconnect(); window.removeEventListener("load", refresh); gsap.ticker.remove(tick); lenis?.destroy(); delete window.__lenis; };
    }).catch(() => {});
    return () => { dead = true; window.clearTimeout(t); document.removeEventListener("click", onClick); document.removeEventListener("focusin", onFocus); undo(); };
  }, []);
  return null;
}
