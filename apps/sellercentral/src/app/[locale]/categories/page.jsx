"use client";

import React, { useState, useEffect } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

/* Build tree from flat list using parent_id */
function buildTree(flat) {
  const map = {};
  flat.forEach(c => (map[c.id] = { ...c, _children: [] }));
  const roots = [];
  flat.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id]._children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

function Node({ cat, depth }) {
  const [open, setOpen] = useState(false);
  const kids = cat._children || [];
  const hasKids = kids.length > 0;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      {/* row */}
      <div
        onClick={() => hasKids && setOpen(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 6,
          cursor: hasKids ? "pointer" : "default",
          background: depth === 0 ? "#f8fafc" : "#fff",
          border: "1px solid #e5e7eb",
          marginBottom: 4,
          userSelect: "none",
        }}
      >
        {/* toggle arrow */}
        <span style={{
          fontSize: 13,
          width: 18,
          textAlign: "center",
          color: "#6b7280",
          display: "inline-block",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform .15s",
          opacity: hasKids ? 1 : 0,
        }}>▶</span>

        <span style={{ fontWeight: depth === 0 ? 700 : 500, fontSize: 14, color: "#111827" }}>
          {cat.name}
        </span>

        <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
          /{cat.slug}
        </span>

        {hasKids && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
            {kids.length} alt kategori
          </span>
        )}
      </div>

      {/* children */}
      {hasKids && open && (
        <div style={{ marginLeft: 20, marginBottom: 4, borderLeft: "2px solid #e5e7eb", paddingLeft: 8 }}>
          {kids.map(k => <Node key={k.id} cat={k} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [roots, setRoots] = useState(null); // null = loading
  const [flat, setFlat] = useState([]);
  const [error, setError] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    getMedusaAdminClient()
      .getAdminHubCategories({ all: true })
      .then(d => {
        const list = d.categories || [];
        setFlat(list);
        setRoots(buildTree(list));
      })
      .catch(e => setError(String(e)));
  }, []);

  const toggle = (open) => { setAllOpen(open); setKey(k => k + 1); };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: "#111827" }}>Kategoriler</h1>

        {error && <p style={{ color: "red" }}>{error}</p>}

        {/* debug satırı — veriyi kontrol etmek için */}
        {roots !== null && (
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            Toplam: {flat.length} &nbsp;|&nbsp; Ana kategori: {roots.length} &nbsp;|&nbsp;
            Alt kategorisi olan: {flat.filter(c => c.parent_id).length}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => toggle(true)}  style={{ padding: "5px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}>Tümünü Aç</button>
          <button onClick={() => toggle(false)} style={{ padding: "5px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}>Tümünü Kapat</button>
        </div>

        {roots === null ? (
          <p style={{ color: "#6b7280" }}>Yükleniyor…</p>
        ) : roots.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Kategori bulunamadı.</p>
        ) : (
          <div key={key}>
            {roots.map(r => <Node key={r.id} cat={r} depth={0} initialOpen={allOpen} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
