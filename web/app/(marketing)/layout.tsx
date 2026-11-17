import type { Metadata, Viewport } from "next";
import { siteFonts } from "./fonts";
import { Smooth } from "./_components/Smooth";
import { GlassFx } from "./_components/GlassFx";
import "./site.css";
import "./sections.css";
import { SITE_ORIGIN } from "@/lib/site";

// The public site: its own type (./fonts.ts) and styles, separate from the portal (which keeps the Pitch Caller design
// system in app/globals.css).

const TITLE = "PitchIQ: pitch calling for high school, travel and college baseball";
const DESCRIPTION = "PitchIQ calls every pitch from your pitcher's stuff today, the hitter and the count, and tells you why. Built for high school, travel and college coaches.";

// SITE_URL (web/.env.example) makes the share image's address absolute; see lib/site.ts for the fallbacks
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: "PitchIQ: every pitch called, every call explained", description: DESCRIPTION, type: "website", siteName: "PitchIQ" },
  twitter: { card: "summary_large_image", title: "PitchIQ: every pitch called, every call explained", description: DESCRIPTION },
};

// the browser's own chrome takes the page's ground colour
export const viewport: Viewport = { themeColor: "#0c0b0e", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`pq ${siteFonts}`}>
      <Smooth />
      <GlassFx />
      {children}
    </div>
  );
}
