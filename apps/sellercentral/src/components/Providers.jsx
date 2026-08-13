"use client";

import "@/lib/tab-scoped-auth-storage";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";
import { SellerImpersonationProvider } from "@/context/SellerImpersonationContext";

export default function Providers({ children }) {
  return (
    <UnsavedChangesProvider>
      <SellerImpersonationProvider>
        {children}
      </SellerImpersonationProvider>
    </UnsavedChangesProvider>
  );
}
