"use client";
import { useEffect, useRef, useState } from "react";

// A number that counts up to its value once it's on screen. The page arrives with the real value (no script, a screen
// reader and reduced motion all get it as is); the count only replays it, from zero, in about 0.7 s.
export function Num({ value, delay = 0 }: { value: number; delay?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value) || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0, t0 = 0, timer = 0;
    const run = () => {
      t0 = performance.now();
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / 700); setShown(Math.round(value * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
      setShown(0); raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); timer = window.setTimeout(run, delay); } });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [value, delay]);
  return <span ref={ref} className="num">{shown}</span>;
}
