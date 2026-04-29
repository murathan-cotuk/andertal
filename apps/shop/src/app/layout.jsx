import "./globals.css";
import ShopStylesInjector from "@/components/ShopStylesInjector";

/* Safari / iOS status area + first paint: keep in sync with --header-bg fallback in ShopHeader (MIDDLE_BAR_BG) */
const DEFAULT_STATUS_THEME = "#1b8880";

export const metadata = {
  title: {
    default: "Andertal - Your Marketplace",
    template: "%s | Andertal",
  },
  description: "Discover amazing products from independent sellers",
  openGraph: {
    title: "Andertal - Your Marketplace",
    description: "Discover amazing products from independent sellers",
  },
  /* iOS Safari: tints the status bar / top chrome; client updates this when --header-bg is loaded from store theme */
  themeColor: DEFAULT_STATUS_THEME,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ShopStylesInjector />
        {children}
      </body>
    </html>
  );
}

