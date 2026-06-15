"use client";

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
