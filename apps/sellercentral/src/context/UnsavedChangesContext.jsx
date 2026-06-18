"use client";

import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { routing } from "@/i18n/routing";

const UnsavedChangesContext = createContext(null);

function getLocalizedPath(url) {
  if (typeof window === "undefined") return url;
  const pathname = window.location.pathname || "";
  const locale = (pathname.match(/^\/([^/]+)/) || [])[1];
  const validLocale = locale && routing.locales.includes(locale) ? locale : routing.defaultLocale;
  return url.startsWith("/") ? `/${validLocale}${url}` : `/${validLocale}/${url}`;
}

export function UnsavedChangesProvider({ children }) {
  const router = useRouter();
  const [isDirty, setDirty] = useState(false);
  const [showNavigateConfirm, setShowNavigateConfirm] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const saveHandlerRef = useRef(null);
  const discardHandlerRef = useRef(null);

  const setHandlers = useCallback(({ onSave, onDiscard } = {}) => {
    saveHandlerRef.current = onSave || null;
    discardHandlerRef.current = onDiscard || null;
  }, []);

  const clearHandlers = useCallback(() => {
    saveHandlerRef.current = null;
    discardHandlerRef.current = null;
  }, []);

  const runSave = useCallback(async () => {
    const fn = saveHandlerRef.current;
    if (typeof fn !== "function") return;
    try {
      const result = await Promise.resolve(fn());
      if (result === false) return;
      setDirty(false);
      setShowNavigateConfirm(false);
      if (pendingNav) {
        const to = getLocalizedPath(pendingNav);
        setPendingNav(null);
        router.push(to);
      }
    } catch {
      // Keep dirty state when save fails
    }
  }, [pendingNav, router]);

  const runDiscard = useCallback(() => {
    const fn = discardHandlerRef.current;
    if (typeof fn === "function") fn();
    setDirty(false);
    setShowNavigateConfirm(false);
    if (pendingNav) {
      const to = getLocalizedPath(pendingNav);
      setPendingNav(null);
      router.push(to);
    }
  }, [pendingNav, router]);

  const startNavigate = useCallback((url) => {
    setPendingNav(url);
    setShowNavigateConfirm(true);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const value = useMemo(
    () => ({
      isDirty,
      setDirty,
      setHandlers,
      clearHandlers,
      showNavigateConfirm,
      setShowNavigateConfirm,
      pendingNav,
      startNavigate,
      runSave,
      runDiscard,
    }),
    [
      isDirty,
      setDirty,
      setHandlers,
      clearHandlers,
      showNavigateConfirm,
      pendingNav,
      startNavigate,
      runSave,
      runDiscard,
    ],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) return null;
  return ctx;
}
