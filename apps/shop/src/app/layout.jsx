import "./globals.css";
import ShopStylesInjector from "@/components/ShopStylesInjector";

/* Safari / iOS status area + first paint: keep in sync with --header-bg fallback in ShopHeader (MIDDLE_BAR_BG) */
const DEFAULT_STATUS_THEME = "#1b8880";

const DEFAULT_HOME_TITLE = "Andertal - Your Marketplace";
const DEFAULT_HOME_DESCRIPTION = "Discover amazing products from independent sellers";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

async function getHomepageMetaFromStyles() {
  try {
    const res = await fetch(`${getBackendUrl()}/store/styles`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const styles = data?.styles && typeof data.styles === "object" ? data.styles : {};
    const title = typeof styles.seo_home_title === "string" ? styles.seo_home_title.trim() : "";
    const description = typeof styles.seo_home_description === "string" ? styles.seo_home_description.trim() : "";
    return {
      title: title || DEFAULT_HOME_TITLE,
      description: description || DEFAULT_HOME_DESCRIPTION,
    };
  } catch {
    return { title: DEFAULT_HOME_TITLE, description: DEFAULT_HOME_DESCRIPTION };
  }
}

export async function generateMetadata() {
  const { title, description } = await getHomepageMetaFromStyles();
  const brand = String(title).split(" - ")[0]?.trim() || "Andertal";
  return {
    title: {
      default: title,
      template: `%s | ${brand}`,
    },
    description,
    openGraph: {
      title,
      description,
    },
    /* iOS Safari: tints the status bar / top chrome; client updates this when --header-bg is loaded from store theme */
    themeColor: DEFAULT_STATUS_THEME,
  };
}

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
