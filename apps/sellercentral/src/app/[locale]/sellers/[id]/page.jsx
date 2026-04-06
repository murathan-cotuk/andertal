"use client";
import DashboardLayout from "@/components/DashboardLayout";
import SellerDetailPage from "@/components/pages/SellerDetailPage";

export default function SellerDetail({ params }) {
  return (
    <DashboardLayout>
      <SellerDetailPage sellerId={params.id} />
    </DashboardLayout>
  );
}
