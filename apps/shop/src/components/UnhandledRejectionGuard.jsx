"use client";

import { useEffect } from "react";

function isIgnorableUnhandledReason(reason) {
  if (!reason) return false;

  // Some third-party scripts reject with a raw Event object.
  // Next dev overlay renders it as "[object Event]" and crashes the route.
  if (typeof Event !== "undefined" && reason instanceof Event) return true;
  if (typeof ErrorEvent !== "undefined" && reason instanceof ErrorEvent) return true;

  return false;
}

export default function UnhandledRejectionGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event) => {
      if (!isIgnorableUnhandledReason(event?.reason)) return;
      event.preventDefault();
      if (process.env.NODE_ENV === "development") {
        // Keep a visible signal in dev without breaking the page.
        console.warn("[UnhandledRejectionGuard] Ignored Event-based rejection.");
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
