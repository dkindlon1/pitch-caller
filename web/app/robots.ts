import { SITE_ORIGIN } from "@/lib/site";
import type { MetadataRoute } from "next";

// The public pages are open to search engines; the signed-in app, the admin pages, invites and the API are not.
export default function robots(): MetadataRoute.Robots {
  const site = SITE_ORIGIN;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/join", "/auth"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
