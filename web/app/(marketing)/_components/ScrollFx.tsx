"use client";
import { useEffect } from "react";

// How the page arrives as you scroll, in one place. Section titles rise word by word out of a mask, their line of
// copy follows, and the blocks under them come up in a short stagger. Each plays once, as it reaches the lower fifth
// of the screen. Nothing runs under reduced motion: the page is simply there.
// Fades go on the element itself, never on a wrapper, so a glass panel's blur keeps working while it fades.
const RISE = [
  ".mk-ru-list > *", ".mk-ru-proof > *", ".mk-pg-grid > *", ".mk-pg-cloud", ".mk-fq-list > *",
  ".mk-dg-facts > *", ".mk-contact-copy > *", ".mk-contact-panel", ".mk-foot-top > *",
];

export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      const tweens: gsap.core.Animation[] = [];
      const once = { start: "top 82%", once: true };

      document.querySelectorAll<HTMLElement>(".mk-sec-head, .mk-contact-copy").forEach((head) => {
        const h = head.querySelector<HTMLElement>("h2");
        if (!h || h.dataset.fx) return;
        h.dataset.fx = "1";
        // split the title into words, each in a mask, only when it's plain text (it always is today)
        if (h.children.length === 0) {
          const words = (h.textContent || "").trim().split(/\s+/);
          h.setAttribute("aria-label", words.join(" "));
          h.innerHTML = words.map((w) => `<span class="mk-w" aria-hidden="true"><span>${w.replace(/[<>&]/g, "")}</span></span>`).join(" ");
        }
        const inner = h.querySelectorAll(".mk-w > span");
        const rest = Array.from(head.children).filter((c) => c !== h && !c.matches(".mk-seg"));
        const tl = gsap.timeline({ scrollTrigger: { trigger: head, ...once } });
        if (inner.length) tl.from(inner, { yPercent: 115, rotate: 4, duration: 1.05, ease: "expo.out", stagger: 0.06 });
        else tl.from(h, { y: 40, opacity: 0, duration: 0.9, ease: "expo.out" });
        if (rest.length) tl.from(rest, { y: 26, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, clearProps: "opacity,transform" }, 0.18);
        tweens.push(tl);
      });

      RISE.forEach((sel) => {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !e.dataset.fx);
        if (!els.length) return;
        els.forEach((e) => { e.dataset.fx = "1"; });
        // group siblings so each set staggers from its own trigger
        const groups = new Map<Element, HTMLElement[]>();
        els.forEach((e) => { const k = e.parentElement || e; groups.set(k, [...(groups.get(k) || []), e]); });
        groups.forEach((list, parent) => {
          tweens.push(gsap.from(list, { y: 44, opacity: 0, duration: 1, ease: "power3.out", stagger: 0.07, clearProps: "opacity,transform", scrollTrigger: { trigger: parent, ...once } }));
        });
      });
      ScrollTrigger.refresh();
      kill = () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
    });
    return () => kill();
  }, []);
  return null;
}
