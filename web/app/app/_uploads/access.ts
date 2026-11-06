import "server-only";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { myTeams, pitchersOf, type TeamRow } from "@/lib/team";
import { myPitchers } from "@/lib/player";
import type { Pitcher } from "@/lib/docs";

// Who's looking at a pitcher's uploads and stats, and what they may do. The pitcher himself (or his parent) works in
// the player portal; a coach on the team in the coach portal, and changes things only with review_uploads. The
// database checks all of it again (pc_upload_ok); this decides what the page shows and where it goes back to.
export type UploadAccess = { team: TeamRow; pitcher: Pitcher; base: string; edit: boolean; asPlayer: boolean; userId: string };

export async function uploadAccess(teamId: string, pitcherId: string): Promise<UploadAccess> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app`)}`);
  if (!/^[0-9a-f-]{36}$/.test(teamId) || !/^[\w:-]{1,80}$/.test(pitcherId)) notFound();
  const t = (await myTeams()).find((x) => x.team_id === teamId);
  if (!t || !t.role) notFound();
  if (t.role === "player") {
    const p = (await myPitchers(teamId)).find((x) => x.id === pitcherId);
    if (!p) notFound();
    return { team: t, pitcher: p, base: `/app/me/${teamId}/${pitcherId}`, edit: t.active, asPlayer: true, userId: user.id };
  }
  const p = (await pitchersOf(teamId)).find((x) => x.id === pitcherId && !x.deletedAt);
  if (!p) notFound();
  const perms = (t.perms || {}) as Record<string, boolean>;
  return { team: t, pitcher: p, base: `/app/t/${teamId}/roster/${pitcherId}`, edit: t.active && !!perms.review_uploads, asPlayer: false, userId: user.id };
}
