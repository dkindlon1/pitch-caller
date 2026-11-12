import { Instrument_Sans } from "next/font/google";

// The public site's one typeface, for the signed-in screens too (app/portal.css reads --pq-font).
export const portalSans = Instrument_Sans({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap", variable: "--pq-font" });
