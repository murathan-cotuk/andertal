const DEFAULT_BACKEND = "https://api.andertal.com";

export function getMedusaBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

export async function postCategoryExcelUpsertBatch({ sellerToken, locale, items }) {
  const backendUrl = getMedusaBackendBase();
  const urls = [
    `${backendUrl}/admin-hub/v1/categories/excel-upsert`,
    `${backendUrl}/admin-hub/categories/excel-upsert`,
  ];
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sellerToken}`,
          "Content-Type": "application/json",
          "x-shop-locale": locale || "de",
        },
        body: JSON.stringify({ items }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) };
      }
      if (res.status === 403) {
        const err = new Error(data.message || data.error || "Superuser access required");
        err.status = 403;
        throw err;
      }
      if (!res.ok) {
        lastErr = data.message || data.error || (text ? String(text).slice(0, 400) : `HTTP ${res.status}`);
        continue;
      }
      return data;
    } catch (e) {
      if (e.status === 403) throw e;
      lastErr = e.message || String(e);
    }
  }
  throw new Error(lastErr || "Backend upsert failed");
}
