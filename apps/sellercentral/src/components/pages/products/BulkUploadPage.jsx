"use client";

import React, { useState, useRef } from "react";
import { useLocale } from "next-intl";
import styled from "styled-components";
import { Card, Button } from "@andertal/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getUI } from "@/lib/ui-strings";

const Container = styled.div`max-width: 1200px; margin: 0 auto;`;
const Title = styled.h1`font-size: 32px; font-weight: 700; margin-bottom: 32px; color: #1f2937;`;
const Section = styled(Card)`padding: 24px; margin-bottom: 24px;`;

const UploadArea = styled.div`
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;
  background-color: #f9fafb;
  transition: all 0.2s ease;
  cursor: pointer;
  &:hover { border-color: #0ea5e9; background-color: #f0f9ff; }
  ${({ $isDragging }) => $isDragging && `border-color: #0ea5e9; background-color: #f0f9ff;`}
`;

const CSV_COLUMNS = [
  "title", "sku", "description", "price", "inventory", "status",
  "category", "brand", "weight", "ean",
  "image_url_1", "image_url_2", "image_url_3",
];

const CSV_TEMPLATE_ROW = [
  "Beispielprodukt", "SKU-001", "Produktbeschreibung", "29.99", "100", "published",
  "Elektronik", "Musterfirma", "0.5", "4012345678901",
  "https://example.com/bild1.jpg", "", "",
];

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let inQuote = false, cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { vals.push(cur); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

function downloadTemplate() {
  const csvContent = [CSV_COLUMNS.join(","), CSV_TEMPLATE_ROW.join(",")].join("\n");
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "andertal-produkt-vorlage.csv";
  link.click();
}

const STATUS_COLOR = {
  created: { bg: "#d1fae5", color: "#065f46" },
  error:   { bg: "#fee2e2", color: "#991b1b" },
  skipped: { bg: "#fef3c7", color: "#92400e" },
};

export default function BulkUploadPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // array of parsed rows
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setError(locale === "en" ? "Please upload a .csv file." : locale === "tr" ? "Lütfen bir .csv dosyası yükleyin." : locale === "fr" ? "Veuillez télécharger un fichier .csv." : locale === "es" ? "Por favor sube un archivo .csv." : locale === "it" ? "Carica un file .csv." : "Bitte eine .csv Datei hochladen."); return; }
    setError("");
    setResults(null);
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        setPreview(rows);
      } catch {
        setError(locale === "en" ? "Could not read CSV." : locale === "tr" ? "CSV okunamadı." : locale === "fr" ? "Impossible de lire le CSV." : locale === "es" ? "No se pudo leer el CSV." : locale === "it" ? "Impossibile leggere il CSV." : "CSV konnte nicht gelesen werden.");
      }
    };
    reader.readAsText(f, "utf-8");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!preview?.length) return;
    setUploading(true);
    setProgress(0);
    setResults(null);
    setError("");
    try {
      const client = getMedusaAdminClient();
      const BATCH = 50;
      const allResults = [];
      for (let i = 0; i < preview.length; i += BATCH) {
        const chunk = preview.slice(i, i + BATCH);
        const resp = await client.request("/admin-hub/v1/products/bulk-import", {
          method: "POST",
          body: JSON.stringify({ rows: chunk }),
        });
        if (Array.isArray(resp?.results)) allResults.push(...resp.results);
        setProgress(Math.round(((i + chunk.length) / preview.length) * 100));
      }
      setResults(allResults);
    } catch (e) {
      setError(e?.message || (locale === "en" ? "Upload failed." : locale === "tr" ? "Yükleme başarısız." : locale === "fr" ? "Échec du téléchargement." : locale === "es" ? "Error al subir." : locale === "it" ? "Caricamento fallito." : "Upload fehlgeschlagen."));
    } finally {
      setUploading(false);
      setProgress(100);
    }
  };

  const created = results?.filter(r => r.status === "created").length ?? 0;
  const errors  = results?.filter(r => r.status === "error").length ?? 0;
  const skipped = results?.filter(r => r.status === "skipped").length ?? 0;

  return (
    <Container>
      <Title>{locale === "en" ? "Upload products via CSV" : locale === "tr" ? "CSV ile ürün yükle" : locale === "fr" ? "Importer des produits via CSV" : locale === "es" ? "Subir productos por CSV" : locale === "it" ? "Carica prodotti via CSV" : "Produkte per CSV hochladen"}</Title>

      <Section>
        {/* Template download */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", backgroundColor: "#f3f4f6", borderRadius: "8px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <i className="fas fa-file-csv" style={{ fontSize: "24px", color: "#0ea5e9" }} />
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>{locale === "en" ? "Download CSV template" : locale === "tr" ? "CSV şablonu indir" : locale === "fr" ? "Télécharger le modèle CSV" : locale === "es" ? "Descargar plantilla CSV" : locale === "it" ? "Scarica il modello CSV" : "CSV-Vorlage herunterladen"}</p>
              <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>{locale === "en" ? "Columns" : locale === "tr" ? "Sütunlar" : locale === "fr" ? "Colonnes" : locale === "es" ? "Columnas" : locale === "it" ? "Colonne" : "Spalten"}: {CSV_COLUMNS.join(", ")}</p>
            </div>
          </div>
          <Button onClick={downloadTemplate}>
            <i className="fas fa-download" style={{ marginRight: "8px" }} />{locale === "en" ? "Template" : locale === "tr" ? "Şablon" : locale === "fr" ? "Modèle" : locale === "es" ? "Plantilla" : locale === "it" ? "Modello" : "Vorlage"}
          </Button>
        </div>

        {/* Drop zone */}
        <UploadArea
          $isDragging={isDragging}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          <i className="fas fa-cloud-upload-alt" style={{ fontSize: "48px", color: "#0ea5e9", marginBottom: "16px", display: "block" }} />
          <p style={{ fontSize: "16px", color: "#6b7280", margin: "0 0 8px" }}>{locale === "en" ? "Drop CSV file here or click" : locale === "tr" ? "CSV dosyasını buraya bırakın veya tıklayın" : locale === "fr" ? "Déposez le fichier CSV ici ou cliquez" : locale === "es" ? "Suelta el archivo CSV aquí o haz clic" : locale === "it" ? "Trascina il file CSV qui o clicca" : "CSV-Datei hier ablegen oder klicken"}</p>
          <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0 }}>{locale === "en" ? ".csv only – max. 500 products, max. 10 MB" : locale === "tr" ? "Sadece .csv – max. 500 ürün, max. 10 MB" : locale === "fr" ? ".csv uniquement – max. 500 produits, max. 10 Mo" : locale === "es" ? "Solo .csv – máx. 500 productos, máx. 10 MB" : locale === "it" ? "Solo .csv – max. 500 prodotti, max. 10 MB" : "Nur .csv – max. 500 Produkte, max. 10 MB"}</p>
        </UploadArea>

        {error && (
          <div style={{ padding: "12px 16px", marginTop: "16px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#991b1b" }}>{error}</div>
        )}

        {/* Preview table */}
        {preview && !results && (
          <div style={{ marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>{preview.length} {locale === "en" ? "products detected" : locale === "tr" ? "ürün algılandı" : locale === "fr" ? "produits détectés" : locale === "es" ? "productos detectados" : locale === "it" ? "prodotti rilevati" : "Produkte erkannt"}</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button onClick={() => { setFile(null); setPreview(null); setError(""); }}>{ui.cancel}</Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? `${ui.uploading} ${progress}%` : `${ui.import} ${preview.length} ${locale === "en" ? "products" : locale === "tr" ? "ürün" : locale === "fr" ? "produits" : locale === "es" ? "productos" : locale === "it" ? "prodotti" : "Produkte"}`}
                </Button>
              </div>
            </div>
            {uploading && (
              <div style={{ width: "100%", height: "8px", backgroundColor: "#e5e7eb", borderRadius: "4px", marginBottom: "12px" }}>
                <div style={{ width: `${progress}%`, height: "100%", backgroundColor: "#0ea5e9", borderRadius: "4px", transition: "width 0.3s" }} />
              </div>
            )}
            <div style={{ overflowX: "auto", maxHeight: "320px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0 }}>
                    {[locale === "en" ? "Title" : locale === "tr" ? "Başlık" : locale === "fr" ? "Titre" : locale === "es" ? "Título" : locale === "it" ? "Titolo" : "Titel", "SKU", locale === "en" ? "Price" : locale === "tr" ? "Fiyat" : locale === "fr" ? "Prix" : locale === "es" ? "Precio" : locale === "it" ? "Prezzo" : "Preis", locale === "en" ? "Inventory" : locale === "tr" ? "Stok" : locale === "fr" ? "Inventaire" : locale === "es" ? "Inventario" : locale === "it" ? "Inventario" : "Bestand", "Status", "EAN", locale === "en" ? "Category" : locale === "tr" ? "Kategori" : locale === "fr" ? "Catégorie" : locale === "es" ? "Categoría" : locale === "it" ? "Categoria" : "Kategorie", locale === "en" ? "Brand" : locale === "tr" ? "Marka" : locale === "fr" ? "Marque" : locale === "es" ? "Marca" : locale === "it" ? "Marca" : "Marke"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {[row.title || row.Title, row.sku || row.SKU, row.price || row.Price, row.inventory || row.Inventory, row.status || row.Status, row.ean || row.EAN, row.category || row.Category, row.brand || row.Brand].map((v, j) => (
                        <td key={j} style={{ padding: "6px 12px", color: "#374151" }}>{v || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 100 && <p style={{ padding: "8px 12px", color: "#6b7280", margin: 0 }}>… {locale === "en" ? "and" : locale === "tr" ? "ve" : locale === "fr" ? "et" : locale === "es" ? "y" : locale === "it" ? "e" : "und"} {preview.length - 100} {locale === "en" ? "more rows" : locale === "tr" ? "satır daha" : locale === "fr" ? "lignes supplémentaires" : locale === "es" ? "filas más" : locale === "it" ? "righe in più" : "weitere Zeilen"}</p>}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div style={{ marginTop: "24px" }}>
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              {[
                { label: locale === "en" ? "Created" : locale === "tr" ? "Oluşturuldu" : locale === "fr" ? "Créé" : locale === "es" ? "Creado" : locale === "it" ? "Creato" : "Erstellt", count: created, color: "#065f46", bg: "#d1fae5" },
                { label: ui.error,   count: errors,  color: "#991b1b", bg: "#fee2e2" },
                { label: locale === "en" ? "Skipped" : locale === "tr" ? "Atlandı" : locale === "fr" ? "Ignoré" : locale === "es" ? "Omitido" : locale === "it" ? "Saltato" : "Übersprungen", count: skipped, color: "#92400e", bg: "#fef3c7" },
              ].map(s => (
                <div key={s.label} style={{ padding: "12px 20px", borderRadius: "8px", backgroundColor: s.bg, color: s.color, fontWeight: 600 }}>
                  {s.count} {s.label}
                </div>
              ))}
            </div>
            <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0 }}>
                    {[locale === "en" ? "Title" : locale === "tr" ? "Başlık" : locale === "fr" ? "Titre" : locale === "es" ? "Título" : locale === "it" ? "Titolo" : "Titel", "Status", "Info"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#374151" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const st = STATUS_COLOR[r.status] || {};
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "6px 12px", color: "#374151" }}>{r.title || "—"}</td>
                        <td style={{ padding: "6px 12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "12px", backgroundColor: st.bg, color: st.color, fontWeight: 600 }}>{r.status}</span>
                        </td>
                        <td style={{ padding: "6px 12px", color: "#6b7280" }}>{r.reason || r.id || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "12px" }}>
              <Button onClick={() => { setFile(null); setPreview(null); setResults(null); setError(""); setProgress(0); }}>
                {locale === "en" ? "New upload" : locale === "tr" ? "Yeni yükleme" : locale === "fr" ? "Nouveau téléchargement" : locale === "es" ? "Nueva subida" : locale === "it" ? "Nuovo caricamento" : "Neuer Upload"}
              </Button>
            </div>
          </div>
        )}
      </Section>
    </Container>
  );
}
