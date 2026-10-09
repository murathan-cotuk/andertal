"use client";

import { Suspense } from "react";
import JtlConnectPage from "@/components/pages/integrations/JtlConnectPage";

// JTL Partner Portal update URL (SCX): /<locale>/integrations/jtl/update?session=…
export default function JtlUpdate() {
  return (
    <Suspense fallback={null}>
      <JtlConnectPage mode="update" />
    </Suspense>
  );
}
