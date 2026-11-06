// The player portal's fixed messages (an action comes back with a code, never text from the URL).
type SP = Record<string, string | string[] | undefined>;
export type Search = Promise<SP>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const OK: Record<string, string> = { saved: "Saved. Your coaches see the change, and can put a grade back if they disagree." };
const ERROR: Record<string, string> = { push: "That couldn't be saved. Try again in a moment.", locked: "Your team is switched off right now, so nothing can be saved." };
export function Notice({ sp }: { sp: SP }) {
  const e = ERROR[one(sp.error)], o = OK[one(sp.ok)];
  if (e) return <p className="shell-alert" role="alert">{e}</p>;
  if (o) return <p className="shell-note ok-note" role="status">{o}</p>;
  return null;
}
export const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
