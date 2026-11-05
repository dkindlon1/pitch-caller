import { clientIp, handleWaitlist, supabaseDeps } from "@/lib/waitlist";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const r = await handleWaitlist(body, clientIp(request.headers), supabaseDeps(process.env));
  return Response.json({ status: r.status }, { status: r.httpStatus, headers: { "cache-control": "no-store" } });
}
