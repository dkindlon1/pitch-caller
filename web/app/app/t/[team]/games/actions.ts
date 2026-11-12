"use server";
import { redirect } from "next/navigation";
import { catchersOf, gamesOf, hittersOf, pitchersOf, push, teamFor, teamsOf } from "@/lib/team";
import { abilities } from "@/lib/nav";
import { newHitter } from "@/lib/docs";
import { buildPlan, type GameDoc, type PlanInput } from "@/lib/gameplan";

export type SaveState = { errors: { step: number; msg: string }[] } | null;

// Save the game plan: checked again here (who may call games, what's still on the team), new opponent and hitters
// written first so the plan points at real records, then the games record through pc_push, the same rules as the iPad.
export async function saveGamePlan(_prev: SaveState, f: FormData): Promise<SaveState> {
  const team = String(f.get("team") || ""), gameId = String(f.get("game") || "");
  const { team: t, user } = await teamFor(team);
  const a = abilities(t);
  if (!a.callGames) return { errors: [{ step: 5, msg: "Your role on this team can't set up games." }] };
  if (!t.active) return { errors: [{ step: 5, msg: "This team isn't switched on yet (billing), so nothing can be saved to it." }] };
  let inp: PlanInput;
  try { inp = JSON.parse(String(f.get("plan") || "{}")); } catch { return { errors: [{ step: 5, msg: "That didn't come through. Try again." }] }; }

  const [pitchers, teams, hitters, catchers, games] = await Promise.all([pitchersOf(team), teamsOf(team), hittersOf(team), catchersOf(team), gameId ? gamesOf(team) : Promise.resolve([])]);
  const prev = gameId ? ((games.find((g) => g.id === gameId) || null) as GameDoc | null) : null;
  if (gameId && !prev) return { errors: [{ step: 5, msg: "That game is no longer on this team." }] };
  const canOpp = a.can("manage_opponents") || a.can("manage_roster");

  // a new opponent, typed in step 1
  if (inp.opponentId === "__new" && String(inp.newOpponent || "").trim()) {
    if (!canOpp) return { errors: [{ step: 1, msg: "Your role can't add opponents. Pick one from the list." }] };
    const doc = { name: String(inp.newOpponent).trim().slice(0, 80), isOurs: false, level: inp.level, notes: "" };
    const r = await push(team, "teams", [doc], "tea");
    if (r.error || !r.applied) return { errors: [{ step: 1, msg: "The new opponent couldn't be saved. Try again." }] };
    const fresh = (await teamsOf(team)).filter((x) => !x.isOurs && x.name === doc.name).sort((x, y) => y.createdAt - x.createdAt)[0];
    if (!fresh) return { errors: [{ step: 1, msg: "The new opponent couldn't be saved. Try again." }] };
    teams.push(fresh); inp.opponentId = fresh.id;
  }
  // hitters typed into the lineup that aren't on the opponent's roster yet join it (when this role may add them)
  const known = new Map(hitters.filter((h) => !h.deletedAt).map((h) => [h.id, h.teamId] as [string, string]));
  if (inp.opponentId && inp.opponentId !== "__new" && canOpp) {
    const roster = hitters.filter((h) => h.teamId === inp.opponentId && !h.deletedAt);
    const add = (inp.lineup || []).filter((b) => !b.hitterId && String(b.name || "").trim() && !roster.some((h) => h.name.toLowerCase() === String(b.name).trim().toLowerCase()));
    if (add.length) {
      const docs = add.map((b) => newHitter(inp.opponentId as string, { name: String(b.name).trim().slice(0, 80), bats: b.hand }));
      const r = await push(team, "hitters", docs, "hit");
      if (!r.error) for (const d of await hittersOf(team)) if (!known.has(d.id) && !d.deletedAt) known.set(d.id, d.teamId);
    }
    const now = (await hittersOf(team)).filter((h) => h.teamId === inp.opponentId && !h.deletedAt);
    for (const b of inp.lineup || []) if (!b.hitterId && b.name) { const h = now.find((x) => x.name.toLowerCase() === String(b.name).trim().toLowerCase()); if (h) { b.hitterId = h.id; b.hand = h.bats; known.set(h.id, h.teamId); } }
  }

  const { doc, errors } = buildPlan(inp, {
    pitcherIds: new Set(pitchers.filter((p) => !p.deletedAt).map((p) => p.id)),
    opponentIds: new Set(teams.filter((x) => !x.isOurs && !x.deletedAt).map((x) => x.id)),
    catcherIds: new Set(catchers.filter((c) => !c.deletedAt).map((c) => c.id)),
    hitterIds: known,
  }, prev);
  if (!doc) return { errors };
  doc.plannedBy = user.email; doc.plannedAt = Date.now();
  const r = await push(team, "games", [doc], "gam");
  if (r.error || r.rejected.length || !r.applied) return { errors: [{ step: 5, msg: r.rejected.length ? "The server kept its own copy: someone changed or started this game. Reload and try again." : "The plan couldn't be saved. Try again in a moment." }] };
  const saved = prev ? prev.id : (await gamesOf(team)).filter((g) => g.status === "planned" && (g as { plannedAt?: number }).plannedAt === doc.plannedAt).map((g) => g.id)[0];
  redirect(`/app/t/${team}/games/${saved || ""}?ok=planned`);
}

// take a planned game off the schedule (never one that started)
export async function removeGamePlan(f: FormData) {
  const team = String(f.get("team") || ""), gameId = String(f.get("game") || "");
  const { team: t } = await teamFor(team);
  if (!abilities(t).callGames) redirect(`/app/t/${team}/games?error=not_allowed`);
  const g = (await gamesOf(team)).find((x) => x.id === gameId);
  if (!g || g.status !== "planned") redirect(`/app/t/${team}/games?error=started`);
  const r = await push(team, "games", [{ ...g, deletedAt: Date.now() }], "gam");
  redirect(`/app/t/${team}/games?${r.error || !r.applied ? "error=push" : "ok=removed"}`);
}
