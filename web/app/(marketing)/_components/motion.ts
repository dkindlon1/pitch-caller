// Motion tokens for the GSAP code. The values live with every other token in site.css (.pq { --m-* }); this reads them
// once, so timing and easing are changed in one place.
type Tokens = { out: string; soft: string; inn: string; move: string; durIn: number; durFlip: number; durLand: number; stagger: number; scrub: number; lerp: number };
let cached: Tokens | null = null;
export function motion(): Tokens {
  if (cached) return cached;
  const el = document.querySelector(".pq") || document.documentElement, cs = getComputedStyle(el);
  const s = (n: string, d: string) => cs.getPropertyValue(n).trim() || d, n = (k: string, d: number) => parseFloat(cs.getPropertyValue(k)) || d;
  cached = { out: s("--m-ease-out", "expo.out"), soft: s("--m-ease-soft", "power4.out"), inn: s("--m-ease-in", "power2.in"), move: s("--m-ease-move", "power3.inOut"),
    durIn: n("--m-dur-in", 0.9), durFlip: n("--m-dur-flip", 0.55), durLand: n("--m-dur-land", 0.5), stagger: n("--m-stagger", 0.07), scrub: n("--m-scrub", 0.6), lerp: n("--m-lerp", 0.11) };
  return cached;
}
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const tallScreen = () => typeof window !== "undefined" && window.matchMedia("(max-aspect-ratio: 9/10)").matches;
