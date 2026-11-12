// PitchIQ's own icons, drawn for the portal on a 24-unit grid: line, 1.6 stroke, round ends. Baseball things where a
// screen has one (a plate, a jersey, a bat, a zone), plain shapes where it doesn't.
export type IconName = "gameday" | "roster" | "opponents" | "staff" | "settings" | "billing" | "org" | "uploads" | "stats" | "learned" | "arsenal"
  | "profile" | "home" | "tablet" | "teams" | "exports" | "chevron" | "plus" | "eye";

const P: Record<IconName, React.ReactNode> = {
  // home plate, with the ball about to cross it
  gameday: <><path d="M5 9.5V4h14v5.5L12 20z" /><circle cx="12" cy="9" r="2.4" /></>,
  // a jersey with a number
  roster: <><path d="M8 3.5 4 5.5 2.8 10l3 1V20.5h12.4V11l3-1L20 5.5l-4-2c-.6 1.6-2.2 2.6-4 2.6S8.6 5.1 8 3.5z" /><path d="M10.5 11.5h3l-2 5" /></>,
  // a bat and a ball
  opponents: <><path d="m20.5 3.5-1 1L8 16l-2.6.4-1.9 1.9 2.2 2.2 1.9-1.9L8 16" /><path d="M19.5 4.5 10 14" /><circle cx="17" cy="17" r="2.6" /></>,
  // a clipboard
  staff: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  billing: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  // a grandstand
  org: <><path d="M3 20.5h18M5 20.5V11l7-5 7 5v9.5" /><path d="M9 20.5v-5h6v5M8.5 11.5h7" /></>,
  uploads: <><path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" /><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /></>,
  stats: <><path d="M4 20h16" /><path d="M7 16v-4M12 16V7M17 16v-6" /></>,
  // the zone with one cell lit: what it learned about where he lands
  learned: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" opacity=".55" /><rect x="14.7" y="14.7" width="5.3" height="5.3" fill="currentColor" stroke="none" /></>,
  // three pitch cards fanned
  arsenal: <><rect x="3.5" y="7" width="8" height="12" rx="1.8" transform="rotate(-10 7.5 13)" /><rect x="9" y="5" width="8" height="12" rx="1.8" /><rect x="14.5" y="7" width="6" height="12" rx="1.8" transform="rotate(10 17.5 13)" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>,
  // the infield diamond
  home: <><path d="M12 3.5 20.5 12 12 20.5 3.5 12z" /><circle cx="12" cy="12" r="1.5" /></>,
  tablet: <><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M10.5 18h3" /></>,
  teams: <><circle cx="8.5" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.4" /><path d="M3 19.5c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14.5 15.2c2.6-.5 5 .8 6 3.8" /></>,
  exports: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
};

export function Icon({ name, size = 24, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  );
}

// the site's mark: a ball with its two seams
export function Ball({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#F4F4F1" />
      <path d="M6.2 4.6c2.3 2 3.4 4.4 3.4 7.4s-1.1 5.4-3.4 7.4M17.8 4.6c-2.3 2-3.4 4.4-3.4 7.4s1.1 5.4 3.4 7.4" fill="none" stroke="#F04A3E" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// a seam stitched down the game card's edge: the curve and its stitches
export function SeamEdge() {
  const stitches = Array.from({ length: 24 }, (_, i) => 12 + i * 34);
  return (
    <svg viewBox="0 0 34 820" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <path d="M10 0C24 120 24 290 12 410S2 700 16 820" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".9" />
      {stitches.map((y, i) => {
        const x = 10 + 6 * Math.sin((y / 820) * Math.PI * 2 + 0.4);
        return <path key={i} d={`M${x - 5} ${y - 4}l9 4M${x - 5} ${y + 4}l9 -4`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85" />;
      })}
    </svg>
  );
}
