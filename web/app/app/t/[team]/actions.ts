"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { inviteMail, sendMail } from "@/lib/email";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureOurTeam, hittersOf, pitchersOf, push, teamFor, teamsOf, TOGGLES, PRESET_PERMS, OWNER_ONLY } from "@/lib/team";
import { PITCH_TYPES, newHitter, newPitch, newPitcher, parseHitters, parseRoster, type Pitch } from "@/lib/docs";
import PCRules from "@/lib/pitch_rules";

// Every action checks the user again and writes through the server's own rules (pc_push and the pc_ functions), then
// goes back to the page with a code for a fixed message (never text from the URL).
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (team: string, path: string, q: string) => redirect(`/app/t/${team}${path}${q ? (path.includes("?") ? "&" : "?") + q : ""}`);
const ok = (r: { applied: number; rejected: unknown[]; error?: string }) => !r.error && r.applied > 0 && !r.rejected.length;

// email an invite link when the coach gave an address; the page shows the link either way, so a coach can still send
// it himself when there's no email service yet
async function mailInvite(c: Awaited<ReturnType<typeof ctx>>, token: string, email: string | null, o: { role: string; pitcher?: string | null; forParent?: boolean }) {
  if (!email || !/^[0-9a-f]{64}$/.test(token)) return "";
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const r = await sendMail(inviteMail({ to: email, team: c.row.team_name, role: o.role, pitcher: o.pitcher, forParent: o.forParent, link: `${site}/join/${token}`, by: c.user.email }));
  if (r.status === "failed") console.error("invite email failed", r.error);
  return `&mailed=${r.status}`;
}

async function ctx(f: FormData) {
  const team = str(f, "team");
  const c = await teamFor(team);
  return { ...c, row: c.team, team };   // team: its id; row: what the user is on it
}

// ---------------------------------------------------------------- roster
export async function addPitchers(f: FormData) {
  const c = await ctx(f);
  if (!c.manage("manage_roster")) back(c.team, "/roster", "error=not_allowed");
  const list = parseRoster(str(f, "roster"));
  if (!list.length) back(c.team, "/roster", "error=empty");
  const ours = await ensureOurTeam(c.row);
  if (!ours) back(c.team, "/roster", "error=locked");
  const r = await push(c.team, "pitchers", list.map((x) => newPitcher(ours!.id, { name: x.name, number: x.number, hand: x.hand })), "pit");
  back(c.team, "/roster", ok(r) ? `ok=added&n=${r.applied}` : `error=${r.rejected.some((x) => x.reason === "team_locked") ? "locked" : "push"}`);
}

export async function savePitcher(f: FormData) {
  const c = await ctx(f);
  const id = str(f, "pitcher");
  const p = (await pitchersOf(c.team)).find((x) => x.id === id);
  if (!p) back(c.team, "/roster", "error=missing");
  const roster = c.manage("manage_roster"), grades = c.can("edit_grades") || roster;
  if (!grades) back(c.team, `/roster/${id}`, "error=not_allowed");
  const next = { ...p! };
  if (roster) {
    next.name = str(f, "name").slice(0, 80) || p!.name;
    next.number = str(f, "number").slice(0, 4);
    next.hand = str(f, "hand") === "L" ? "L" : "R";
    next.role = str(f, "role") === "RP" ? "RP" : "SP";
  }
  const grade = (v: string): number | "" => (v === "" ? "" : Math.max(1, Math.min(5, Math.round(+v) || 3)));
  next.pitches = (p!.pitches || []).map((d: Pitch, i: number) => {
    const type = str(f, `type_${i}`) in PITCH_TYPES ? str(f, `type_${i}`) : d.type;
    const t = PITCH_TYPES[type];
    return { ...d, type, kind: t.kind, shape: t.shape, name: str(f, `name_${i}`).slice(0, 40) || d.name, grade: grade(str(f, `grade_${i}`)),
      command: grade(str(f, `command_${i}`)), active: f.get(`active_${i}`) === "on" };
  });
  const add = str(f, "add_type");
  if (add && add in PITCH_TYPES) next.pitches = next.pitches.concat(newPitch(add));
  const r = await push(c.team, "pitchers", [next], "pit");
  back(c.team, `/roster/${id}`, ok(r) ? "ok=saved" : "error=push");
}

export async function removePitcher(f: FormData) {
  const c = await ctx(f);
  if (!c.manage("manage_roster")) back(c.team, "/roster", "error=not_allowed");
  const p = (await pitchersOf(c.team)).find((x) => x.id === str(f, "pitcher"));
  if (!p) back(c.team, "/roster", "error=missing");
  const r = await push(c.team, "pitchers", [{ ...p!, deletedAt: Date.now() }], "pit");
  back(c.team, "/roster", ok(r) ? "ok=removed" : "error=push");
}

export async function invitePlayer(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const email = str(f, "email") || null, u13 = f.get("under13") === "on";
  const { data, error } = await sb.rpc("pc_invite", { p: c.team, member_role: "player", pitcher: str(f, "pitcher"), invite_email: email, under13: u13 });
  if (error) back(c.team, "/roster", `error=${/already has an account/.test(error.message) ? "taken" : /parent/.test(error.message) ? "parent_email" : "invite"}`);
  const pname = ((await pitchersOf(c.team)).find((x) => x.id === str(f, "pitcher")) || { name: null }).name;
  const mailed = await mailInvite(c, String(data), email, { role: "player", pitcher: pname, forParent: u13 });
  back(c.team, "/roster", `invite=${data}&for=${encodeURIComponent(str(f, "pitcher"))}${mailed}`);
}

// a player's grade change put back (pc_revert_grade: edit_grades or the roster, and only if nobody changed it since)
export async function revertGrade(f: FormData) {
  const c = await ctx(f);
  const id = str(f, "pitcher"), hist = Number(str(f, "hist"));
  if (!Number.isSafeInteger(hist)) back(c.team, `/roster/${id}`, "error=missing");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_revert_grade", { hist });
  back(c.team, `/roster/${id}`, error ? `error=${/changed again/.test(error.message) ? "changed_again" : /can't change/.test(error.message) ? "not_allowed" : "revert"}` : "ok=reverted");
}

// ---------------------------------------------------------------- opponents
export async function addOpponent(f: FormData) {
  const c = await ctx(f);
  if (!c.manage("manage_opponents") && !c.manage("manage_roster")) back(c.team, "/opponents", "error=not_allowed");
  const name = str(f, "name").slice(0, 80);
  if (!name) back(c.team, "/opponents", "error=empty");
  const r = await push(c.team, "teams", [{ name, isOurs: false }], "tea");
  back(c.team, "/opponents", ok(r) ? "ok=added" : "error=push");
}

export async function addHitters(f: FormData) {
  const c = await ctx(f);
  const opp = str(f, "opp");
  if (!(await teamsOf(c.team)).some((x) => x.id === opp && !x.isOurs)) back(c.team, "/opponents", "error=missing");
  const list = parseHitters(str(f, "hitters"));
  if (!list.length) back(c.team, `/opponents/${opp}`, "error=empty");
  // a number already on their roster updates that hitter (how he bats, his name) instead of adding him twice
  const have = (await hittersOf(c.team)).filter((h) => h.teamId === opp);
  const docs = list.map((x) => {
    const same = x.number ? have.find((h) => h.number === x.number) : have.find((h) => h.name && h.name.toLowerCase() === x.name.toLowerCase());
    return same ? { ...same, name: x.name || same.name, bats: x.bats } : newHitter(opp, { name: x.name, number: x.number, bats: x.bats });
  });
  const r = await push(c.team, "hitters", docs, "hit");
  back(c.team, `/opponents/${opp}`, ok(r) ? `ok=hitters&n=${r.applied}` : "error=push");
}

// ---------------------------------------------------------------- staff
export async function inviteStaff(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const role = str(f, "role");
  const { data, error } = await sb.rpc("pc_invite", { p: c.team, member_role: role, pitcher: null, invite_email: str(f, "email") || null, under13: false });
  if (error) back(c.team, "/staff", `error=${/more permissions/.test(error.message) ? "ceiling" : "invite"}`);
  const mailed = await mailInvite(c, String(data), str(f, "email") || null, { role });
  back(c.team, "/staff", `invite=${data}&role=${encodeURIComponent(role)}${mailed}`);
}

export async function setMember(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const role = str(f, "role"), base = PRESET_PERMS[role] || [];
  // the advanced toggles: only what differs from the preset is kept
  const perms: Record<string, boolean> = {};
  const owner = c.row.is_owner && c.row.status !== "removed";
  if (f.get("advanced") === "on") for (const [k] of TOGGLES) {
    const on = f.get(`perm_${k}`) === "on";
    // the owner-only switch goes either way, and only from the owner: anyone else leaves it as it is
    if (OWNER_ONLY.has(k)) { if (owner) perms[k] = on; continue; }
    if (on !== base.includes(k)) perms[k] = on;
  }
  const { error } = await sb.rpc("pc_set_member", { p: c.team, member: str(f, "member"), member_role: role, member_perms: perms });
  back(c.team, "/staff", error ? `error=${/own permissions/.test(error.message) ? "self" : /head coach/.test(error.message) ? "last_head" : /don't have/.test(error.message) ? "ceiling" : /owner decides/.test(error.message) ? "owner_only" : "member"}` : "ok=member");
}

export async function removeMember(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_remove_member", { p: c.team, member: str(f, "member") });
  back(c.team, "/staff", error ? `error=${/head coach/.test(error.message) ? "last_head" : "member"}` : "ok=removed");
}

export async function cancelInvite(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_cancel_invite", { tok: str(f, "token") });
  back(c.team, str(f, "from") === "roster" ? "/roster" : "/staff", error ? "error=invite" : "ok=cancelled");
}

export async function approveInvite(f: FormData) {
  const c = await ctx(f);
  const sb = await getServerSupabase();
  const tok = str(f, "token");
  // what the invite is (for the parent's email), read before it changes
  const inv = (((await sb.rpc("pc_staff", { p: c.team })).data || []) as { token: string | null; email: string | null; pitcher_ids: string[] }[]).find((x) => x.token === tok);
  const { error } = await sb.rpc("pc_approve_invite", { tok });
  if (error) back(c.team, "/staff", "error=approve");
  const pname = inv ? ((await pitchersOf(c.team)).find((x) => x.id === inv.pitcher_ids[0]) || { name: null }).name : null;
  const mailed = inv ? await mailInvite(c, tok, inv.email, { role: "player", pitcher: pname, forParent: true }) : "";
  back(c.team, "/staff", `ok=approved&invite=${tok}&role=player${mailed}`);
}

// ---------------------------------------------------------------- settings
export async function saveSettings(f: FormData) {
  const c = await ctx(f);
  if (!c.manage("manage_roster")) back(c.team, "/settings", "error=not_allowed");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_set_team", { p: c.team, team_name: str(f, "name"), team_timezone: str(f, "timezone") });
  if (error) back(c.team, "/settings", `error=${/time zone/.test(error.message) ? "tz" : /name/.test(error.message) ? "name" : "settings"}`);
  const ours = await ensureOurTeam(c.row);
  const preset = str(f, "preset");
  if (ours) {
    const max = str(f, "max");
    const rule = preset && PCRules.byId(preset) ? { preset, ...(max && +max !== PCRules.byId(preset)!.max && !PCRules.byId(preset)!.byMonth ? { max: Math.max(10, Math.min(200, +max)) } : {}) } : null;
    const r = await push(c.team, "teams", [{ ...ours, name: str(f, "name") || ours.name, pitchRule: rule }], "tea");
    if (!ok(r)) back(c.team, "/settings", "error=push");
  }
  back(c.team, "/settings", "ok=saved");
}
