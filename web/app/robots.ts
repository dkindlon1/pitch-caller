import type { MetadataRoute } from "next";

// The public pages are open to search engines; the signed-in app, the admin pages, invites and the API are not.
export default function robots(): MetadataRoute.Robots {
  const site = process.env.SITE_URL || "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/join", "/auth"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
