"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://api.andertal.com").replace(/\/$/, "");

export default function SignRedirectPage() {
  const { token } = useParams();

  useEffect(() => {
    if (token) {
      window.location.replace(`${BACKEND_URL}/seller/sign/${token}`);
    }
  }, [token]);

  return null;
}
