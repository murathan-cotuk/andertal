"use client";

import { Suspense } from "react";
import JtlConnectPage from "@/components/pages/integrations/JtlConnectPage";

// Connection status (also reachable without a JTL session).
export default function JtlIntegration() {
  return (
    <Suspense fallback={null}>
      <JtlConnectPage mode="signup" />
    </Suspense>
  );
}
