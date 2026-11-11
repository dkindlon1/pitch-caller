import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { SmoothScroll } from "./_components/SmoothScroll";
import { ScrollFx } from "./_components/ScrollFx";
import "./marketing.css";
import { SITE_ORIGIN } from "@/lib/site";

// The public site: its own type and styles, separate from the portal (which keeps the Pitch Caller design system in
// app/globals.css). One variable family, set tight for headlines and at regular width for reading.
const sans = Instrument_Sans({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap", variable: "--mk-font" });

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
    <div className={`mk ${sans.variable}`}>
      <SmoothScroll />
      <ScrollFx />
      {children}
    </div>
  );
}
