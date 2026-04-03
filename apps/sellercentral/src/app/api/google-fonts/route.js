export const runtime = "nodejs";

/** Cached proxy: full free Google Fonts list (no API key). */
export async function GET() {
  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return Response.json({ families: [] }, { status: 200 });
    }
    const data = await res.json();
    const list = (data.familyMetadataList || [])
      .map((x) => x?.family)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
    return Response.json({ families: list });
  } catch {
    return Response.json({ families: [] }, { status: 200 });
  }
}
