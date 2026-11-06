// One real at-bat from the PitchIQ engine (v0.8, branch v0.8-build, commit 2caaa23).
// Captured Nov 5, 2026 by driving app/dist/pitch-caller.html in a headless browser with the app's own default
// setup: college D3, the right-handed starter (fastball 86, slider 78, changeup 77) against a right-handed hitter.
// The calls and reasons are the engine's own output; the results were chosen by hand to play out the at-bat.
// Regenerate by re-running the capture rather than editing these lines.

export type Spot = "Up and in" | "Up and away" | "Down and in" | "Down and away" | "Get it over" | "Chase";

export type Pitch = {
  balls: number;
  strikes: number;
  sign: number; // the catcher's sign the app shows: 1 fastball, 2 curveball, 3 slider, 4 changeup
  pitch: "Fastball" | "Slider" | "Changeup" | "Curveball";
  spot: Spot;
  why: string;
  result: "Called strike" | "Ball" | "Foul" | "Swing and miss";
};

export const AT_BAT: Pitch[] = [
  { balls: 0, strikes: 0, sign: 1, pitch: "Fastball", spot: "Get it over", why: "He's timed for 81 mph; this plays 5 mph faster.", result: "Called strike" },
  { balls: 0, strikes: 1, sign: 3, pitch: "Slider", spot: "Get it over", why: "Changes his eye level after the fastball.", result: "Ball" },
  { balls: 1, strikes: 1, sign: 1, pitch: "Fastball", spot: "Down and away", why: "Today's umpire is calling more strikes than usual.", result: "Foul" },
  { balls: 1, strikes: 2, sign: 3, pitch: "Slider", spot: "Down and away", why: "He's looking middle (35%).", result: "Swing and miss" },
];

// Zone cells in the catcher's view for a right-handed hitter, who stands on the left: [column, row], 0..2.
export const CELL: Record<Exclude<Spot, "Chase">, [number, number]> = {
  "Up and in": [0, 0],
  "Up and away": [2, 0],
  "Get it over": [1, 1],
  "Down and in": [0, 2],
  "Down and away": [2, 2],
};

// Pitch colors from the Pitch Caller design system (Claude Design canvas, DesignSystem board): fill for chips, bars and
// the call band, always with black text; ink for pitch-colored text on light (Day) surfaces. The code always rides
// with the color, so no pitch is told apart by hue alone.
export const PITCH_COLOR: Record<Pitch["pitch"], { code: string; fill: string; ink: string }> = {
  Fastball: { code: "FB", fill: "#FF5A4E", ink: "#C41F17" },
  Slider: { code: "SL", fill: "#FFD43B", ink: "#7F6400" },
  Curveball: { code: "CU", fill: "#52A9FF", ink: "#0A5BC0" },
  Changeup: { code: "CH", fill: "#3FE08C", ink: "#0B7F43" },
};
