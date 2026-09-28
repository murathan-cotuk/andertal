"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import AccountSidebar from "./AccountSidebar";
import AccountMobileHeader from "./AccountMobileHeader";

/** Konto “Übersicht” ile aynı dış kutu: max genişlik + mobil/desktop padding */
export const ACCOUNT_PAGE_MAIN_INNER = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "24px 16px 56px",
};

const DARK = "var(--body-color, #1d1b18)";
const GRAY = "#5e574e";

/** title / description: Übersicht sayfasında kullanılmaz; diğer konto sayfalarında greeting’den sonra içerik sütununda */
export default function AccountPageLayout({ children, onLogout, title, description }) {
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

  const hasTitle = title != null && title !== "";
  return (
    <div>
      <AccountMobileHeader onLogout={handleLogout} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showSidebar ? "260px 1fr" : "1fr",
          gap: 28,
          alignItems: "start",
        }}
      >
        {showSidebar && (
          <AccountSidebar onLogout={handleLogout} />
        )}
        <div style={{ minWidth: 0 }}>
          {hasTitle && (
            <div style={{ marginBottom: 16 }}>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--h1-ff, inherit)",
                  fontSize: "clamp(1.5rem, 3vw, 2.1rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.015em",
                  color: DARK,
                  lineHeight: 1.15,
                }}
              >
                {title}
              </h1>
              {description != null && description !== "" && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 14,
                    color: GRAY,
                    lineHeight: 1.5,
                  }}
                >
                  {description}
                </p>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
