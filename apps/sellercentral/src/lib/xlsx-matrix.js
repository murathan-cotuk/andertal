/** Browser-safe xlsx → string matrix. Does not use ExcelJS (Node streams). */

function u16(view, o) {
  return view.getUint16(o, true);
}
function u32(view, o) {
  return view.getUint32(o, true);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot decompress .xlsx (DecompressionStream missing)");
  }
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

async function unzipLocalFiles(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const files = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = u32(view, offset);
    if (sig !== 0x04034b50) break;
    const flags = u16(view, offset + 6);
    const method = u16(view, offset + 8);
    const compSize = u32(view, offset + 18);
    const nameLen = u16(view, offset + 26);
    const extraLen = u16(view, offset + 28);
    const name = decodeUtf8(buf.subarray(offset + 30, offset + 30 + nameLen)).replace(/\\/g, "/");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = await inflateRaw(data);
    else throw new Error(`Unsupported ZIP compression ${method} in ${name}`);
    files[name] = out;
    offset = dataStart + compSize;
    if (flags & 8) {
      if (u32(view, offset) === 0x08074b50) offset += 16;
      else offset += 12;
    }
  }
  return files;
}

function decodeXmlText(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const parts = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(m[1]))) parts.push(decodeXmlText(t[1]));
    strings.push(parts.join(""));
  }
  return strings;
}

function colFromRef(ref) {
  const letters = String(ref || "").match(/^[A-Z]+/i);
  if (!letters) return 1;
  let n = 0;
  const s = letters[0].toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function parseSheetRows(xml, shared) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const openEnd = rm[0].indexOf(">");
    const open = openEnd >= 0 ? rm[0].slice(0, openEnd) : "";
    const rMatch = open.match(/\br="(\d+)"/);
    const rIdx = rMatch ? parseInt(rMatch[1], 10) : rows.length + 1;
    const cells = [];
    const inner = rm[1];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(inner))) {
      const attrs = cm[1] || "";
      const body = cm[2] || "";
      const ref = (attrs.match(/\br="([^"]+)"/) || [])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let val = "";
      if (type === "inlineStr") {
        const tm = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        val = tm ? decodeXmlText(tm[1]) : "";
      } else {
        const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw = vm ? vm[1] : "";
        if (type === "s") val = shared[parseInt(raw, 10)] || "";
        else val = decodeXmlText(raw);
      }
      const col = ref ? colFromRef(ref) : cells.length + 1;
      cells[col - 1] = val;
    }
    rows[rIdx - 1] = cells.map((c) => (c == null ? "" : String(c)));
  }
  return rows.map((r) => (Array.isArray(r) ? r : []));
}

function attr(xml, name) {
  const m = String(xml || "").match(new RegExp(`\\b${name}="([^"]+)"`));
  return m ? m[1] : "";
}

function resolveSheetPath(files, preferredName) {
  const wbXml = files["xl/workbook.xml"] ? decodeUtf8(files["xl/workbook.xml"]) : "";
  const relsXml = files["xl/_rels/workbook.xml.rels"] ? decodeUtf8(files["xl/_rels/workbook.xml.rels"]) : "";
  const rels = {};
  const relRe = /<Relationship\b([^>]+)\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    const id = attr(rm[1], "Id");
    let target = attr(rm[1], "Target");
    if (!id || !target) continue;
    if (!target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
    rels[id] = target.replace(/\\/g, "/");
  }
  const sheets = [];
  const sheetRe = /<sheet\b([^>]+)\/>/g;
  let sm;
  while ((sm = sheetRe.exec(wbXml))) {
    sheets.push({
      name: attr(sm[1], "name"),
      rid: attr(sm[1], "r:id") || attr(sm[1], "id"),
    });
  }
  const want = String(preferredName || "").toLowerCase();
  let hit = sheets.find((s) => String(s.name || "").toLowerCase() === want);
  if (!hit) hit = sheets.find((s) => String(s.name || "").toLowerCase() !== "index") || sheets[0];
  const path = hit ? rels[hit.rid] : "xl/worksheets/sheet1.xml";
  if (!path || !files[path]) {
    const fallback = Object.keys(files).find((k) => /xl\/worksheets\/sheet\d+\.xml$/i.test(k));
    return { path: fallback, name: hit?.name || "" };
  }
  return { path, name: hit?.name || "" };
}

export async function xlsxNamedSheetMatrix(arrayBuffer, preferredSheetName) {
  const files = await unzipLocalFiles(arrayBuffer);
  const sharedXml = files["xl/sharedStrings.xml"] ? decodeUtf8(files["xl/sharedStrings.xml"]) : "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const { path, name } = resolveSheetPath(files, preferredSheetName);
  if (!path || !files[path]) throw new Error("No Categories sheet found");
  const rows = parseSheetRows(decodeUtf8(files[path]), shared);
  if (!rows.length) throw new Error("Empty sheet");
  return { rows, sheetName: name, path };
}
