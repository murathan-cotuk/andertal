"use client";

import { Suspense } from "react";
import StripeConnectPage from "@/components/pages/settings/StripeConnectPage";

export default function StripeConnectRoute() {
  return (
    <Suspense fallback={null}>
      <StripeConnectPage />
    </Suspense>
  );
}
