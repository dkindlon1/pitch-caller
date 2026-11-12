// One real call mix from the PitchIQ engine (lib/engine.js, version 1.0), captured by scripts/capture-mix.cjs.
// The app's sample right-hander (fastball 86, slider 78, changeup 77) at college D3: 1-2 count, runner on second, one out,
// fifth inning, tie game, the hitter has seen two fastballs and a slider, the last pitch was a fastball up and away.
// Regenerate with the script rather than editing these numbers.
export const MIX_ENGINE = "1.0";
export const MIX_SITUATION = "1-2 count, runner on second, one out, fifth inning, tie game";
export const MIX: { pitch: "Fastball" | "Slider" | "Changeup"; spot: string; prob: number }[] = [
  {
    "pitch": "Slider",
    "spot": "Down and away",
    "prob": 0.344
  },
  {
    "pitch": "Fastball",
    "spot": "Down and away",
    "prob": 0.206
  },
  {
    "pitch": "Slider",
    "spot": "Get it over",
    "prob": 0.15
  },
  {
    "pitch": "Fastball",
    "spot": "Up and away",
    "prob": 0.14
  },
  {
    "pitch": "Changeup",
    "spot": "Get it over",
    "prob": 0.071
  },
  {
    "pitch": "Changeup",
    "spot": "Down and away",
    "prob": 0.069
  },
  {
    "pitch": "Slider",
    "spot": "Up and away",
    "prob": 0.02
  }
];
