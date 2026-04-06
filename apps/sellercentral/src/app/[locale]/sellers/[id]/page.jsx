"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import SellerDetailPage from "@/components/pages/SellerDetailPage";

export default function SellerDetail() {
  const params = useParams();
  const sellerId = params?.id != null ? String(params.id) : "";

  return (
    <DashboardLayout>
      <SellerDetailPage sellerId={sellerId} />
    </DashboardLayout>
  );
}
