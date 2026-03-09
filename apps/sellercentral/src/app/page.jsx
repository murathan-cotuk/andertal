import { redirect } from "next/navigation";
import { headers } from "next/headers";

const LOCALES = ["en", "de", "tr", "fr", "it", "es"];
const DEFAULT_LOCALE = "en";

function getLocaleFromAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage || typeof acceptLanguage !== "string") return DEFAULT_LOCALE;
  const parts = acceptLanguage.split(",").map((s) => s.trim().split(";")[0].toLowerCase());
  for (const part of parts) {
    const lang = part.slice(0, 2);
    if (LOCALES.includes(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export default async function RootPage() {
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language") || "";
  const locale = getLocaleFromAcceptLanguage(acceptLanguage);
  redirect(`/${locale}`);
}
