"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/* ───────── helpers ───────── */
function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function isImage(mime) {
  return !mime || mime.startsWith("image/");
}

/** Superuser top section: platform uploads (no seller) or same seller_id as the logged-in account. */
function isSuperuserPlatformOrSelfItem(item, mySellerId) {
  const s = item?.seller_id;
  if (s == null || String(s).trim() === "") return true;
  return String(s) === String(mySellerId || "").trim();
}

function sortMediaList(list, sortKey) {
  const arr = [...(list || [])];
  if (sortKey === "name_asc") {
    arr.sort((a, b) => (a.filename || "").localeCompare(b.filename || "", undefined, { sensitivity: "base" }));
  } else if (sortKey === "name_desc") {
    arr.sort((a, b) => (b.filename || "").localeCompare(a.filename || "", undefined, { sensitivity: "base" }));
  } else if (sortKey === "size_desc") {
    arr.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
  } else if (sortKey === "size_asc") {
    arr.sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));
  } else if (sortKey === "date_asc") {
    arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  } else {
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
  return arr;
}

function MediaTile({ item, onSelect }) {
  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
        overflow: "hidden", cursor: "pointer", transition: "box-shadow .15s",
        position: "relative",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.12)"; e.currentTarget.style.borderColor = "#d1d5db"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
    >
      <div style={{ height: 130, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {isImage(item.mime_type)
          ? <img src={item.url} alt={item.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
          : <div style={{ fontSize: 36 }}>📄</div>
        }
      </div>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.url); }}
      >
        <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, background: "rgba(0,0,0,.4)", padding: "4px 10px", borderRadius: 20 }}>URL kopieren</span>
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }} title={item.filename}>
          {item.filename}
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{fmtSize(item.size)} · {fmtDate(item.created_at)}</div>
      </div>
    </div>
  );
}

/* ───────── AddUrlModal ───────── */
function AddUrlModal({ folders, onClose, onAdded }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [folderId, setFolderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) { setError("URL erforderlich"); return; }
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.addMediaByUrl({ url: url.trim(), alt, folder_id: folderId || null });
      onAdded(res?.media);
      onClose();
    } catch (err) { setError(err?.message || "Fehler"); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 460, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>Bild via URL hinzufügen</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Bild-URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} style={inputSt} placeholder="https://example.com/bild.jpg" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Alt-Text (optional)</label>
            <input value={alt} onChange={e => setAlt(e.target.value)} style={inputSt} placeholder="Beschreibung des Bildes" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>Ordner (optional)</label>
            <select value={folderId} onChange={e => setFolderId(e.target.value)} style={inputSt}>
              <option value="">Kein Ordner</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {error && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={btnSecSt}>Abbrechen</button>
            <button type="submit" disabled={saving} style={saving ? btnDisSt : btnPriSt}>{saving ? "Hinzufügen…" : "Hinzufügen"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────── CreateFolderModal ───────── */
function CreateFolderModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name erforderlich"); return; }
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.createMediaFolder(name.trim());
      onCreated(res?.folder);
      onClose();
    } catch (err) { setError(err?.message || "Fehler"); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Neuer Ordner</h2>
        <form onSubmit={handleSubmit}>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputSt, marginBottom: 14 }} placeholder="Ordnername" autoFocus />
          {error && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={btnSecSt}>Abbrechen</button>
            <button type="submit" disabled={saving} style={saving ? btnDisSt : btnPriSt}>{saving ? "Erstellen…" : "Erstellen"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────── DetailPanel ───────── */
function DetailPanel({ item, folders, onClose, onUpdated, onDeleted }) {
  const [alt, setAlt] = useState(item.alt || "");
  const [folderId, setFolderId] = useState(item.folder_id || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.updateMedia(item.id, { alt: alt || null, folder_id: folderId || null });
      onUpdated(res?.media ?? { ...item, alt, folder_id: folderId || null });
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`"${item.filename}" löschen?`)) return;
    try {
      const client = getMedusaAdminClient();
      await client.deleteMediaItem(item.id);
      onDeleted(item.id);
      onClose();
    } catch {}
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(item.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 900 }} onClick={onClose} />
      <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 380, background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,.1)", zIndex: 901, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 290 }} title={item.filename}>{item.filename}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6b7280" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Preview */}
          <div style={{ background: "#f9fafb", borderRadius: 10, overflow: "hidden", marginBottom: 16, maxHeight: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isImage(item.mime_type)
              ? <img src={item.url} alt={item.alt || ""} style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} />
              : <div style={{ padding: 40, fontSize: 40 }}>📄</div>
            }
          </div>

          {/* URL row */}
          <div style={{ background: "#f3f4f6", borderRadius: 8, padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{item.url}</span>
            <button onClick={copyUrl} style={{ padding: "4px 10px", borderRadius: 6, background: copied ? "#f0fdf4" : "#fff", border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 11, fontWeight: 600, color: copied ? "#15803d" : "#374151", flexShrink: 0 }}>
              {copied ? "✓ Kopiert" : "Kopieren"}
            </button>
          </div>

          {/* Meta info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, fontSize: 12 }}>
            {[
              ["Typ", item.mime_type || "—"],
              ["Größe", fmtSize(item.size)],
              ["Hochgeladen", fmtDate(item.created_at)],
              ["Ordner", item.folder_name || "Kein Ordner"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ color: "#9ca3af", fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>{k}</div>
                <div style={{ color: "#374151", fontWeight: 500, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Edit fields */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Alt-Text</label>
            <input value={alt} onChange={e => setAlt(e.target.value)} style={inputSt} placeholder="Bildbeschreibung" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>Ordner</label>
            <select value={folderId} onChange={e => setFolderId(e.target.value)} style={inputSt}>
              <option value="">Kein Ordner</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPriSt, width: "100%", marginBottom: 8 }}>{saving ? "Speichern…" : "Speichern"}</button>
          <button onClick={handleDelete} style={{ ...btnSecSt, width: "100%", color: "#b91c1c", borderColor: "#fecaca" }}>Löschen</button>
        </div>
      </div>
    </>
  );
}

/* ───────── Main page ───────── */
export default function MediaPage() {
  const [media, setMedia] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState("all"); // "all" | "none" | uuid
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerId, setMySellerId] = useState("");
  const [sellerLabelById, setSellerLabelById] = useState({});
  const [sellerSearchFilter, setSellerSearchFilter] = useState("");
  const [mediaSellerSectionsOpen, setMediaSellerSectionsOpen] = useState({});
  const [mediaSort, setMediaSort] = useState("date_desc");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    setMySellerId(localStorage.getItem("sellerId") || "");
  }, []);

  useEffect(() => {
    if (!isSuperuser) return;
    const client = getMedusaAdminClient();
    client
      .getSellers()
      .then((d) => {
        const m = {};
        for (const s of d.sellers || []) {
          if (s.seller_id) m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
        }
        setSellerLabelById(m);
      })
      .catch(() => {});
  }, [isSuperuser]);

  const { ownMedia, sellerMediaGroups } = useMemo(() => {
    const own = [];
    const g = new Map();
    for (const m of media) {
      if (isOwnMediaItem(m, mySellerId)) own.push(m);
      else {
        const sid = String(m.seller_id || "unknown");
        if (!g.has(sid)) g.set(sid, []);
        g.get(sid).push(m);
      }
    }
    const keys = [...g.keys()].sort((a, b) =>
      (sellerLabelById[a] || a).localeCompare(sellerLabelById[b] || b, undefined, { sensitivity: "base" })
    );
    return { ownMedia: own, sellerMediaGroups: keys.map((k) => ({ sellerId: k, items: g.get(k) })) };
  }, [media, mySellerId, sellerLabelById]);

  const filteredSellerMediaGroups = useMemo(() => {
    const q = sellerSearchFilter.trim().toLowerCase();
    if (!q) return sellerMediaGroups;
    return sellerMediaGroups.filter(({ sellerId }) => {
      const label = (sellerLabelById[sellerId] || sellerId || "").toLowerCase();
      return label.includes(q) || sellerId.toLowerCase().includes(q);
    });
  }, [sellerMediaGroups, sellerSearchFilter, sellerLabelById]);

  const load = useCallback(async (folder = activeFolder, q = search) => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const params = { limit: 200 };
      if (folder === "none") params.folder_id = "none";
      else if (folder !== "all") params.folder_id = folder;
      if (q.trim()) params.search = q.trim();
      const data = await client.getMedia(params);
      setMedia(data.media || []);
    } catch { setMedia([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const client = getMedusaAdminClient();
        const [mData, fData] = await Promise.all([
          client.getMedia({ limit: 200 }),
          client.getMediaFolders().catch(() => ({ folders: [] })),
        ]);
        setMedia(mData.media || []);
        setFolders(fData.folders || []);
      } catch { }
      setLoading(false);
    })();
  }, []);

  const handleFolderChange = (f) => {
    setActiveFolder(f);
    load(f, search);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    load(activeFolder, search);
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const client = getMedusaAdminClient();
    const results = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (activeFolder !== "all" && activeFolder !== "none") fd.append("folder_id", activeFolder);
        const res = await client.uploadMedia(fd);
        if (res?.id) results.push(res);
      } catch {}
    }
    if (results.length) setMedia(prev => [...results, ...prev]);
    setUploading(false);
  };

  const totalCount = media.length;
  const folderLabel = activeFolder === "all" ? "Alle Medien" : activeFolder === "none" ? "Ohne Ordner" : (folders.find(f => f.id === activeFolder)?.name || "Ordner");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden", background: "#f9fafb" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Mediathek</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {[
            { id: "all", label: "Alle Medien", icon: "🖼" },
            { id: "none", label: "Ohne Ordner", icon: "📄" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => handleFolderChange(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 16px", background: activeFolder === item.id ? "#eff6ff" : "none",
                border: "none", cursor: "pointer", fontSize: 13,
                color: activeFolder === item.id ? "#1d4ed8" : "#374151",
                fontWeight: activeFolder === item.id ? 600 : 400, textAlign: "left",
              }}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}

          {folders.length > 0 && (
            <div style={{ padding: "10px 16px 4px", fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Ordner</div>
          )}
          {folders.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => handleFolderChange(f.id)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 16px", background: activeFolder === f.id ? "#eff6ff" : "none",
                  border: "none", cursor: "pointer", fontSize: 13,
                  color: activeFolder === f.id ? "#1d4ed8" : "#374151",
                  fontWeight: activeFolder === f.id ? 600 : 400, textAlign: "left",
                }}
              >
                <span>📁</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                {f.media_count > 0 && <span style={{ fontSize: 10, color: "#9ca3af" }}>{f.media_count}</span>}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Ordner "${f.name}" löschen?`)) return;
                  const client = getMedusaAdminClient();
                  await client.deleteMediaFolder(f.id).catch(() => {});
                  setFolders(prev => prev.filter(x => x.id !== f.id));
                  if (activeFolder === f.id) handleFolderChange("all");
                }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 10px", color: "#d1d5db", fontSize: 12 }}
                title="Ordner löschen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #f3f4f6" }}>
          <button
            onClick={() => setShowCreateFolder(true)}
            style={{ width: "100%", padding: "7px 0", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}
          >
            + Neuer Ordner
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{folderLabel}</div>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            {isSuperuser
              ? `${ownMedia.length} eigene / Plattform · ${totalCount - ownMedia.length} Verkäufer (${totalCount} gesamt)`
              : `${totalCount} Dateien`}
          </span>
          {isSuperuser && (
            <select
              value={mediaSort}
              onChange={(e) => setMediaSort(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff" }}
            >
              <option value="date_desc">Datum: neu zuerst</option>
              <option value="date_asc">Datum: alt zuerst</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="size_desc">Größe ↓</option>
              <option value="size_asc">Größe ↑</option>
            </select>
          )}
          <div style={{ flex: 1 }} />
          {/* Search */}
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Dateiname suchen…"
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: "6px 0 0 6px", fontSize: 13, outline: "none", width: 180 }}
            />
            <button type="submit" style={{ padding: "6px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderLeft: "none", borderRadius: "0 6px 6px 0", cursor: "pointer", fontSize: 13, color: "#374151" }}>🔍</button>
          </form>
          {/* URL add */}
          <button onClick={() => setShowAddUrl(true)} style={{ padding: "7px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>
            🔗 URL hinzufügen
          </button>
          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ padding: "7px 16px", background: uploading ? "#9ca3af" : "#111827", color: "#fff", border: "none", borderRadius: 7, cursor: uploading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
          >
            {uploading ? "Hochladen…" : "↑ Hochladen"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf"
            style={{ display: "none" }}
            onChange={e => { handleUpload(e.target.files); e.target.value = ""; }}
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        >
          {loading && (
            <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Laden…</div>
          )}
          {!loading && media.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🖼</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>Keine Medien</div>
              <div style={{ fontSize: 13 }}>Bilder hochladen oder per URL hinzufügen</div>
            </div>
          )}
          {!loading && media.length > 0 && !isSuperuser && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {media.map((item) => (
                <MediaTile key={item.id} item={item} onSelect={setSelected} />
              ))}
            </div>
          )}
          {!loading && media.length > 0 && isSuperuser && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <div>
                <div
                  style={{
                    padding: "10px 14px",
                    marginBottom: 12,
                    background: "#eef2ff",
                    borderRadius: 8,
                    border: "1px solid #c7d2fe",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#3730a3",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Ihr Superuser-Bereich — eigene und plattformweite Medien ({ownMedia.length})
                </div>
                {ownMedia.length === 0 ? (
                  <div style={{ color: "#9ca3af", fontSize: 13, padding: "8px 4px" }}>Keine Medien in diesem Bereich.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                    {sortMediaList(ownMedia, mediaSort).map((item) => (
                      <MediaTile key={item.id} item={item} onSelect={setSelected} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div
                  style={{
                    padding: "10px 14px",
                    marginBottom: 10,
                    background: "#f3f4f6",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Verkäufer-Medien
                </div>
                <input
                  value={sellerSearchFilter}
                  onChange={(e) => setSellerSearchFilter(e.target.value)}
                  placeholder="Verkäufer suchen (Store-Name)…"
                  style={{
                    width: "100%", maxWidth: 360, padding: "8px 12px", marginBottom: 14,
                    border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
                  }}
                />
                {filteredSellerMediaGroups.length === 0 ? (
                  <div style={{ color: "#9ca3af", fontSize: 13 }}>
                    Keine Verkäufer-Medien{sellerSearchFilter.trim() ? " (Filter)" : ""}.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {filteredSellerMediaGroups.map(({ sellerId, items }) => {
                      const label =
                        sellerLabelById[sellerId] ||
                        (items[0] && items[0].seller_store_name) ||
                        sellerId;
                      const open = mediaSellerSectionsOpen[sellerId] !== false;
                      const sorted = sortMediaList(items, mediaSort);
                      return (
                        <div
                          key={sellerId}
                          style={{ background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}
                        >
                          <button
                            type="button"
                            onClick={() => setMediaSellerSectionsOpen((prev) => ({ ...prev, [sellerId]: !open }))}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 16px",
                              background: "#fff",
                              border: "none",
                              cursor: "pointer",
                              font: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</span>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>
                              {open ? "▾" : "▸"} {sorted.length} Datei{sorted.length !== 1 ? "en" : ""}
                            </span>
                          </button>
                          {open && (
                            <div style={{ padding: "0 12px 14px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                                {sorted.map((item) => (
                                  <MediaTile key={item.id} item={item} onSelect={setSelected} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          item={selected}
          folders={folders}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setMedia(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
            setSelected(prev => ({ ...prev, ...updated }));
          }}
          onDeleted={(id) => {
            setMedia(prev => prev.filter(m => m.id !== id));
          }}
        />
      )}

      {showAddUrl && (
        <AddUrlModal
          folders={folders}
          onClose={() => setShowAddUrl(false)}
          onAdded={(item) => item && setMedia(prev => [item, ...prev])}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreated={(folder) => folder && setFolders(prev => [...prev, folder])}
        />
      )}
    </div>
  );
}

const labelSt = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 };
const inputSt = { width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" };
const btnPriSt = { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSecSt = { padding: "8px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 13 };
const btnDisSt = { padding: "8px 18px", background: "#9ca3af", color: "#fff", border: "none", borderRadius: 7, cursor: "not-allowed", fontSize: 13, fontWeight: 600 };
