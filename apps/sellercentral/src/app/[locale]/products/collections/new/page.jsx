"use client";

import DashboardLayout from "@/components/DashboardLayout";
import CollectionEditPage from "@/components/pages/products/CollectionEditPage";

export default function NewCollectionPage() {
  return (
    <DashboardLayout>
      <CollectionEditPage isNew />
    </DashboardLayout>
  );
}
