"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// A screen fills in (content rises, figures count up, charts draw) the first time it is opened in a visit, and never
// again: coming back to it shows it finished. The record is kept for the tab's session only.
const SEEN = "pq-seen:";
export function wasSeen(path: string) { try { return sessionStorage.getItem(SEEN + path) === "1"; } catch { return false; } }

// The portal's glass catches the light where the pointer is: sets --mx/--my on the glass panel under a mouse (the
// public site's GlassLight, for the signed-in screens). Touch screens and reduced motion skip it.
export function Motion() {
  const path = usePathname() || "";
  // mark a screen as seen once its first showing has had time to play; a revisit gets .is-seen (no entrance, no fills)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pq");
    if (!root) return;
    const seen = wasSeen(path);
    root.classList.toggle("is-seen", seen);
    if (seen) return;
    const t = window.setTimeout(() => { try { sessionStorage.setItem(SEEN + path, "1"); } catch { /* private mode: it just plays again */ } }, 1600);
    return () => clearTimeout(t);
  }, [path]);
  // the bar tightens once the page has scrolled, like the public site's
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".pq .pq-bar");
    if (!bar) return;
    let tight = false;
    const onScroll = () => { const t = window.scrollY > 24; if (t !== tight) { tight = t; bar.classList.toggle("is-tight", t); } };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
