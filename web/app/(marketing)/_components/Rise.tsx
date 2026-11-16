"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, reducedMotion } from "./motion";

// The small arrivals, in one place: each section's headline and line of copy rise once as they reach the lower part
// of the screen, and the blocks marked data-rise follow in a short stagger. Nothing here runs under reduced motion:
// the page is simply there. Fades go on the element itself, never on a wrapper, so glass keeps its blur while it fades.
export function Rise() {
  useEffect(() => {
    if (reducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const M = motion(), made: gsap.core.Animation[] = [];
    document.querySelectorAll<HTMLElement>(".pq-sec-head").forEach((head) => {
      made.push(gsap.from(Array.from(head.children), { y: 36, opacity: 0, duration: M.durIn, ease: M.out, stagger: M.stagger, clearProps: "opacity,transform", scrollTrigger: { trigger: head, start: "top 84%", once: true } }));
    });
    const groups = new Map<Element, HTMLElement[]>();
    document.querySelectorAll<HTMLElement>("[data-rise]").forEach((e) => { const k = e.parentElement || e; groups.set(k, [...(groups.get(k) || []), e]); });
    groups.forEach((list, parent) => made.push(gsap.from(list, { y: 40, opacity: 0, duration: M.durIn, ease: M.out, stagger: M.stagger, clearProps: "opacity,transform", scrollTrigger: { trigger: parent, start: "top 84%", once: true } })));
    return () => made.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
  }, []);
  return null;
}
