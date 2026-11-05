"use client";
import { createBrowserClient } from "@supabase/ssr";

// For client components that need Supabase directly (none yet: the shell's pages work through Server Actions).
// NEXT_PUBLIC_ values are fixed at build time.
export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return createBrowserClient(url, key);
}
