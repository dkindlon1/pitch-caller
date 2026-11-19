import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Before the signed-in pages render: refresh the Supabase session (a page can't write cookies), and send anyone
// signed out from /app to sign-in. This is the quick check only; every page and action checks the user again, and
// row level security on the server is what actually guards the data.
// a public recap link that isn't live (turned off, waiting on a parent, or never real): says nothing about which, or whose
const LINK_OFF = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link not available · PitchIQ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0b0e;color:#ecebe6;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:520px;margin:24px 16px;padding:24px;border-radius:20px;background:#1c1b23;border:1px solid rgba(236,235,230,.1)}h1{font-size:1.4rem;margin:0 0 8px}p{color:#c5c7cf;margin:0 0 12px}a{color:#ecebe6}</style></head>
<body><main><h1>This recap link isn&rsquo;t available</h1><p>It may have been turned off, it may still be waiting for a parent&rsquo;s approval, or the address may be mistyped. Ask the player for a new link.</p><p><a href="/">PitchIQ</a></p></main></body></html>`;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers || {})) response.headers.set(k, v);
      },
    },
  });
  // a public recap link (/r/<token>, its PDF): asked first, so a revoked, unapproved or made-up link answers 404
  // before anything renders (the page itself never shows data for one either)
  const pub = request.nextUrl.pathname.match(/^\/r\/([^/]+)(\/pdf)?\/?$/);
  if (pub) {
    const tok = pub[1];
    let live = false;
    if (/^[0-9a-f]{64}$/.test(tok)) {
      const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;   // pc_public_recap is the server's to call, never anon's
      const r = svc ? await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/pc_public_recap`, { method: "POST", cache: "no-store",
        headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" }, body: JSON.stringify({ tok }) }).catch(() => null) : null;
      live = !!r && r.ok && (await r.text().catch(() => "null")).trim() !== "null";
    }
    if (live) return response;
    return new Response(LINK_OFF, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && (path.startsWith("/app") || path === "/admin" || path.startsWith("/admin/"))) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);   // a cleared session stays cleared
    return redirect;
  }
  return response;
}

// The game app (/app/game/) signs in on its own and has to open with no signal: the proxy leaves it alone. Public recap
// links (/r/...) are checked as above.
export const config = { matcher: ["/app", "/app/((?!game).*)", "/admin", "/admin/:path*", "/join/:path*", "/login", "/r/:path*"] };
