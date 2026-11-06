import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Read at request time (not NEXT_PUBLIC_, which is baked in at build), so one build runs against any project.
export function serverEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

// One client per request, acting as the signed-in user: row level security on the server decides what it can see.
export async function getServerSupabase() {
  const env = serverEnv();
  if (!env) throw new Error("Supabase isn't configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // A Server Component can't set cookies; proxy.ts refreshes the session before the page renders. Server
        // Actions can, so sign-in and sign-out write theirs here.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch {}
      },
    },
  });
}

export type SessionUser = { id: string; email: string | null };

// The signed-in user, checked with Supabase Auth (not just read from the cookie), or null.
export async function getUser(): Promise<SessionUser | null> {
  await connection();   // always at request time, even unconfigured: never prerendered into a static page
  if (!serverEnv()) return null;
  const sb = await getServerSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
