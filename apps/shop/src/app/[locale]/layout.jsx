import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import StyledComponentsRegistry from "../registry";
import Providers from "@/components/Providers";
import { MarketPrefixProvider } from "@/context/MarketPrefixContext";
import {
  marketPrefix,
  parseMarketPath,
  defaultMarketForLocale,
  DEFAULT_CURRENCY,
  isValidMarket,
} from "@/lib/shop-market";
import { fetchEnabledShopLocales } from "@/lib/enabled-shop-locales";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  const enabledLocales = await fetchEnabledShopLocales();
  if (!enabledLocales.includes(locale)) {
    const fallback = enabledLocales.includes(routing.defaultLocale)
      ? routing.defaultLocale
      : enabledLocales[0];
    redirect(`/${fallback}`);
  }

  setRequestLocale(locale);

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  const h = await headers();
  const fromHeader = h.get("x-andertal-market-prefix");
  const headerTriple = fromHeader?.startsWith("/") ? parseMarketPath(fromHeader) : null;

  let marketPrefixValue;
  if (headerTriple && isValidMarket(headerTriple.country)) {
    marketPrefixValue = marketPrefix(headerTriple.country, locale, DEFAULT_CURRENCY);
  } else {
    marketPrefixValue = marketPrefix(defaultMarketForLocale(locale), locale, DEFAULT_CURRENCY);
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <StyledComponentsRegistry>
        <MarketPrefixProvider value={marketPrefixValue}>
          {/* Ensure <html lang> matches active locale even when root layout header is stale */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{document.documentElement.lang=${JSON.stringify(locale)}}catch(e){}`,
            }}
          />
          <Providers>{children}</Providers>
        </MarketPrefixProvider>
      </StyledComponentsRegistry>
    </NextIntlClientProvider>
  );
}
