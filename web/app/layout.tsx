import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// The Pitch Caller design system's three faces: condensed for calls, mono for every number, Barlow for words.
// Only the condensed face is preloaded: the h1 is the largest thing on the first screen. Body text swaps in.
const barlow = Barlow({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--font-barlow", preload: false });
const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], display: "swap", variable: "--font-condensed" });
// Mono only sets numbers, none of which is the first thing painted, so it loads without a preload and swaps in.
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["800"], display: "swap", variable: "--font-mono", preload: false });

export const metadata: Metadata = {
  title: "PitchIQ Baseball: pitch calling for high school, travel and college coaches",
  description:
    "PitchIQ calls each pitch from the count, the hitter and your pitcher's stuff today, plans the whole at-bat, and tells you why. Join the spring waitlist.",
  other: { "page-type": "software", "site-kind": "software" },
};

export const viewport: Viewport = { themeColor: "#07090C", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-type="software" className={`${barlow.variable} ${condensed.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
