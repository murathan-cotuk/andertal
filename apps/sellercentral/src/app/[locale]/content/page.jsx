"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ContentIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/content/media");
  }, [router]);
  return null;
}
