"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { setTabAuthOverlay } from "@/lib/tab-scoped-auth-storage";

/**
 * Seller Impersonation Context
 *
 * Superusers can open multiple seller sessions as "tabs" in a bottom panel.
 * Expanding a tab swaps localStorage so the app acts as that seller;
 * collapsing restores the real superuser session.
 *
 * Superuser credentials + open tabs are persisted so a page refresh can never
 * leave the user stuck as a seller without the bottom panel.
 */

const SellerImpersonationContext = createContext(null);

const SESSION_KEY = "andertal_seller_impersonation_v1";
const SU_BACKUP_KEY = "andertal_su_auth_backup";

function _snapshot() {
  return {
    sellerToken: localStorage.getItem("sellerToken") || "",
    sellerId: localStorage.getItem("sellerId") || "",
    storeName: localStorage.getItem("storeName") || "",
    sellerEmail: localStorage.getItem("sellerEmail") || "",
    sellerIsSuperuser: localStorage.getItem("sellerIsSuperuser") || "false",
  };
}

function _applyContext(tab) {
  setTabAuthOverlay(true);
  localStorage.setItem("sellerToken", tab.token || "");
  localStorage.setItem("sellerId", tab.sellerId || "");
  localStorage.setItem("storeName", tab.storeName || "");
  localStorage.setItem("sellerEmail", tab.email || "");
  localStorage.setItem("sellerIsSuperuser", "false");
  window.dispatchEvent(new CustomEvent("andertal-impersonation-changed", { detail: tab }));
}

function _restoreSuperuserFrom(ctx) {
  if (!ctx) return;
  setTabAuthOverlay(false);
  localStorage.setItem("sellerToken", ctx.sellerToken || "");
  localStorage.setItem("sellerId", ctx.sellerId || "");
  localStorage.setItem("storeName", ctx.storeName || "");
  localStorage.setItem("sellerEmail", ctx.sellerEmail || "");
  localStorage.setItem("sellerIsSuperuser", ctx.sellerIsSuperuser || "false");
  window.dispatchEvent(new CustomEvent("andertal-impersonation-changed", { detail: null }));
}

function _readBackup() {
  try {
    const raw = sessionStorage.getItem(SU_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.sellerToken) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function _writeBackup(snap) {
  if (!snap?.sellerToken) return;
  try {
    sessionStorage.setItem(SU_BACKUP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function _clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSellerImpersonationStorage() {
  _clearSession();
  try {
    sessionStorage.removeItem(SU_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

export function SellerImpersonationProvider({ children }) {
  const [tabs, setTabs] = useState([]); // [{ id, token, sellerId, storeName, email }]
  const [expandedId, setExpandedId] = useState(null);
  const [ready, setReady] = useState(false);
  const savedRef = useRef(null);
  const hydratedRef = useRef(false);

  const persist = useCallback((nextTabs, nextExpandedId, saved) => {
    try {
      if (!nextTabs?.length) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          tabs: nextTabs,
          expandedId: nextExpandedId,
          saved: saved || savedRef.current,
        }),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const ensureSavedSuperuser = useCallback(() => {
    if (savedRef.current?.sellerToken) {
      _writeBackup(savedRef.current);
      return savedRef.current;
    }
    const backup = _readBackup();
    if (backup?.sellerToken) {
      savedRef.current = backup;
      return backup;
    }
    if (localStorage.getItem("sellerIsSuperuser") === "true") {
      const snap = _snapshot();
      if (snap.sellerToken) {
        savedRef.current = snap;
        _writeBackup(snap);
        return snap;
      }
    }
    return savedRef.current;
  }, []);

  const _restoreSuperuser = useCallback(() => {
    const ctx = ensureSavedSuperuser();
    _restoreSuperuserFrom(ctx);
  }, [ensureSavedSuperuser]);

  // Rehydrate after refresh — restore panel, or at least restore superuser.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (typeof window === "undefined") return;

    let restored = false;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.saved?.sellerToken) {
          savedRef.current = parsed.saved;
          _writeBackup(parsed.saved);
        } else {
          ensureSavedSuperuser();
        }

        const nextTabs = Array.isArray(parsed?.tabs)
          ? parsed.tabs.filter((t) => t?.token && (t?.sellerId || t?.id))
          : [];

        if (nextTabs.length > 0) {
          setTabs(nextTabs);
          const preferred =
            nextTabs.find((t) => t.id === parsed.expandedId) || null;
          setExpandedId(preferred ? preferred.id : null);

          if (preferred) {
            _applyContext(preferred);
          } else {
            _restoreSuperuser();
          }
          restored = true;
        }
      }
    } catch {
      /* fall through */
    }

    if (!restored) {
      // Orphaned seller token after refresh (pre-fix): restore superuser if backup exists
      const backup = _readBackup();
      const isSu = localStorage.getItem("sellerIsSuperuser") === "true";
      if (backup?.sellerToken && !isSu) {
        savedRef.current = backup;
        _restoreSuperuserFrom(backup);
        _clearSession();
      }
    }
    setReady(true);
  }, [ensureSavedSuperuser, _restoreSuperuser]);

  // Keep sessionStorage in sync (only after hydrate, so we never wipe restored tabs)
  useEffect(() => {
    if (!ready) return;
    persist(tabs, expandedId, savedRef.current);
  }, [ready, tabs, expandedId, persist]);

  const openTab = useCallback(
    (sellerInfo, token) => {
      const tab = {
        id: sellerInfo.id,
        token,
        sellerId: sellerInfo.seller_id || sellerInfo.id,
        storeName: sellerInfo.store_name || sellerInfo.email || "",
        email: sellerInfo.email || "",
      };

      setTabs((prev) => {
        if (prev.length === 0) {
          ensureSavedSuperuser();
          if (!savedRef.current?.sellerToken) {
            savedRef.current = _snapshot();
            _writeBackup(savedRef.current);
          }
        }
        const exists = prev.find((t) => t.id === tab.id);
        if (exists) {
          // Refresh token on re-open
          const updated = prev.map((t) => (t.id === tab.id ? { ...t, ...tab } : t));
          persist(updated, tab.id, savedRef.current);
          return updated;
        }
        const next = [...prev, tab];
        persist(next, tab.id, savedRef.current);
        return next;
      });

      setExpandedId(tab.id);
      setTimeout(() => _applyContext(tab), 0);
    },
    [ensureSavedSuperuser, persist],
  );

  const closeTab = useCallback(
    (id) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          setExpandedId(null);
          setTimeout(_restoreSuperuser, 0);
          _clearSession();
        } else {
          setExpandedId((eid) => {
            if (eid === id) {
              const last = next[next.length - 1];
              setTimeout(() => _applyContext(last), 0);
              persist(next, last.id, savedRef.current);
              return last.id;
            }
            persist(next, eid, savedRef.current);
            return eid;
          });
        }
        return next;
      });
    },
    [_restoreSuperuser, persist],
  );

  const switchTab = useCallback(
    (id) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === id);
        if (tab) {
          setExpandedId(id);
          setTimeout(() => _applyContext(tab), 0);
          persist(prev, id, savedRef.current);
        }
        return prev;
      });
    },
    [persist],
  );

  const collapseAll = useCallback(() => {
    setExpandedId(null);
    _restoreSuperuser();
    persist(tabs, null, savedRef.current);
  }, [_restoreSuperuser, persist, tabs]);

  const expandTab = useCallback(
    (id) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === id);
        if (tab) {
          ensureSavedSuperuser();
          setExpandedId(id);
          setTimeout(() => _applyContext(tab), 0);
          persist(prev, id, savedRef.current);
        }
        return prev;
      });
    },
    [ensureSavedSuperuser, persist],
  );

  const isExpanded = expandedId !== null;
  const activeTab = tabs.find((t) => t.id === expandedId) || null;

  return (
    <SellerImpersonationContext.Provider
      value={{ tabs, expandedId, isExpanded, activeTab, openTab, closeTab, switchTab, collapseAll, expandTab }}
    >
      {children}
    </SellerImpersonationContext.Provider>
  );
}

export function useSellerImpersonation() {
  return useContext(SellerImpersonationContext);
}
