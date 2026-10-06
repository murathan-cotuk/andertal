/**
 * Fonts are self-hosted from repo files (src/fonts, Google Fonts latin + latin-ext subsets) via
 * next/font/local. next/font/google downloaded them at BUILD time, and Google answers some build
 * hosts (GitHub Actions) with `/l/font?kit=…&skey=…` URLs that Turbopack cannot parse
 * ("next/font/google queries have exactly one entry") → the shop build failed in CI.
 *
 * Each family is two faces split by unicode-range exactly like Google serves them: `latin` and
 * `latin-ext` (ğ ş ı İ, ő ű, ł …). The latin face has no adjusted fallback so characters outside
 * its range fall through to the latin-ext face instead of the metric-adjusted Arial; the latin-ext
 * face carries the adjusted fallback (no layout shift). Same files / weights as before.
 */
import localFont from "next/font/local";

const interLatin = localFont({
  src: [
    { path: "../fonts/inter-latin-400-700-normal.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-inter-latin",
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const interExt = localFont({
  src: [
    { path: "../fonts/inter-latin-ext-400-700-normal.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-inter-ext",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const manropeLatin = localFont({
  src: [
    { path: "../fonts/manrope-latin-400-800-normal.woff2", weight: "400 800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-manrope-latin",
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const manropeExt = localFont({
  src: [
    { path: "../fonts/manrope-latin-ext-400-800-normal.woff2", weight: "400 800", style: "normal" },
  ],
  display: "swap",
  variable: "--font-manrope-ext",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const instrumentSerifLatin = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-instrument-serif-latin",
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const instrumentSerifExt = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-ext-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-instrument-serif-ext",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});
const montserratLatin = localFont({
  src: [
    { path: "../fonts/montserrat-latin-400-700-normal.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-montserrat-latin",
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const montserratExt = localFont({
  src: [
    { path: "../fonts/montserrat-latin-ext-400-700-normal.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-montserrat-ext",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

/** Pair of faces → one object with the same surface the old next/font/google objects had. */
const pair = (latin, ext) => ({
  variable: `${latin.variable} ${ext.variable}`,
  className: `${latin.className} ${ext.className}`,
  style: { fontFamily: `${latin.style.fontFamily}, ${ext.style.fontFamily}` },
});

// CSS: --font-inter-latin / --font-inter-ext (globals.css --font-sans), --font-manrope-*,
// --font-instrument-serif-* (BecomeSellerLanding.module.css).
export const inter = pair(interLatin, interExt);
export const manrope = pair(manropeLatin, manropeExt);
export const instrumentSerif = pair(instrumentSerifLatin, instrumentSerifExt);
export const montserrat = pair(montserratLatin, montserratExt);
