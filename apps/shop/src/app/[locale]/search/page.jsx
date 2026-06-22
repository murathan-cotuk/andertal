"use client";

import React, { Suspense } from "react";
import SearchTemplate from "@/components/templates/SearchTemplate";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchTemplate />
    </Suspense>
  );
}
