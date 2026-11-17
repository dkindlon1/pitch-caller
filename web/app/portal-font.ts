import localFont from "next/font/local";

// The signed-in screens' type, the public site's two typefaces: Archivo for headlines and figures (its width axis gives
// the condensed heavy numerals), Hanken Grotesk for everything else. These are the app's own cuts (./fonts): full Latin
// with accents, because a roster has real names in it, where the site's files carry only the letters its pages use.
// Self-hosted, so the build needs no network. app/portal.css reads --font-archivo and --font-hanken.
const archivo = localFont({ src: "./fonts/archivo-app.woff2", weight: "600 900", display: "swap", variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "62% 110%" }], adjustFontFallback: "Arial" });
const hanken = localFont({ src: "./fonts/hanken-app.woff2", weight: "400 800", display: "swap", variable: "--font-hanken", adjustFontFallback: "Arial" });

export const portalFonts = `${archivo.variable} ${hanken.variable}`;
