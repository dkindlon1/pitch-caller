"use client";
import { useEffect } from "react";

// The portal's glass catches the light where the pointer is: sets --mx/--my on the glass panel under a mouse (the
// public site's GlassLight, for the signed-in screens). Touch screens and reduced motion skip it.
export function Motion() {
  // the bar's menus (team switcher, account) close on Escape, which hands focus back to their button, and on a click
  // or tap anywhere outside them
  useEffect(() => {
    const open = () => [...document.querySelectorAll<HTMLDetailsElement>(".pq .pq-switch[open]")];
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of open()) { d.open = false; d.querySelector<HTMLElement>("summary")?.focus(); }
    };
    const onDown = (e: PointerEvent) => { for (const d of open()) if (!d.contains(e.target as Node)) d.open = false; };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, []);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lit: HTMLElement | null = null, raf = 0, ev: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const el = (ev.target as Element | null)?.closest?.<HTMLElement>(".pq .glass") ?? null;
      if (el !== lit) { lit?.classList.remove("is-lit"); lit = el; lit?.classList.add("is-lit"); }
      if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty("--mx", `${ev.clientX - r.left}px`); lit.style.setProperty("--my", `${ev.clientY - r.top}px`); }
    };
    const onMove = (e: PointerEvent) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    const onLeave = () => { lit?.classList.remove("is-lit"); lit = null; };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => { document.removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
