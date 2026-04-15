"use client";

import { useEffect } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

/**
 * Lazily initializes PostHog analytics.
 * Set NEXT_PUBLIC_POSTHOG_KEY in .env to enable.
 * EU endpoint used by default (GDPR-friendly).
 */
export default function PostHogProvider({ children }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) return;
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
      });
    });
  }, []);

  return children;
}
