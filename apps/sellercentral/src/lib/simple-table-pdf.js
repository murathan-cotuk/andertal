/**
 * Compact multi-page A4 landscape PDF (Helvetica + WinAnsi).
 * No extra dependency — sellercentral already ships Excel via exceljs.
 */

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 28;

function toWinAnsi(str) {
  return String(str ?? "")
    .replace(/€/g, "EUR ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function pdfLiteral(str) {
  const s = toWinAnsi(str);
  let out = "(";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += `\\${s[i]}`;
    else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, "0")}`;
    else out += s[i];
  }
  return `${out})`;
}

function truncate(str, max) {
  const s = String(str ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}...`;
}

function rgb(hex) {
  const h = String(hex || "111827").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

/**
 * @param {{ title: string, subtitle?: string, headers: string[], rows: string[][], colFrac?: number[] }} opts
 * @returns {Buffer}
 */
export function buildSimpleTablePdfBuffer(opts) {
  const title = opts.title || "Andertal";
  const subtitle = opts.subtitle || "";
  const headers = opts.headers || [];
  const rows = opts.rows || [];
  const colFrac = opts.colFrac || headers.map(() => 1 / Math.max(1, headers.length));
  const colW = colFrac.map((f) => f * (PAGE_W - MARGIN * 2));

  const titleY = PAGE_H - 24;
  const tableTop = PAGE_H - 52;
  const rowH = 13;
  const footerH = 22;
  const rowsPerPage = Math.max(1, Math.floor((tableTop - MARGIN - footerH) / rowH) - 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const pageStreams = [];
  for (let p = 0; p < pageCount; p++) {
    const ops = [];
    const push = (s) => ops.push(s);

    push("0.067 0.094 0.153 rg");
    push(`BT /F2 11 Tf ${MARGIN} ${titleY} Td ${pdfLiteral(title)} T*`);
    if (subtitle) {
      push("0.420 0.447 0.502 rg");
      push(`/F1 8 Tf 0 -12 Td ${pdfLiteral(subtitle)} T*`);
    }
    push("ET");

    const slice = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    const headerBottom = tableTop - rowH;

    push(`${rgb("111827")} rg`);
    push(`${MARGIN} ${headerBottom} ${PAGE_W - MARGIN * 2} ${rowH} re f`);

    let x = MARGIN;
    push("1 1 1 rg");
    push("BT /F2 7 Tf");
    headers.forEach((h, i) => {
      const right = i === headers.length - 1;
      const tx = right ? x + colW[i] - 6 : x + 5;
      push("1 0 0 1 0 0 Tm");
      if (right) {
        const w = toWinAnsi(h).length * 3.6;
        push(`${(tx - w).toFixed(1)} ${(headerBottom + 4).toFixed(1)} Td ${pdfLiteral(h)} Tj`);
      } else {
        push(`${tx.toFixed(1)} ${(headerBottom + 4).toFixed(1)} Td ${pdfLiteral(h)} Tj`);
      }
      x += colW[i];
    });
    push("ET");

    slice.forEach((row, ri) => {
      const y = headerBottom - (ri + 1) * rowH;
      if (ri % 2 === 1) {
        push("0.976 0.980 0.984 rg");
        push(`${MARGIN} ${y} ${PAGE_W - MARGIN * 2} ${rowH} re f`);
      }
      push("0.902 0.910 0.922 w 0.902 0.910 0.922 RG");
      push(`${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S`);

      let cx = MARGIN;
      push("BT /F1 7.5 Tf");
      row.forEach((cell, i) => {
        const right = i === headers.length - 1;
        const maxChars = Math.max(8, Math.floor(colW[i] / 4.1));
        const text = truncate(cell, maxChars);
        const isNeg = right && /^-|−/.test(String(cell));
        const isPos = right && /^\+/.test(String(cell));
        if (isNeg) push("0.863 0.149 0.149 rg");
        else if (isPos) push("0.020 0.588 0.412 rg");
        else push("0.067 0.094 0.153 rg");
        if (right) {
          const w = toWinAnsi(text).length * 3.9;
          push(`1 0 0 1 ${(cx + colW[i] - 6 - w).toFixed(1)} ${(y + 3.5).toFixed(1)} Tm ${pdfLiteral(text)} Tj`);
        } else {
          push(`1 0 0 1 ${(cx + 5).toFixed(1)} ${(y + 3.5).toFixed(1)} Tm ${pdfLiteral(text)} Tj`);
        }
        cx += colW[i];
      });
      push("ET");
    });

    push("0.420 0.447 0.502 rg");
    push(`BT /F1 7 Tf ${MARGIN} 16 Td ${pdfLiteral(`${p + 1} / ${pageCount}`)} T* ET`);

    pageStreams.push(ops.join("\n"));
  }

  const rebuilt = [];
  rebuilt[0] = null;
  rebuilt[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const contentIds = [];
  const rebuiltPageIds = [];
  let nextId = 5;
  pageStreams.forEach(() => {
    contentIds.push(nextId);
    rebuiltPageIds.push(nextId + 1);
    nextId += 2;
  });

  rebuilt[2] = `<< /Type /Pages /Kids [${rebuiltPageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`;
  rebuilt[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  rebuilt[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pageStreams.forEach((stream, i) => {
    const contentId = contentIds[i];
    const pageId = rebuiltPageIds[i];
    rebuilt[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    rebuilt[pageId] = [
      "<< /Type /Page /Parent 2 0 R",
      `/MediaBox [0 0 ${PAGE_W} ${PAGE_H}]`,
      "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>",
      `/Contents ${contentId} 0 R >>`,
    ].join(" ");
  });

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 1; i < rebuilt.length; i++) {
    offsets[i] = Buffer.byteLength(parts.join(""), "latin1");
    parts.push(`${i} 0 obj\n${rebuilt[i]}\nendobj\n`);
  }
  const xrefPos = Buffer.byteLength(parts.join(""), "latin1");
  let xref = `xref\n0 ${rebuilt.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < rebuilt.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  parts.push(xref);
  parts.push(`trailer << /Size ${rebuilt.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return Buffer.from(parts.join(""), "latin1");
}
