import en from "@shopify/polaris/locales/en.json";
import de from "@shopify/polaris/locales/de.json";
import tr from "@shopify/polaris/locales/tr.json";
import fr from "@shopify/polaris/locales/fr.json";
import es from "@shopify/polaris/locales/es.json";
import it from "@shopify/polaris/locales/it.json";

const MAP = { en, de, tr, fr, es, it };

/** Shopify Polaris AppProvider i18n bundle for seller UI locale. */
export function polarisI18nFor(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  return MAP[loc] || de;
}
