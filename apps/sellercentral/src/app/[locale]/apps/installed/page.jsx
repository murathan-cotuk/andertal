"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function InstalledAppsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/integrations?tab=installed");
  }, [router]);
  return null;
}
