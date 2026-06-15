"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from "react";

const SellerImpersonationContext = createContext(null);

export function SellerImpersonationProvider({ children }) {
  const [tabs, setTabs] = useState([]); // [{ id, token, sellerId, storeName, email }]
  const [expandedId, setExpandedId] = useState(null);
  const savedRef = useRef(null);

  const _snapshot = () => ({
    sellerToken: localStorage.getItem("sellerToken") || "",
    sellerId: localStorage.getItem("sellerId") || "",
    storeName: localStorage.getItem("storeName") || "",
    sellerEmail: localStorage.getItem("sellerEmail") || "",
    sellerIsSuperuser: localStorage.getItem("sellerIsSuperuser") || "false",
  });

  const _applyContext = (tab) => {
    localStorage.setItem("sellerToken", tab.token || "");
    localStorage.setItem("sellerId", tab.sellerId || "");
    localStorage.setItem("storeName", tab.storeName || "");
    localStorage.setItem("sellerEmail", tab.email || "");
    localStorage.setItem("sellerIsSuperuser", "false");
    window.dispatchEvent(new CustomEvent("andertal-impersonation-changed", { detail: tab }));
  };

  const _restoreSuperuser = () => {
    const ctx = savedRef.current;
    if (!ctx) return;
    localStorage.setItem("sellerToken", ctx.sellerToken);
    localStorage.setItem("sellerId", ctx.sellerId);
    localStorage.setItem("storeName", ctx.storeName);
    localStorage.setItem("sellerEmail", ctx.sellerEmail);
    localStorage.setItem("sellerIsSuperuser", ctx.sellerIsSuperuser);
    window.dispatchEvent(new CustomEvent("andertal-impersonation-changed", { detail: null }));
  };

  const openTab = useCallback((sellerInfo, token) => {
    const tab = {
      id: sellerInfo.id,
      token,
      sellerId: sellerInfo.seller_id || sellerInfo.id,
      storeName: sellerInfo.store_name || sellerInfo.email || "",
      email: sellerInfo.email || "",
    };

    setTabs((prev) => {
      if (prev.length === 0) savedRef.current = _snapshot();
      const exists = prev.find((t) => t.id === tab.id);
      return exists ? prev : [...prev, tab];
    });

    setExpandedId(tab.id);
    setTimeout(() => _applyContext(tab), 0);
  }, []);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setExpandedId(null);
        setTimeout(_restoreSuperuser, 0);
      } else {
        setExpandedId((eid) => {
          if (eid === id) {
            const last = next[next.length - 1];
            setTimeout(() => _applyContext(last), 0);
            return last.id;
          }
          return eid;
        });
      }
      return next;
    });
  }, []);

  const switchTab = useCallback((id) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (tab) {
        setExpandedId(id);
        setTimeout(() => _applyContext(tab), 0);
      }
      return prev;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedId(null);
    _restoreSuperuser();
  }, []);

  const expandTab = useCallback((id) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (tab) {
        setExpandedId(id);
        setTimeout(() => _applyContext(tab), 0);
      }
      return prev;
    });
  }, []);

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
