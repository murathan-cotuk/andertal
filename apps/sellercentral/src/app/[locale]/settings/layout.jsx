"use client";

import DashboardLayout from "@/components/DashboardLayout";
import SettingsLayout from "@/components/SettingsLayout";

export default function SettingsRootLayout({ children }) {
  return (
    <DashboardLayout>
      <SettingsLayout>{children}</SettingsLayout>
    </DashboardLayout>
  );
}
