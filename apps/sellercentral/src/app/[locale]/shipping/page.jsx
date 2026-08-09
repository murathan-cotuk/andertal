"use client";
import { Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import VersandPage from "@/components/pages/VersandPage";
export default function ShippingRoute() {
  return <DashboardLayout><Suspense fallback={null}><VersandPage /></Suspense></DashboardLayout>;
}
