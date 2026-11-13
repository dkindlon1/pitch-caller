// Shared bits of the coach portal: the fixed messages an action comes back with, and reading the page's params.
export type Search = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

const OK: Record<string, string> = {
  added: "Added.", saved: "Saved.", removed: "Removed.", hitters: "Hitters saved.", member: "Saved.", cancelled: "Invite cancelled.",
  approved: "Approved: the parent can now accept for the player.", reverted: "Put back. The player sees that a coach changed it back.",
};
const ERROR: Record<string, string> = {
  not_allowed: "Your role on this team can't do that.", empty: "Nothing to add: type at least one name.", missing: "That's no longer on this team.",
  locked: "This team isn't switched on yet (billing), so nothing can be saved to it.", push: "That couldn't be saved. Try again in a moment.",
  taken: "That player already has an account.", parent_email: "A player under 13 is invited through a parent's email.", invite: "That invite couldn't be made.",
  ceiling: "You can't give someone permissions you don't have.", owner_only: "Only the organization's owner decides who sees the game plan.", self: "You can't change your own permissions.",
  last_head: "A team keeps at least one head coach: make someone else head first.", member: "That couldn't be changed.",
  approve: "That invite isn't waiting for approval any more.", tz: "Pick a time zone from the list.", name: "A team needs a name.", settings: "Those settings couldn't be saved.",
  changed_again: "That grade has been changed again since, so it wasn't put back.", revert: "That change couldn't be put back.",
};

export function Notice({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const e = ERROR[one(sp.error)], o = OK[one(sp.ok)];
  if (e) return <p className="shell-alert" role="alert">{e}</p>;
  if (o) return <p className="shell-note ok-note" role="status">{one(sp.ok) === "added" && one(sp.n) ? `Added ${one(sp.n)}.` : one(sp.ok) === "hitters" && one(sp.n) ? `${one(sp.n)} hitters saved.` : o}</p>;
  return null;
}
