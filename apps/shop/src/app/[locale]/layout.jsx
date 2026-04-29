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
  defaultCurrencyForMarket,
  isValidCurrency,
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
    const cur =
      headerTriple.currency && isValidCurrency(headerTriple.currency)
        ? headerTriple.currency
        : defaultCurrencyForMarket(headerTriple.country);
    if (String(headerTriple.lang).toLowerCase() !== String(locale).toLowerCase()) {
      marketPrefixValue = marketPrefix(headerTriple.country, locale, cur);
    } else {
      marketPrefixValue = fromHeader;
    }
  } else if (cookieTriple && isValidMarket(cookieTriple.country)) {
    const cur =
      cookieTriple.currency && isValidCurrency(cookieTriple.currency)
        ? cookieTriple.currency
        : defaultCurrencyForMarket(cookieTriple.country);
    marketPrefixValue = marketPrefix(cookieTriple.country, locale, cur);
  } else if (fromCookie.startsWith("/")) {
    marketPrefixValue = fromCookie;
  } else {
    const market = defaultMarketForLocale(locale);
    marketPrefixValue = marketPrefix(market, locale, defaultCurrencyForMarket(market));
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
