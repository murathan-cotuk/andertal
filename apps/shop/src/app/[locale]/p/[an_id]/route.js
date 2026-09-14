import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/affiliate";
import { storefrontProductHandle } from "@/lib/product-url-handle";

/**
 * Stable AN-ID product link: /{locale}/p/{AN-ID} → 302 to the current canonical
 * product URL. Unlike a plain handle link, this NEVER goes stale — if the product
 * is renamed (handle changes), this redirect still finds it via its permanent
 * AN-ID. Used by affiliate links and anywhere else a link needs to outlive a
 * possible rename. Query params (e.g. ?ref=) are carried through to the target.
 */
export async function GET(request, { params }) {
  const { locale, an_id } = await params;
  const fallback = () => NextResponse.redirect(new URL(`/${locale}`, request.url));

  let product;
  try {
    const res = await fetch(`${getBackendUrl()}/store/products/by-an-id/${encodeURIComponent(an_id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return fallback();
    product = await res.json();
  } catch {
    return fallback();
  }
  if (!product?.id) return fallback();

  const handle = storefrontProductHandle(product, locale);
  if (!handle) return fallback();

  const dest = new URL(`/${locale}/${handle}`, request.url);
  const incoming = new URL(request.url);
  incoming.searchParams.forEach((value, key) => dest.searchParams.set(key, value));

  return NextResponse.redirect(dest, { status: 302 });
}
