import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The stylesheet is small and most visitors are new, so it ships inside the HTML instead of blocking on a request.
  // uploads send up to 5000 normalized pitches in one Server Action (Vercel allows 4.5 MB per request)
  experimental: { inlineCss: true, serverActions: { bodySizeLimit: "4mb" } },
  // The game app lives at /app/game/ with the trailing slash: its service worker's scope is /app/game/, and a path
  // without the slash would fall outside it (and outside offline use).
  skipTrailingSlashRedirect: true,
  // (the page itself moves from /app/game to /app/game/ before it registers the worker: a redirect rule here would
  // match both spellings and loop)
  async rewrites() {
    return [{ source: "/app/game/", destination: "/app/game/index.html" }, { source: "/app/game", destination: "/app/game/index.html" }];
  },
  async headers() {
    return [
      // a new worker (and so a new version of the app) is found the next time the app opens with a signal
      { source: "/app/game/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/app/game/" }] },
      { source: "/app/game/index.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
