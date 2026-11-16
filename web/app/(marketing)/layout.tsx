import type { Metadata } from "next";
import localFont from "next/font/local";
import { SmoothScroll } from "./_components/SmoothScroll";
import { ScrollFx } from "./_components/ScrollFx";
import "./marketing.css";
import "./site.css";
import { SITE_ORIGIN } from "@/lib/site";

// The public site: its own type and styles, separate from the portal (which keeps the Pitch Caller design system in
// app/globals.css). Instrument Serif for headlines (one italic word each), Instrument Sans for reading; both are
// self-hosted files in ./fonts so the build needs no network.
const sans = localFont({ src: "./fonts/InstrumentSans-Variable.woff2", weight: "400 700", display: "swap", variable: "--mk-font" });
const serif = localFont({ src: [{ path: "./fonts/InstrumentSerif-Regular.woff2", style: "normal", weight: "400" }, { path: "./fonts/InstrumentSerif-Italic.woff2", style: "italic", weight: "400" }], display: "swap", variable: "--mk-serif" });

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
    <div className={`mk ${sans.variable} ${serif.variable}`}>
      <SmoothScroll />
      <ScrollFx />
      {children}
    </div>
  );
}
