import { fmtMoney } from "@/lib/locale-text";
import { statusLabel } from "@/lib/status-labels";
import { fieldNameDisplayLabel } from "@/lib/product-change-request-format";
import { getNotificationsPageCopy } from "@/lib/notifications-page-i18n";

export function getNotificationGroupLabel(group, locale) {
  const c = getNotificationsPageCopy(locale);
  const key = group?.key;
  if (key && c.groupLabels[key]) return c.groupLabels[key];
  if (locale === "en" && group?.label_en) return group.label_en;
  if (locale === "tr" && group?.label_tr) return group.label_tr;
  return group?.label_de || key || "—";
}

function fmtOrderMoney(totalCents, locale) {
  if (!totalCents) return "";
  return fmtMoney(totalCents, locale);
}

/** Localize feed item title/subtitle for display (API may return German strings). */
export function localizeNotificationItem(it, locale) {
  const c = getNotificationsPageCopy(locale);
  if (!it) return { title: "—", subtitle: "" };

  const type = it.source_type;

  if (type === "order") {
    const num = it.order_number != null ? it.order_number : "—";
    const name = `${it.first_name || ""} ${it.last_name || ""}`.trim();
    const money = fmtOrderMoney(it.total_cents, locale);
    const subtitle = [name, money].filter(Boolean).join(" · ");
    return {
      ...it,
      title: c.itemTitles.newOrder(num),
      subtitle: subtitle || it.subtitle || "",
    };
  }

  if (type === "return") {
    const rNum = it.return_number != null ? it.return_number : "—";
    const oNum = it.order_number != null ? it.order_number : "—";
    const st = it.status ? statusLabel(locale, it.status) : "";
    return {
      ...it,
      title: c.itemTitles.returnRequest(rNum),
      subtitle: `${c.itemTitles.orderRef(oNum)}${st ? ` · ${st}` : ""}`,
    };
  }

  if (type === "product_change_request") {
    const product = it.product_title || c.productFallback;
    return {
      ...it,
      title: c.itemTitles.productChangePending,
      subtitle: `${product} · ${fieldNameDisplayLabel(it.field_name, locale)}`,
    };
  }

  if (type === "metafield_pending") {
    const label = it.metafield_label || it.metafield_key || c.metafieldFallback;
    return {
      ...it,
      title: c.itemTitles.metafieldChangePending,
      subtitle: label,
      field_name: it.field_name || (it.metafield_key ? `metafield.${it.metafield_key}` : "metafield"),
    };
  }

  if (type === "verification") {
    return {
      ...it,
      title: it.title || c.itemTitles.docSubmitted,
      subtitle: it.subtitle || it.body || c.itemTitles.docSubmittedBody,
    };
  }

  if (type === "campaign_submitted") {
    return {
      ...it,
      title: it.title || c.itemTitles.newCampaign,
      subtitle: it.subtitle || it.body || "",
    };
  }

  if (type === "seller_notice") {
    return {
      ...it,
      title: it.title || c.itemTitles.sellerNotice,
      subtitle: it.subtitle || it.body || "",
    };
  }

  return { ...it, title: it.title || "—", subtitle: it.subtitle || "" };
}

export function changeSuggestionTypeLabel(it, locale) {
  const c = getNotificationsPageCopy(locale);
  if (it.source_type === "metafield_pending") return c.typeMetafield;
  return c.typeProduct;
}

export function changeSuggestionItemLabel(it, locale) {
  const c = getNotificationsPageCopy(locale);
  if (it.source_type === "metafield_pending") {
    return it.metafield_label || it.metafield_key || c.metafieldFallback;
  }
  return it.product_title || c.productFallback;
}

export function changeSuggestionFieldLabel(it, locale) {
  if (it.source_type === "metafield_pending") {
    return it.metafield_key || "—";
  }
  return fieldNameDisplayLabel(it.field_name, locale);
}
