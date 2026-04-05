"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@belucha/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

function CategoryTreeNode({ node, depth, initialOpen }) {
  const [open, setOpen] = useState(!!initialOpen);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  return (
    <div>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 9,
          paddingBottom: 9,
          paddingRight: 16,
          paddingLeft: 16 + depth * 24,
          borderBottom: "1px solid #f3f4f6",
          cursor: hasChildren ? "pointer" : "default",
          background: "#fff",
          userSelect: "none",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#f9fafb"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
      >
        <span style={{
          display: "inline-block",
          width: 16,
          flexShrink: 0,
          fontSize: 16,
          fontWeight: 700,
          color: "#6b7280",
          textAlign: "center",
          transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          visibility: hasChildren ? "visible" : "hidden",
        }}>›</span>

        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{node.name}</span>
        <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{node.slug}</span>

        {node.is_visible && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#dbeafe", color: "#1e40af" }}>Nav</span>}
        {node.has_collection && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#d1fae5", color: "#065f46" }}>Collection</span>}
        {!node.active && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#fee2e2", color: "#991b1b" }}>Pasif</span>}
        {hasChildren && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>{node.children.length} alt</span>}
      </div>

      {hasChildren && open && node.children.map(child => (
        <CategoryTreeNode key={child.id} node={child} depth={depth + 1} initialOpen={initialOpen} />
      ))}
    </div>
  );
}

function countNodes(arr) {
  return arr.reduce((s, n) => s + 1 + countNodes(n.children || []), 0);
}

export default function CategoriesPage() {
  const [tree, setTree] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandAll, setExpandAll] = useState(false);
  const [treeKey, setTreeKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const client = getMedusaAdminClient();
        // { all: true } skips the active=true filter, tree:'true' triggers ?tree=true on backend
        const data = await client.getAdminHubCategories({ all: true, tree: "true" });
        // client returns { categories: data.tree } when backend sends { tree: [...] }
        const nodes = data.categories || [];
        setTree(nodes);
        setTotal(countNodes(nodes));
      } catch (e) {
        console.error(e);
        setError("Kategoriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleExpandAll = () => { setExpandAll(true);  setTreeKey(k => k + 1); };
  const handleCollapseAll = () => { setExpandAll(false); setTreeKey(k => k + 1); };

  const btnStyle = { fontSize: 12, padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, color: "#1f2937" }}>Kategoriler</h1>
        <Card style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{total} kategori</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnStyle} onClick={handleExpandAll}>Tümünü Aç</button>
              <button style={btnStyle} onClick={handleCollapseAll}>Tümünü Kapat</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Yükleniyor…</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>{error}</div>
          ) : tree.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Henüz kategori yok.</div>
          ) : (
            <div key={treeKey} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {tree.map(node => (
                <CategoryTreeNode key={node.id} node={node} depth={0} initialOpen={expandAll} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
