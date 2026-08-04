/** Server-safe JSON-LD injector (no client JS required). */
export default function SeoJsonLd({ data }) {
  if (!data) return null;
  const payload = Array.isArray(data) ? data.filter(Boolean) : [data];
  if (!payload.length) return null;
  return (
    <>
      {payload.map((item, index) => (
        <script
          key={item?.["@id"] || item?.["@type"] || index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
