"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mark } from "./Mark";

// The glass pill at the top: condenses once the hero is scrolled past, and marks the section on screen.
const LINKS = [
  { id: "at-bat", label: "How it calls" },
  { id: "demo", label: "Try it" },
  { id: "dugout", label: "In the dugout" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [here, setHere] = useState("");
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setHere(e.target.id); }, { rootMargin: "-45% 0px -50% 0px" });
    for (const l of [...LINKS.map((x) => x.id), "contact", "between"]) { const el = document.getElementById(l); if (el) io.observe(el); }
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);
  return (
    <header className={`mk-nav${scrolled ? " is-scrolled" : ""}`}>
      <nav className="mk-nav-pill mk-glass" aria-label="Main">
        <Link href="/" className="mk-nav-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
        {LINKS.map((l) => (
          <a key={l.id} className={`mk-nav-link${here === l.id ? " is-here" : ""}`} href={`#${l.id}`} aria-current={here === l.id ? "location" : undefined}>{l.label}</a>
        ))}
        <Link className="mk-nav-link" href="/login">Sign in</Link>
        <a className="mk-btn mk-btn-sm" href="#contact">Talk to us</a>
      </nav>
    </header>
  );
}
