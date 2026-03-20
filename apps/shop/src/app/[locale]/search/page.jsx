"use client";

import React, { Suspense } from "react";
import SearchTemplate from "@/components/templates/SearchTemplate";

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, color: "#6b7280", textAlign: "center" }}>Loading...</div>}>
      <SearchTemplate />
    </Suspense>
  );
}
