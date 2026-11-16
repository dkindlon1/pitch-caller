"use client";
import { useEffect } from "react";

// Two things every glass panel shares, set up once for the page.
// 1. The cursor's light: a soft highlight that follows the pointer across whichever panel it is over.
// 2. Real refraction at the glass edge, in Chromium only: an SVG displacement map used as the backdrop filter of
//    panels marked .pq-lens, so what is behind the edge bends. Every other browser keeps the blurred glass from the
//    stylesheet. Phones skip it (it is the costliest filter on the page).
//
// The refraction is only ever on while the page is at rest. As a backdrop filter it is redone by the compositor for
// every frame in which anything behind the panel changes, and with the film moving under the glass that halved the
// frame rate of the whole scroll (docs/PERF_site_v2.md). So: while the page scrolls or the film's timeline is still
// easing, a lens panel is plain blurred glass; about a fifth of a second after everything stops, the panels that are
// on screen and showing get their refraction back. Its filter is built then too, never during a scroll.
let ping: (() => void) | null = null;
/** The page is moving (a scroll, or a scrubbed timeline still settling): keep the glass plain until it rests. */
export const glassMoving = () => ping?.();
const REST_MS = 220;

export function GlassFx() {
  useEffect(() => {
    let lit: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const g = (e.target as Element | null)?.closest?.(".pq-glass") as HTMLElement | null;
      if (lit && lit !== g) lit.style.setProperty("--hl", "0");
      if (g) { const r = g.getBoundingClientRect(); g.style.setProperty("--hl", "1"); g.style.setProperty("--mx", `${e.clientX - r.left}px`); g.style.setProperty("--my", `${e.clientY - r.top}px`); }
      lit = g;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const ua = navigator.userAgent, chromium = /Chrom(e|ium)\//.test(ua) && !/OPR\//.test(ua);
    const okLens = chromium && CSS.supports("backdrop-filter", "url(#x)") && window.matchMedia("(min-width: 900px) and (pointer: fine)").matches && !new URLSearchParams(location.search).has("nolens");
    const defs = document.getElementById("pq-lensdefs");
    const made = new Map<HTMLElement, string>(), on = new Set<HTMLElement>();
    let n = 0, t = 0, moving = false;
    // the filter for one panel at its current size (made once per size)
    function lens(el: HTMLElement) {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight), band = 26;
      if (!w || !h || !defs) return false;
      const key = `${w}x${h}`;
      if (made.get(el) === key) return true;
      made.set(el, key);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); if (!x) return false;
      const im = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const l = Math.max(0, 1 - i / band), r = Math.max(0, 1 - (w - 1 - i) / band), t = Math.max(0, 1 - j / band), b = Math.max(0, 1 - (h - 1 - j) / band), o = (j * w + i) * 4;
        im.data[o] = 128 + 127 * (l * l - r * r); im.data[o + 1] = 128 + 127 * (t * t - b * b); im.data[o + 2] = 128; im.data[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      const id = el.dataset.lens || (el.dataset.lens = `pq-lens-${n++}`);
      document.getElementById(id)?.remove();
      defs.insertAdjacentHTML("beforeend", `<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${c.toDataURL()}" x="0" y="0" width="${w}" height="${h}" result="m"/><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/><feDisplacementMap in="b" in2="m" scale="46" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix type="saturate" values="1.9"/></filter>`);
      return true;
    }
    const plain = () => { on.forEach((el) => { el.style.backdropFilter = ""; }); on.clear(); };
    // at rest: refraction for the lens panels that are showing and on screen
    const rest = () => {
      moving = false;
      document.documentElement.removeAttribute("data-glass");
      if (!okLens) return;
      document.querySelectorAll<HTMLElement>(".pq-lens").forEach((el) => {
        if (el.classList.contains("is-off")) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || !r.width) return;
        if (lens(el)) { el.style.backdropFilter = `url(#${el.dataset.lens}) brightness(1.1)`; on.add(el); }
      });
    };
    const move = () => {
      if (!moving) { moving = true; document.documentElement.setAttribute("data-glass", "moving"); plain(); }
      window.clearTimeout(t); t = window.setTimeout(rest, REST_MS);
    };
    ping = move;
    window.addEventListener("scroll", move, { passive: true });
    window.addEventListener("resize", move);
    // sections ask for their lenses once they have mounted and measured (never before React has hydrated them)
    window.addEventListener("pq:lens", move);
    return () => {
      ping = null;
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pq:lens", move); window.removeEventListener("scroll", move); window.removeEventListener("resize", move); window.clearTimeout(t);
      plain(); made.clear(); if (defs) defs.innerHTML = ""; document.documentElement.removeAttribute("data-glass");
    };
  }, []);
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs id="pq-lensdefs" /></svg>;
}
