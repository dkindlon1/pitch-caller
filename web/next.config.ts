import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The stylesheet is small and most visitors are new, so it ships inside the HTML instead of blocking on a request.
  experimental: { inlineCss: true },
};

export default nextConfig;
