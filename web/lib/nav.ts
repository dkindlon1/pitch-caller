import type { IconName } from "@/app/app/_frame/Icon";

// The portal's screens and who may open them: the launcher's tiles and the dock are both built from this list, so they
// can't disagree. Hiding a tile is never the security: every page and action checks again on the server, and the
// database's own rules decide what each account can read or write.
export type NavItem = { key: string; href: string; icon: IconName; label: string; short: string; sub: string; main?: boolean; badge?: number; external?: boolean };

type Row = { team_id: string; org_id: string; role: string | null; perms: Record<string, boolean>; is_owner: boolean; active: boolean; status: string };

export function abilities(t: Row) {
  const coach = !!t.role && t.role !== "player";
  const can = (perm: string) => !!(coach && t.active && (t.perms || {})[perm]);
  const owner = t.is_owner && t.status !== "removed";
  const manage = (perm: string) => can(perm) || owner;
  return { coach, can, owner, manage, callGames: can("call_games"), seesPlan: can("call_games") || can("view_plan") };
}

export function coachNav(t: Row, badges: { reviews?: number } = {}): NavItem[] {
  const a = abilities(t), base = `/app/t/${t.team_id}`, out: NavItem[] = [];
  if (a.coach && a.seesPlan) out.push({ key: "games", href: `${base}/games`, icon: "gameday", label: "Game Day", short: "Game Day", main: true,
    sub: a.callGames ? "Set up a game, then start it on any device" : "Today’s game plan, read only" });
  if (a.coach) out.push({ key: "roster", href: `${base}/roster`, icon: "roster", label: "Roster", short: "Roster", badge: a.can("review_uploads") ? badges.reviews : undefined,
    sub: a.can("manage_roster") ? "Pitchers, arsenals and grades" : a.can("edit_grades") ? "Arsenals and grades" : "Pitchers and their arsenals" });
  if (a.coach) out.push({ key: "opponents", href: `${base}/opponents`, icon: "opponents", label: "Opponents", short: "Opponents",
    sub: a.can("manage_opponents") ? "Teams and their hitters" : "Their hitters, read only" });
  if (a.manage("manage_staff") || a.manage("manage_roster")) out.push({ key: "staff", href: `${base}/staff`, icon: "staff", label: "Staff", short: "Staff", sub: "Coaches, players and invites" });
  if (a.manage("manage_roster")) out.push({ key: "settings", href: `${base}/settings`, icon: "settings", label: "Settings", short: "Settings", sub: "Name, time zone, pitch counts" });
  if (a.owner) out.push({ key: "billing", href: `/app/billing?org=${t.org_id}`, icon: "billing", label: "Billing", short: "Billing", sub: "Your organization’s plan and card" });
  if (a.callGames) out.push({ key: "app", href: "/app/game/", icon: "tablet", label: "Game app", short: "Game app", sub: "Open the game app on this device", external: true });
  return out;
}

export function playerNav(team: string, pitcher: string): NavItem[] {
  const base = `/app/me/${team}/${pitcher}`;
  return [
    { key: "home", href: base, icon: "home", label: "My page", short: "Home", sub: "Your last outing and when you can pitch again", main: true },
    { key: "arsenal", href: `${base}/arsenal`, icon: "arsenal", label: "Arsenal", short: "Arsenal", sub: "Your pitches and grades" },
    { key: "uploads", href: `${base}/uploads`, icon: "uploads", label: "Uploads", short: "Uploads", sub: "TrackMan and Rapsodo sessions" },
    { key: "stats", href: `${base}/stats`, icon: "stats", label: "Stats", short: "Stats", sub: "By pitch, count and hitter side" },
    { key: "learned", href: `${base}/learned`, icon: "learned", label: "What it learned", short: "Learned", sub: "What the engine knows about your pitches" },
    { key: "profile", href: `${base}/profile`, icon: "profile", label: "Profile", short: "Profile", sub: "Your details" },
  ];
}
