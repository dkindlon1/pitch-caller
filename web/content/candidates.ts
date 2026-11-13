// Every call the PitchIQ engine (lib/engine.js, version 1.0) could make in one situation, captured by
// scripts/capture-candidates.cjs: the app's sample right-hander at college D3, 1-2 count, runner on second, one out, fifth
// inning, tie game (the same spot as content/mix.ts). cost is the expected runs the rest of the inning after that call
// (lower is better); share is its part of the final mix (0 = left out). Regenerate with the script; don't edit by hand.
export const CAND_ENGINE = "1.0";
export const CAND_PICK = {"pitch":"Slider","quad":"down-away","spot":"Down and away"};
export const CANDIDATES: { pitch: "Fastball" | "Slider" | "Changeup"; quad: string; spot: string; cost: number; share: number }[] = [
  {
    "pitch": "Slider",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.7893,
    "share": 0.344
  },
  {
    "pitch": "Fastball",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.7956,
    "share": 0.206
  },
  {
    "pitch": "Fastball",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.8018,
    "share": 0.14
  },
  {
    "pitch": "Slider",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.8021,
    "share": 0.15
  },
  {
    "pitch": "Slider",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.8047,
    "share": 0.02
  },
  {
    "pitch": "Slider",
    "quad": "down-middle",
    "spot": "Keep it down",
    "cost": 0.8057,
    "share": 0
  },
  {
    "pitch": "Slider",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.8062,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.81,
    "share": 0.071
  },
  {
    "pitch": "Changeup",
    "quad": "down-away",
    "spot": "Down and away",
    "cost": 0.8106,
    "share": 0.069
  },
  {
    "pitch": "Fastball",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8108,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "middle",
    "spot": "Get it over",
    "cost": 0.8113,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "down-middle",
    "spot": "Keep it down",
    "cost": 0.8119,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.8124,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "down-middle",
    "spot": "Keep it down",
    "cost": 0.8206,
    "share": 0
  },
  {
    "pitch": "Fastball",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.8263,
    "share": 0
  },
  {
    "pitch": "Slider",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.8271,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "up-away",
    "spot": "Up and away",
    "cost": 0.8319,
    "share": 0
  },
  {
    "pitch": "Slider",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8343,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "chase",
    "spot": "Chase",
    "cost": 0.8411,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "down-in",
    "spot": "Down and in",
    "cost": 0.8499,
    "share": 0
  },
  {
    "pitch": "Changeup",
    "quad": "up-in",
    "spot": "Up and in",
    "cost": 0.8535,
    "share": 0
  }
];
