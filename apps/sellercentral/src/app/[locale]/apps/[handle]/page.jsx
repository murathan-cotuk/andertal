"use client";

import { use, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function AppDetailRedirect({ params }) {
  const { handle } = use(params);
  const router = useRouter();
  useEffect(() => {
    const q = handle ? `tab=store&app=${encodeURIComponent(handle)}` : "tab=store";
    router.replace(`/settings/integrations?${q}`);
  }, [router, handle]);
  return null;
}
