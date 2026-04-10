"use client";

import React, { Suspense } from "react";
import SearchTemplate from "@/components/templates/SearchTemplate";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";

export default function SearchPage() {
  return (
    <Suspense fallback={<GlobalPageLoader label="Suche wird geladen..." />}>
      <SearchTemplate />
    </Suspense>
  );
}
