import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import StyledComponentsRegistry from "../registry";
import Providers from "@/components/Providers";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = true;

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!locale || !routing.locales.includes(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  let messages;
  try {
    messages = (await import(`../../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../../messages/${routing.defaultLocale}.json`)).default;
  }
  if (!messages || typeof messages !== "object") messages = {};

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <StyledComponentsRegistry>
        <Providers>{children}</Providers>
      </StyledComponentsRegistry>
    </NextIntlClientProvider>
  );
}
