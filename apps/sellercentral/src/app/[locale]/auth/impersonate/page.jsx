"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "@/i18n/navigation";

function ImpersonateInner() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const email = params.get("email") || "";
    const sellerId = params.get("seller_id") || "";
    const storeName = params.get("store_name") || "";
    const isSuperuser = params.get("is_superuser") === "true";

    if (!token) {
      router.replace("/login");
      return;
    }

    localStorage.setItem("sellerToken", token);
    localStorage.setItem("sellerEmail", email);
    localStorage.setItem("sellerId", sellerId);
    localStorage.setItem("storeName", storeName);
    localStorage.setItem("sellerIsSuperuser", isSuperuser ? "true" : "false");
    localStorage.setItem("sellerPermissions", "null");
    localStorage.setItem("sellerApprovalStatus", "approved");
    localStorage.setItem("sellerLoggedIn", "true");

    router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f9fafb" }}>
      <p style={{ color: "#6b7280", fontSize: 14 }}>Anmeldung wird vorbereitet…</p>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={null}>
      <ImpersonateInner />
    </Suspense>
  );
}
