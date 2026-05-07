"use client";

import { useLayoutEffect } from "react";
import { shouldSuppressUnhandledReason } from "@/lib/unhandled-rejection-suppress";

export default function UnhandledRejectionGuard() {
  useLayoutEffect(() => {
    const onUnhandledRejection = (event) => {
      if (!shouldSuppressUnhandledReason(event?.reason)) return;
      event.preventDefault();
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[UnhandledRejectionGuard] Suppressed rejection with DOM event reason (often third-party / extension). See unhandled-rejection-suppress.js",
        );
      }
    };

    /* Capture phase: run before bubbling listeners (incl. some devtools hooks). */
    window.addEventListener("unhandledrejection", onUnhandledRejection, true);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
  }, []);

  return null;
}
