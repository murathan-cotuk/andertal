"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";

export function useLt() {
  const locale = useLocale();
  return useCallback(
    (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de),
    [locale],
  );
}
