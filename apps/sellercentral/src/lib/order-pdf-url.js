/**
 * Backend PDF endpoints (admin-hub).
 * kind: "invoice" | "lieferschein" | "versandlabel" | "retoure"
 * opts: { carrier?, tracking? } — Lieferschein overrides (e.g. Versand before save)
 */
export function getOrderPdfDownloadUrl(orderId, kind, locale = "de", opts = {}) {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) || "";
  const base = String(raw).trim().replace(/\/$/, "");
  if (!base || !orderId) return "#";
  const path = kind || "invoice";
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const params = new URLSearchParams({ locale: loc });
  if (opts.carrier) params.set("carrier", String(opts.carrier));
  if (opts.tracking) params.set("tracking", String(opts.tracking));
  return `${base}/admin-hub/v1/orders/${encodeURIComponent(orderId)}/pdf/${path}?${params.toString()}`;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * All /admin-hub/* PDF endpoints require a Bearer token (no cookie/query fallback —
 * see requireSellerAuth in server.js), so a plain <a href> or window.open() to one of
 * these URLs always 401s ("Unauthorized") — the browser navigation can't attach the
 * header. Fetch it with the token instead and trigger the download from the blob.
 */
export async function downloadAuthenticatedPdf(url, filename) {
  if (!url || url === "#") throw new Error("PDF URL not available");
  const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Download failed (${res.status})`);
  }
  triggerBlobDownload(await res.blob(), filename || "document.pdf");
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function concat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Uncompressed ZIP (STORE). No extra dependency. */
export function buildZipStore(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(String(f.name || "file").replace(/\\/g, "/"));
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0),
      u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0),
      name, data,
    ]);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0),
      u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBlob = concat(centrals);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralBlob.length), u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralBlob, end]);
}

/**
 * Fetch many authenticated PDFs and save them as one .zip (browsers only keep the last
 * of a burst of individual downloads).
 * items: [{ url, filename }]
 */
export async function downloadAuthenticatedPdfsAsZip(items, zipFilename) {
  const list = (items || []).filter((it) => it?.url && it.url !== "#");
  if (!list.length) throw new Error("No files to download");
  const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
  const used = new Set();
  const files = [];
  const errors = [];
  for (const it of list) {
    try {
      const res = await fetch(it.url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      let name = String(it.filename || "document.pdf").replace(/[\\/:*?"<>|]+/g, "_");
      if (!/\.pdf$/i.test(name)) name += ".pdf";
      let unique = name;
      let n = 2;
      while (used.has(unique.toLowerCase())) {
        unique = name.replace(/\.pdf$/i, `-${n}.pdf`);
        n += 1;
      }
      used.add(unique.toLowerCase());
      files.push({ name: unique, data: buf });
    } catch (e) {
      errors.push(e?.message || String(e));
    }
  }
  if (!files.length) {
    throw new Error(errors[0] || "Download failed");
  }
  const zip = buildZipStore(files);
  triggerBlobDownload(new Blob([zip], { type: "application/zip" }), zipFilename || "documents.zip");
  return { count: files.length, failed: errors.length };
}
