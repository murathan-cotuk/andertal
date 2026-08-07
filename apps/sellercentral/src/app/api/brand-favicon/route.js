import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function absolutize(url, backend) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.startsWith("//")) return s.startsWith("//") ? `https:${s}` : s;
  if (s.startsWith("/")) return `${backend}${s}`;
  return s;
}

function normalizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function fallbackIcon() {
  try {
    const filePath = path.join(process.cwd(), "src", "app", "brand-fallback-icon.png");
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
        "X-Andertal-Favicon": "sellercentral-fallback",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

/** Proxies Sellercentral favicon only — never the shop favicon. */
export async function GET() {
  const backend = getBackendUrl();
  try {
    const settingsRes = await fetch(`${backend}/store/seller-settings?seller_id=default`, {
      cache: "no-store",
    });
    const settings = await settingsRes.json().catch(() => ({}));
    const scRemote = absolutize(settings?.sellercentral_favicon_url, backend);
    const shopRemote = absolutize(settings?.shop_favicon_url, backend);

    // If Sellercentral favicon is missing OR identical to the shop favicon, use SC fallback.
    // This prevents Styles mis-saves / copy-paste from showing the shop tab icon here.
    const remote =
      scRemote && normalizeUrl(scRemote) !== normalizeUrl(shopRemote) ? scRemote : "";

    if (remote) {
      const imgRes = await fetch(remote, { cache: "no-store" });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const type = imgRes.headers.get("content-type") || "image/png";
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
            "X-Andertal-Favicon": "sellercentral-remote",
          },
        });
      }
    }
  } catch {
    /* fall through */
  }
  return fallbackIcon();
}
