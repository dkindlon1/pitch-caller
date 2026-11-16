import type { Metadata } from "next";
import localFont from "next/font/local";
import { Smooth } from "./_components/Smooth";
import { GlassFx } from "./_components/GlassFx";
import "./site.css";
import "./sections.css";
import { SITE_ORIGIN } from "@/lib/site";

// The public site: its own type and styles, separate from the portal (which keeps the Pitch Caller design system in
// app/globals.css). Archivo for headlines (its width axis gives the condensed heavy call words), Hanken Grotesk for
// reading. Both are self-hosted variable files in ./fonts, so the build needs no network, and each gets a metric-matched
// fallback so the text doesn't move when the real font arrives.
const archivo = localFont({ src: "./fonts/archivo-latin-wdth-normal.woff2", weight: "100 900", display: "swap", variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }], adjustFontFallback: "Arial" });
const hanken = localFont({ src: "./fonts/hanken-grotesk-latin-wght-normal.woff2", weight: "100 900", display: "swap", variable: "--font-hanken", adjustFontFallback: "Arial" });

const TITLE = "PitchIQ: pitch calling for high school, travel and college baseball";
const DESCRIPTION = "PitchIQ calls every pitch from your pitcher's stuff today, the hitter and the count, and tells you why. Built for high school, travel and college coaches.";

// SITE_URL (web/.env.example) makes the share image's address absolute; see lib/site.ts for the fallbacks
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: "PitchIQ: every pitch called, every call explained", description: DESCRIPTION, type: "website", siteName: "PitchIQ" },
  twitter: { card: "summary_large_image", title: "PitchIQ: every pitch called, every call explained", description: DESCRIPTION },
};

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`pq ${archivo.variable} ${hanken.variable}`}>
      <Smooth />
      <GlassFx />
      {children}
    </div>
  );
}
