import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Before the signed-in pages render: refresh the Supabase session (a page can't write cookies), and send anyone
// signed out from /app to sign-in. This is the quick check only; every page and action checks the user again, and
// row level security on the server is what actually guards the data.
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

// The game app (/app/game/) signs in on its own and has to open with no signal: the proxy leaves it alone.
export const config = { matcher: ["/app", "/app/((?!game).*)", "/admin", "/admin/:path*", "/join/:path*", "/login"] };
