import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { SmoothScroll } from "./_components/SmoothScroll";
import "./marketing.css";

// The public site: its own type and styles, separate from the portal (which keeps the Pitch Caller design system in
// app/globals.css). One variable family, set tight for headlines and at regular width for reading.
const sans = Instrument_Sans({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap", variable: "--mk-font" });

export const metadata: Metadata = {
  title: "PitchIQ: pitch calling for high school, travel and college baseball",
  description:
    "PitchIQ calls every pitch from your pitcher's stuff today, the hitter and the count, and tells you why. Built for high school, travel and college coaches.",
};

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`mk ${sans.variable}`}>
      <SmoothScroll />
      {children}
    </div>
  );
}
