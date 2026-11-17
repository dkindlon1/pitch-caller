import localFont from "next/font/local";

// The public site's type: Archivo for headlines (its width axis gives the condensed heavy call words), Hanken Grotesk
// for reading. Both are self-hosted variable files in ./fonts, cut down to the characters, weights and widths the site
// uses (fonttools; Archivo keeps weight 600 to 900 and width 62 to 110), so the build needs no network. Each gets a
// metric-matched fallback so the text doesn't move when the real font arrives. Shared by the site's layout, the legal
// pages and the not-found page.
const archivo = localFont({ src: "./fonts/archivo-site.woff2", weight: "600 900", display: "swap", variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "62% 110%" }], adjustFontFallback: "Arial" });
const hanken = localFont({ src: "./fonts/hanken-site.woff2", weight: "100 900", display: "swap", variable: "--font-hanken", adjustFontFallback: "Arial" });

export const siteFonts = `${archivo.variable} ${hanken.variable}`;
