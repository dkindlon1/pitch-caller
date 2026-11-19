import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { SharePanel, type ShareRow } from "@/app/app/_reports/share";

// The share panel's data for one recap: his live link (if any), whether it's live yet, whether he's under 18.
export async function ShareFor({ team, pitcher, season }: { team: string; pitcher: string; season: string }) {
  const sb = await getServerSupabase();
  let q = sb.from("recap_shares").select("token, sections, approved_at, approved_sections, paused").eq("program_id", team).eq("pitcher_id", pitcher).is("revoked_at", null);
  q = season ? q.eq("season_id", season) : q.is("season_id", null);
  const [{ data: shares }, { data: minors }] = await Promise.all([q.limit(1), sb.from("minor_guardians").select("pitcher_id").eq("program_id", team).eq("pitcher_id", pitcher)]);
  const share = ((shares || [])[0] || null) as ShareRow | null;
  const live = share ? !!(await sb.rpc("pc_public_recap", { tok: share.token })).data : false;
  // under 18: marked by a coach, or a young player who joined through a parent (the link's approval says so too)
  const minor = !!(minors || []).length || (!!share && !live && !share.paused);
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  return <SharePanel team={team} pitcher={pitcher} season={season} share={share} live={live} minor={minor} site={site} />;
}
