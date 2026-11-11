// One real call mix from the PitchIQ engine (lib/engine.js, version 0.9), captured by scripts/capture-mix.cjs.
// The app's sample right-hander (fastball 86, slider 78, changeup 77) at college D3: 1-2 count, runner on second, one out,
// fifth inning, tie game, the hitter has seen two fastballs and a slider, the last pitch was a fastball up and away.
// Regenerate with the script rather than editing these numbers.
export const MIX_ENGINE = "0.9";
export const MIX_SITUATION = "1-2 count, runner on second, one out, fifth inning, tie game";
export const MIX: { pitch: "Fastball" | "Slider" | "Changeup"; spot: string; prob: number }[] = [
  {
    "pitch": "Slider",
    "spot": "Down and away",
    "prob": 0.313
  },
  {
    "pitch": "Fastball",
    "spot": "Down and away",
    "prob": 0.273
  },
  {
    "pitch": "Fastball",
    "spot": "Up and away",
    "prob": 0.169
  },
  {
    "pitch": "Slider",
    "spot": "Get it over",
    "prob": 0.154
  },
  {
    "pitch": "Slider",
    "spot": "Up and away",
    "prob": 0.092
  }
];
