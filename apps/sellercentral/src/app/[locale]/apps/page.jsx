"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function AppsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/integrations?tab=store");
  }, [router]);
  return null;
}
