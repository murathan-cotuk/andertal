import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  const h = await headers();
  const c = await cookies();
  const fromHeader = h.get("x-andertal-market-prefix");
  const fromCookie = c.get("andertal_market_prefix")?.value?.trim() || "";
  const headerTriple = fromHeader?.startsWith("/") ? parseMarketPath(fromHeader) : null;
  const cookieTriple = fromCookie.startsWith("/") ? parseMarketPath(fromCookie) : null;

  /** Shipping country must not follow UI locale (de ≠ Germany). Derive country from header/cookie; locale is only language. */
  let marketPrefixValue;
  if (fromHeader && fromHeader.startsWith("/") && headerTriple && isValidMarket(headerTriple.country)) {
    if (String(headerTriple.lang).toLowerCase() !== String(locale).toLowerCase()) {
      marketPrefixValue = marketPrefix(headerTriple.country, locale, DEFAULT_CURRENCY);
    } else {
      marketPrefixValue = marketPrefix(headerTriple.country, headerTriple.lang, DEFAULT_CURRENCY);
    }
  } else if (cookieTriple && isValidMarket(cookieTriple.country)) {
    marketPrefixValue = marketPrefix(cookieTriple.country, locale, DEFAULT_CURRENCY);
  } else if (fromCookie.startsWith("/")) {
    const rawTriple = parseMarketPath(fromCookie);
    marketPrefixValue =
      rawTriple && isValidMarket(rawTriple.country)
        ? marketPrefix(rawTriple.country, locale, DEFAULT_CURRENCY)
        : fromCookie;
  } else {
    const market = defaultMarketForLocale(locale);
    marketPrefixValue = marketPrefix(market, locale, DEFAULT_CURRENCY);
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <StyledComponentsRegistry>
        <MarketPrefixProvider value={marketPrefixValue}>
          <Providers>{children}</Providers>
        </MarketPrefixProvider>
      </StyledComponentsRegistry>
    </NextIntlClientProvider>
  );
}
