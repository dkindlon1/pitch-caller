import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { gamesOf, myTeams } from "@/lib/team";
import { abilities } from "@/lib/nav";

// Start (or resume) a planned game on this device. The game app is a separate page with its own sign-in, so this
// hands it one: a single-use sign-in link made for this account on the server (Supabase's magic link, never emailed),
// passed in the address's #fragment (which never reaches a server or a log) and exchanged by the game app for its own
// session. Its own session, not a copy of this one: two copies of one refresh token would end both.
// Whether the game may open on this device (one device per game) is the game app's check, against the record it pulls.
export async function GET(req: NextRequest, { params }: { params: Promise<{ team: string; game: string }> }) {
  const { team, game } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/app/t/${team}/games/${game}?${q}`, req.url), 303);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/app/t/${team}/games/${game}`)}`, req.url), 303);
  if (!/^[0-9a-f-]{36}$/.test(team) || !/^[a-z]{3}_[0-9a-z]{10,40}$/.test(game)) return back("error=missing");
  const t = (await myTeams()).find((x) => x.team_id === team);
  if (!t || !abilities(t).callGames) return back("error=not_allowed");
  if (!t.active) return back("error=locked");
  const g = (await gamesOf(team)).find((x) => x.id === game);
  if (!g) return back("error=missing");
  if (g.status === "final") return back("error=over");

  let hand = "";
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && user.email) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
        method: "POST", cache: "no-store",
        headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ type: "magiclink", email: user.email }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j && typeof j.hashed_token === "string" && j.id === user.id) hand = j.hashed_token;
    } catch {}
  }
  // without a hand-off (no server key on this deployment) the game app asks for the password itself
  const q = new URLSearchParams({ game, team, name: t.team_name });
  const to = new URL(`/app/game/?${q}${hand ? `#pq=${hand}` : ""}`, req.url);
  const res = NextResponse.redirect(to, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
