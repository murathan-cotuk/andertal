import { buildMetaobjectTemplateBuffer } from "@/lib/metaobjects-xlsx";

export async function GET() {
  const buf = await buildMetaobjectTemplateBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="andertal-metaobjects-template.xlsx"',
      "Cache-Control": "no-cache",
    },
  });
}
