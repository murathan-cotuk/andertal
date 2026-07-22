import "./globals.css";
import Script from "next/script";
import TrustpilotInviteBootstrap from "@/components/TrustpilotInviteBootstrap";
import UnhandledRejectionGuard from "@/components/UnhandledRejectionGuard";
import GoogleAnalytics from "@/components/GoogleAnalytics";

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
    /*
     * "Add to Home Screen" (iOS): without statusBarStyle="black-translucent" the OS paints its
     * own opaque status bar over the safe-area, so ShopHeader's ::before safe-area-fill (which
     * mirrors the live header color/gradient there) never becomes visible — the fixed fallback
     * teal (MIDDLE_BAR_BG) is what actually shows through instead. black-translucent makes that
     * area transparent so the page's own CSS underneath is what the user sees.
     */
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: brand,
    },
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
    <html
      lang="en"
      translate="no"
      className="notranslate"
      suppressHydrationWarning
    >
      <head>
        {/*
          Chrome “Bu sayfayı çevir”, DOM’a müdahale ederek React/styled-components ile uyumsuzluk ve footer/grid dağılması yapıyor.
          Dil için yerleşik locale rotaları ve dil seçici kullanılıyor (next-intl).
        */}
        <meta name="google" content="notranslate" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        {/*
          Register before React / Next overlay: noisy Promise rejects with raw DOM Events
          stringify as "[object Event]". Duplicate logic documented in lib/unhandled-rejection-suppress.js
        */}
        <Script id="suppress-dom-event-unhandledreject" strategy="beforeInteractive">
          {`(function(){var K=['[object Event]','[object ErrorEvent]','[object ProgressEvent]','[object AnimationEvent]','[object UIEvent]'];function ign(r){if(!r)return false;try{var t=Object.prototype.toString.call(r);if(K.indexOf(t)!==-1)return true}catch(e){}if(typeof Event!=='undefined'&&r instanceof Event)return true;if(typeof ErrorEvent!=='undefined'&&r instanceof ErrorEvent)return true;var n=r&&r.constructor&&r.constructor.name;return n==='Event'||n==='ProgressEvent'||n==='ErrorEvent'}window.addEventListener('unhandledrejection',function(e){if(ign(e.reason)){e.preventDefault()}},true)})();`}
        </Script>
        <UnhandledRejectionGuard />
        <TrustpilotInviteBootstrap />
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
