import type { MetadataRoute } from "next";

// The public pages: the site and its legal pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.SITE_URL || "http://localhost:3000";
  return [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
