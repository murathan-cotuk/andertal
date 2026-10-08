"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PasswordResetCard from "@/components/auth/PasswordResetCard";

function ResetInner() {
  const token = useSearchParams().get("token") || "";
  return <PasswordResetCard mode="reset" token={token} />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
