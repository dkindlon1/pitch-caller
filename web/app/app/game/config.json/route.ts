import { connection } from "next/server";

// The game app's project settings: the Supabase project URL and its publishable key. Both are public (row level
// security is what protects the data), so a coach never has to type them on the iPad.
export async function GET() {
  await connection();
  const url = process.env.SUPABASE_URL, apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !apiKey) return Response.json({ error: "not configured" }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json({ url, apiKey }, { headers: { "cache-control": "no-cache" } });
}
