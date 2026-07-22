"use client";

import Script from "next/script";

/**
 * Görev 28: GA4 pageview/conversion tracking — off by default (renders nothing) until
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is set in the environment, so no analytics ships until
 * someone deliberately turns it on with a real measurement ID (Google Analytics 4 →
 * Admin → Data Streams → Web → "G-XXXXXXXXXX").
 */
export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
