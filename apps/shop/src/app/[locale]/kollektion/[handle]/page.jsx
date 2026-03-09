"use client";

import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect } from "react";

export default function KollektionRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const handle = params?.handle != null ? String(params.handle) : "";

  useEffect(() => {
    if (handle) router.replace(`/${handle}`);
  }, [handle, router]);

  return null;
}
