// The age question asked before anyone makes an account (COPPA). Month and year of birth, with no default and no hint
// of which answer gets in; nothing about the answer is stored except a one-day cookie saying which way it went, so the
// back button can't be used to answer again. A birth month that could be either side of 13 counts as under 13.
// The wording and this approach are for the lawyer to approve before launch.

export const AGE_COOKIE = "pq_age";
export type AgeAnswer = "13plus" | "under13";

export function ageAnswer(month: number, year: number, now = new Date()): AgeAnswer | null {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return null;
  const thisYear = now.getUTCFullYear();
  if (year < thisYear - 120 || year > thisYear) return null;
  const months = (thisYear - year) * 12 + (now.getUTCMonth() + 1 - month);
  if (months < 0) return null;
  return months > 13 * 12 ? "13plus" : "under13";
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function birthYears(now = new Date()): number[] {
  const y = now.getUTCFullYear();
  return Array.from({ length: 100 }, (_, i) => y - i);
}

// Only a path on this site: "/app", never "//evil.example" or "https://...".
export function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return /^\/(?![/\\])[\w\-./?=&%]*$/.test(s) ? s : "/app";
}
