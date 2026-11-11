"use client";

import { useEffect, useRef } from "react";

// A paragraph that brightens word by word as it scrolls through the screen, so it's read at the pace it's scrolled.
// Under reduced motion, or before the script loads, every word is at full strength.
export function Reveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !ref.current) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (!ref.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const spans = ref.current.querySelectorAll("span");
      const tween = gsap.fromTo(
        spans,
        { opacity: 0.16 },
        { opacity: 1, ease: "none", stagger: 0.08, scrollTrigger: { trigger: ref.current, start: "top 78%", end: "bottom 42%", scrub: 0.6 } },
      );
      kill = () => { tween.scrollTrigger?.kill(); tween.kill(); };
    });
    return () => kill();
  }, []);

  return (
    <p ref={ref} className={className}>
      {words.map((w, n) => (
        <span key={n}>{w}{n < words.length - 1 ? " " : ""}</span>
      ))}
    </p>
  );
}
