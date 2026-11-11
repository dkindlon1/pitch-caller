// Every call the PitchIQ engine (lib/engine.js, version 0.9) could make in one situation, captured by
// scripts/capture-candidates.cjs: the app's sample right-hander at college D3, 1-2 count, runner on second, one out, fifth
// inning, tie game (the same spot as content/mix.ts). cost is the expected runs the rest of the inning after that call
// (lower is better); share is its part of the final mix (0 = left out). Regenerate with the script; don't edit by hand.
export const CAND_ENGINE = "0.9";
export const CAND_PICK = {"pitch":"Slider","quad":"down-away","spot":"Down and away"};
export const CANDIDATES: { pitch: "Fastball" | "Slider" | "Changeup"; quad: string; spot: string; cost: number; share: number }[] = [
  {
    "pitch": "Slider",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.7882,
    "share": 0.313
  },
  {
    "pitch": "Fastball",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.7919,
    "share": 0.273
  },
  {
    "pitch": "Fastball",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.7994,
    "share": 0.169
  },
  {
    "pitch": "Slider",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.7994,
    "share": 0.154
  },
  {
    "pitch": "Slider",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.8018,
    "share": 0.092
  },
  {
    "pitch": "Slider",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.806,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.8062,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.8069,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.8079,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8099,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.8165,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.8232,
    "share": 0
  },
  {
    "pitch": "Slider",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.826,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.8274,
    "share": 0
  },
  {
    "pitch": "Slider",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8351,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.8385,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.8489,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8555,
    "share": 0
  }
];
