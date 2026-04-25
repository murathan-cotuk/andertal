"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import AccountSidebar from "./AccountSidebar";
import AccountMobileHeader from "./AccountMobileHeader";

export default function AccountPageLayout({ children, onLogout }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setShowSidebar(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const handleLogout = onLogout ?? (() => { logout(); router.push("/"); });

  return (
    <div>
      <AccountMobileHeader onLogout={handleLogout} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showSidebar ? "220px 1fr" : "1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {showSidebar && (
          <AccountSidebar onLogout={handleLogout} />
        )}
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
