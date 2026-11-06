import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/age";

// The link in the sign-up email. Supabase sends people here with a one-time code (PKCE) or a token hash; either
// becomes a session cookie, then they go on to where they were headed. A bad or used link goes to sign-in.
export async function GET(request: NextRequest) {
  const u = request.nextUrl;
  const next = safeNext(u.searchParams.get("next") || "/app");
  const code = u.searchParams.get("code"), tokenHash = u.searchParams.get("token_hash"), type = u.searchParams.get("type");
  const sb = await getServerSupabase();
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && (type === "signup" || type === "email")) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  const to = new URL(ok ? next : `/login?notice=confirm_failed&next=${encodeURIComponent(next)}`, u.origin);
  return NextResponse.redirect(to);
}
