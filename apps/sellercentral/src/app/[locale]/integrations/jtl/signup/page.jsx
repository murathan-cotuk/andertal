"use client";

import { Suspense } from "react";
import JtlConnectPage from "@/components/pages/integrations/JtlConnectPage";

// JTL Partner Portal signup URL (SCX): /<locale>/integrations/jtl/signup?session=…
export default function JtlSignup() {
  return (
    <Suspense fallback={null}>
      <JtlConnectPage mode="signup" />
    </Suspense>
  );
}
