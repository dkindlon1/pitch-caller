// The site's own address, for share images, robots.txt and the sitemap. SITE_URL wins; a Vercel preview without it
// uses its own deployment address (VERCEL_URL, set by Vercel), and local runs use localhost.
export const SITE_ORIGIN = (process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
