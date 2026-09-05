"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getToken } from "@andertal/lib";
import { getMedusaClient, resolveMedusaBaseUrl } from "@/lib/medusa-client";
import styles from "./SupportLanding.module.css";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const ORDER_CATEGORIES = new Set(["order", "delivery", "return", "refund", "invoice", "product", "seller"]);
const PLATFORM_CATEGORIES = new Set(["payment", "account", "bonus", "privacy", "technical", "other"]);
const VALID_RUNTIME_CATEGORIES = new Set([...ORDER_CATEGORIES, ...PLATFORM_CATEGORIES]);
const NONTERMINAL_STATUSES = ["open", "awaiting_customer", "awaiting_seller", "awaiting_support", "reopened"];

// Customer-facing fallback topics — invoice/other map 1:1 to backend categories.
const DEFAULT_CATEGORIES = [
  { key: "order", runtimeCategory: "order", icon: "📦", orderRelated: true, subtopics: ["wrong_item", "missing_item", "delivery_late", "tracking"] },
  { key: "return", runtimeCategory: "return", icon: "↩", orderRelated: true, subtopics: ["return", "refund", "cancellation", "damaged"] },
  { key: "payment", runtimeCategory: "payment", icon: "💳", orderRelated: false, subtopics: ["payment_failed", "charged_twice"] },
  { key: "invoice", runtimeCategory: "invoice", icon: "🧾", orderRelated: true, subtopics: ["invoice", "invoice_incorrect"] },
  { key: "account", runtimeCategory: "account", icon: "👤", orderRelated: false, subtopics: ["login", "profile", "security"] },
  { key: "bonus", runtimeCategory: "bonus", icon: "🎁", orderRelated: false, subtopics: ["promotion", "bonus_missing"] },
  { key: "product", runtimeCategory: "product", icon: "🛍", orderRelated: true, subtopics: ["defective", "not_as_described", "warranty"] },
  { key: "technical", runtimeCategory: "technical", icon: "🛠", orderRelated: false, subtopics: ["technical", "accessibility"] },
  { key: "privacy", runtimeCategory: "privacy", icon: "🛡", orderRelated: false, subtopics: ["privacy", "data_deletion"] },
  { key: "other", runtimeCategory: "other", icon: "?", orderRelated: false, subtopics: ["feedback", "other"] },
];

const RUNTIME_ALIASES = {
  payments: "payment",
  orders_delivery: "order",
  order_delivery: "order",
  returns_refunds: "return",
  product_issue: "product",
  platform: "technical",
};

function localized(object, field, locale, fallback = "") {
  if (!object) return fallback;
  if (locale && locale !== "de") {
    const translated = object?._i18n?.[locale]?.[field];
    if (translated !== undefined && translated !== null && String(translated).trim()) return translated;
  }
  const value = object?.[field];
  return value !== undefined && value !== null && String(value).trim() ? value : fallback;
}

function localizedList(container, fields, locale) {
  for (const field of fields) {
    const translated = locale !== "de" ? container?._i18n?.[locale]?.[field] : null;
    if (Array.isArray(translated)) return translated;
    if (Array.isArray(container?.[field])) return container[field];
  }
  return [];
}

function authHeaders(json = true) {
  const token = getToken("customer");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function imageUrl(value) {
  const source = String(value || "").trim();
  if (!source || /^https?:\/\//i.test(source) || source.startsWith("/")) return source;
  return `${resolveMedusaBaseUrl()}/uploads/${source}`;
}

function safeHref(value, fallback) {
  const candidate = String(value || "").trim();
  if (/^#[A-Za-z][\w:-]*$/.test(candidate) || /^\/(?!\/)/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch {}
  return fallback;
}

function runtimeCategoryFor(entry) {
  const requested = String(entry?.runtime_category || entry?.runtimeCategory || entry?.category || entry?.key || "").trim().toLowerCase();
  const mapped = RUNTIME_ALIASES[requested] || requested;
  return VALID_RUNTIME_CATEGORIES.has(mapped) ? mapped : "technical";
}

function semanticKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferCategory(value) {
  const key = semanticKey(value);
  if (/refund|erstatt|rembourse|reembolso|rimbor/.test(key)) return "refund";
  if (/return|ruckgabe|retour|devolu|reso|iade/.test(key)) return "return";
  if (/deliver|liefer|livraison|entrega|consegna|teslim/.test(key)) return "delivery";
  if (/invoice|rechnung|facture|factura|fattura/.test(key)) return "invoice";
  if (/payment|zahlung|paiement|pago|pagamento|odeme/.test(key)) return "payment";
  if (/account|konto|compte|cuenta|hesap/.test(key)) return "account";
  if (/bonus|coupon|gutschein|kupon/.test(key)) return "bonus";
  if (/privacy|datenschutz|confidential|privacidad|gizlilik/.test(key)) return "privacy";
  if (/product|produkt|produit|producto|prodotto|urun|seller|verkaufer|vendeur|vendedor|satıcı/.test(key)) return "product";
  if (/technical|technisch|technique|tecnico|teknik/.test(key)) return "technical";
  if (/order|bestell|commande|pedido|ordine|siparis/.test(key)) return "order";
  return RUNTIME_ALIASES[key] || key || "other";
}

function emitTopic(topic) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("support-topic", topic || "");
  window.dispatchEvent(new CustomEvent("support-topic-change", { detail: topic || "" }));
}

function normalizeItems(order) {
  return Array.isArray(order?.items) ? order.items : Array.isArray(order?.line_items) ? order.line_items : [];
}

function itemSellerId(item) {
  return item?.seller_id || item?.seller?.id || item?.variant?.seller_id || item?.variant?.product?.seller_id || "";
}

function orderLabel(order) {
  return order?.display_id || order?.order_number || order?.number || String(order?.id || "").slice(-8);
}

function orderCardMeta(order) {
  const items = normalizeItems(order);
  const first = items[0];
  return {
    image: first?.image || first?.thumbnail || "",
    name: first?.title || first?.product_title || orderLabel(order),
    itemCount: items.length,
    date: order?.created_at || order?.ordered_at || null,
  };
}

function defaultSubcategory(categoryEntry) {
  return categoryEntry?.subtopics?.[0]?.id || categoryEntry?.runtimeCategory || categoryEntry?.id || "other";
}

function SupportHero({ container, locale }) {
  const t = useTranslations("supportCenter");
  const [openCount, setOpenCount] = useState(null);
  const [search, setSearch] = useState("");
  const image = imageUrl(localized(container, "image_url", locale, localized(container, "image", locale, "")));
  const background = container?.bg_color || container?.background_color || "#071d35";
  const foreground = container?.text_color || "#fffaf1";
  const accent = container?.accent_color || "#e9b15d";
  const showOpenCount = container?.show_open_case_count ?? container?.open_case_count_enabled ?? true;
  const primaryUrl = safeHref(container?.primary_action_url, "#support-wizard");
  const secondaryUrl = safeHref(container?.secondary_action_url, "/nachrichten");

  useEffect(() => {
    const token = getToken("customer");
    if (!token || !showOpenCount) return;
    Promise.all(NONTERMINAL_STATUSES.map((status) => getMedusaClient().request(
      `/store/support/cases?page=1&limit=1&status=${encodeURIComponent(status)}`,
      { headers: authHeaders(false), cache: "no-store" },
    ))).then((results) => {
      if (results.some((result) => result?.__error)) return;
      setOpenCount(results.reduce((sum, result) => sum + Number(result?.total ?? result?.count ?? result?.cases?.length ?? 0), 0));
    });
  }, [showOpenCount]);

  const submitSearch = (event) => {
    event.preventDefault();
    const value = search.trim();
    emitTopic(value);
    document.getElementById("support-faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className={styles.hero} style={{ "--support-bg": background, "--support-fg": foreground, "--support-accent": accent }}>
      <div className={styles.heroContent}>
        <p className={styles.eyebrow}>{localized(container, "trust_text", locale, localized(container, "eyebrow", locale, t("hero.eyebrow")))}</p>
        <h1>{localized(container, "title", locale, t("hero.title"))}</h1>
        <p className={styles.heroLead}>{localized(container, "description", locale, localized(container, "subtitle", locale, t("hero.subtitle")))}</p>
        <form className={styles.search} role="search" onSubmit={submitSearch}>
          <label className={styles.srOnly} htmlFor={`support-search-${container?.id || "hero"}`}>{t("hero.searchLabel")}</label>
          <input
            id={`support-search-${container?.id || "hero"}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localized(container, "search_placeholder", locale, t("hero.searchPlaceholder"))}
          />
          <button type="submit">{t("hero.searchAction")}</button>
        </form>
        <div className={styles.heroActions}>
          <a className={styles.primaryAction} href={primaryUrl}>{localized(container, "primary_action_label", locale, localized(container, "primary_action_text", locale, t("hero.openCase")))}</a>
          <a className={styles.secondaryAction} href={secondaryUrl}>{localized(container, "secondary_action_label", locale, localized(container, "secondary_action_text", locale, t("hero.myCases")))}</a>
        </div>
        {showOpenCount && openCount !== null && <p className={styles.openCount}>{localized(container, "open_case_label", locale, localized(container, "open_case_count_text", locale, t("hero.openCount", { count: openCount }))).replace("{count}", String(openCount))}</p>}
      </div>
      {image ? (
        <div className={styles.heroImage}>
          <Image src={image} alt={localized(container, "image_alt", locale, "")} fill sizes="(max-width: 800px) 100vw, 42vw" priority={false} />
        </div>
      ) : null}
    </section>
  );
}

function categoryConfig(container, locale, t) {
  const configured = Array.isArray(container?.categories) ? container.categories : [];
  const source = configured.length ? configured : DEFAULT_CATEGORIES;
  return source
    .map((entry, index) => {
      const key = semanticKey(entry?.key || entry?.id || `category_${index + 1}`);
      const runtimeCategory = runtimeCategoryFor(entry);
      const orderRelated = typeof entry?.order_related === "boolean"
        ? entry.order_related
        : typeof entry?.orderRelated === "boolean"
          ? entry.orderRelated
          : ORDER_CATEGORIES.has(runtimeCategory);
      const fallbackSubtopics = Array.isArray(entry?.subtopics) ? entry.subtopics : [];
      const subtopics = fallbackSubtopics
        .map((subtopic, subIndex) => {
          const fallbackId = typeof subtopic === "string" ? subtopic : `${key}_${subIndex + 1}`;
          const id = semanticKey(subtopic?.key || subtopic?.id || fallbackId) || `${key}_${subIndex + 1}`;
          const fallbackLabel = t.has(`subtopics.${id}`) ? t(`subtopics.${id}`) : String(subtopic?.label || subtopic?.title || id).replaceAll("_", " ");
          return {
            id,
            label: typeof subtopic === "string" ? fallbackLabel : localized(subtopic, "label", locale, localized(subtopic, "title", locale, fallbackLabel)),
            order: Number(subtopic?.order ?? subIndex),
          };
        })
        .sort((a, b) => a.order - b.order);
      const fallbackLabel = t.has(`categories.${key}`) ? t(`categories.${key}`) : key.replaceAll("_", " ");
      return {
        id: key,
        runtimeCategory,
        orderRelated,
        platform: typeof entry?.platform === "boolean" ? entry.platform : PLATFORM_CATEGORIES.has(runtimeCategory),
        icon: entry?.icon || DEFAULT_CATEGORIES.find((item) => item.key === key)?.icon || "•",
        label: localized(entry, "label", locale, localized(entry, "title", locale, fallbackLabel)),
        description: localized(entry, "description", locale, t.has(`categoryDescriptions.${key}`) ? t(`categoryDescriptions.${key}`) : ""),
        order: Number(entry?.order ?? index),
        subtopics,
      };
    })
    .filter((entry) => entry.id)
    .sort((a, b) => a.order - b.order);
}

function SupportTopicGrid({ container, locale }) {
  const t = useTranslations("supportCenter");
  const configured = Array.isArray(container?.topics) ? container.topics : [];
  const topics = (configured.length ? configured : DEFAULT_CATEGORIES)
    .map((topic, index) => {
      const category = semanticKey(topic?.category || topic?.key);
      const fallbackLabel = t.has(`categories.${category}`) ? t(`categories.${category}`) : category.replaceAll("_", " ");
      return {
        id: `${category || "topic"}-${index}`,
        category,
        icon: topic?.icon || DEFAULT_CATEGORIES.find((entry) => entry.key === category)?.icon || "•",
        title: localized(topic, "title", locale, localized(topic, "label", locale, fallbackLabel)),
        description: localized(topic, "description", locale, t.has(`categoryDescriptions.${category}`) ? t(`categoryDescriptions.${category}`) : ""),
        order: Number(topic?.order ?? index),
      };
    })
    .filter((topic) => topic.category)
    .sort((a, b) => a.order - b.order);
  const columns = Math.max(2, Math.min(4, Number(container?.columns) || 3));
  return (
    <section className={styles.section} aria-labelledby={`topics-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`topics-${container?.id || "support"}`}>{localized(container, "title", locale, t("topics.title"))}</h2>
        <p>{localized(container, "description", locale, localized(container, "subtitle", locale, t("topics.subtitle")))}</p>
      </div>
      <div className={styles.topicGrid} style={{ "--support-topic-columns": columns }}>
        {topics.map((topic) => (
          <a
            key={topic.id}
            className={styles.topicCard}
            href="#support-wizard"
            onClick={() => emitTopic(topic.category)}
          >
            <span className={styles.topicIcon} aria-hidden="true">{topic.icon}</span>
            <strong>{topic.title}</strong>
            <span>{topic.description}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function WizardProgress({ step, t }) {
  return (
    <ol className={styles.progress} aria-label={t("wizard.progressLabel")}>
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} aria-current={step === index ? "step" : undefined} className={step === index ? styles.currentStep : step > index ? styles.doneStep : ""}>
          <span>{index + 1}</span><small>{t(`wizard.steps.${index + 1}`)}</small>
        </li>
      ))}
    </ol>
  );
}

function SupportCaseWizard({ container, locale }) {
  const t = useTranslations("supportCenter");
  const router = useRouter();
  const categories = useMemo(() => categoryConfig(container, locale, t), [container, locale, t]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale || "de", { day: "2-digit", month: "short", year: "numeric" }),
    [locale],
  );
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [itemIds, setItemIds] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyRef = useRef("");
  const uploadedRef = useRef(null);
  const selectedCategory = categories.find((entry) => entry.id === category);
  const selectedOrder = orders.find((entry) => String(entry.id) === orderId);
  const selectedItems = normalizeItems(selectedOrder).filter((item) => itemIds.includes(String(item.id)));
  const sellerCount = new Set(selectedItems.map(itemSellerId).filter(Boolean)).size;

  useEffect(() => {
    uploadedRef.current = null;
  }, [files]);

  useEffect(() => {
    const receive = (event) => {
      const topic = semanticKey(event?.detail);
      const match = categories.find((entry) => entry.id === topic)
        || categories.find((entry) => entry.runtimeCategory === runtimeCategoryFor({ key: topic }));
      if (match) {
        setCategory(match.id);
        setSubcategory(defaultSubcategory(match));
        setOrderId("");
        setItemIds([]);
        setStep(1);
      }
    };
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("support-topic") : "";
    if (stored) receive({ detail: stored });
    window.addEventListener("support-topic-change", receive);
    return () => window.removeEventListener("support-topic-change", receive);
  }, [categories]);

  useEffect(() => {
    if (step !== 1 || !selectedCategory?.orderRelated || orders.length) return;
    setBusy(true);
    getMedusaClient().request("/store/support/orders?limit=10", { headers: authHeaders(false), cache: "no-store" })
      .then((data) => {
        if (data?.__error) setError(t("errors.loadOrders"));
        else setOrders(Array.isArray(data?.orders) ? data.orders : []);
      })
      .finally(() => setBusy(false));
  }, [step, selectedCategory?.orderRelated, orders.length, t]);

  const chooseCategory = (id) => {
    const match = categories.find((entry) => entry.id === id);
    setCategory(id);
    setSubcategory(defaultSubcategory(match));
    setOrderId("");
    setItemIds([]);
    emitTopic(id);
  };

  const chooseOrder = (id) => {
    const order = orders.find((entry) => String(entry.id) === String(id));
    setOrderId(String(id));
    setItemIds(normalizeItems(order).map((item) => String(item.id)).filter(Boolean));
  };

  const validateFiles = (incoming) => {
    const next = [...files, ...incoming];
    if (next.length > MAX_FILES) return setError(t("errors.fileCount", { count: MAX_FILES }));
    const invalid = next.find((file) => !ACCEPTED.has(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) return setError(t("errors.fileTypeSize"));
    setError("");
    setFiles(next);
  };

  const uploadFiles = async () => {
    if (!files.length) return [];
    if (uploadedRef.current?.length === files.length) return uploadedRef.current;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const response = await fetch(`${resolveMedusaBaseUrl()}/store/support/attachments/upload`, {
      method: "POST",
      headers: authHeaders(false),
      body: form,
    });
    if (!response.ok) throw new Error(t("errors.upload"));
    const data = await response.json();
    if (!Array.isArray(data?.attachments) || data.attachments.length !== files.length) throw new Error(t("errors.upload"));
    uploadedRef.current = data.attachments;
    return data.attachments;
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = await uploadFiles();
      if (!idempotencyRef.current) idempotencyRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const result = await getMedusaClient().request("/store/support/cases", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category: selectedCategory?.runtimeCategory,
          subcategory: subcategory || defaultSubcategory(selectedCategory),
          title: title.trim(),
          description: description.trim(),
          order_id: selectedCategory?.orderRelated ? orderId || null : null,
          item_ids: selectedCategory?.orderRelated ? itemIds : [],
          locale,
          attachments: uploaded,
          idempotency_key: idempotencyRef.current,
        }),
      });
      if (result?.__error) throw new Error(result.message || t("errors.submit"));
      const primaryId = result?.primary_case_id || result?.case?.id || result?.id;
      if (!primaryId) throw new Error(t("errors.submit"));
      uploadedRef.current = null;
      setStep(4);
      router.push(`/nachrichten?case=${encodeURIComponent(primaryId)}`);
    } catch (submitError) {
      setError(submitError?.message || t("errors.submit"));
    } finally {
      setBusy(false);
    }
  };

  const canContinue = [
    Boolean(category),
    !selectedCategory?.orderRelated || (Boolean(orderId) && itemIds.length > 0),
    title.trim().length >= 3 && description.trim().length >= 10,
    true,
    false,
  ][step];

  return (
    <section id="support-wizard" className={`${styles.section} ${styles.wizardSection}`} aria-labelledby={`wizard-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`wizard-${container?.id || "support"}`}>{localized(container, "title", locale, t("wizard.title"))}</h2>
        <p>{localized(container, "description", locale, localized(container, "subtitle", locale, t("wizard.subtitle")))}</p>
      </div>
      <WizardProgress step={step} t={t} />
      <div className={styles.wizardPanel}>
        {step === 0 && (
          <fieldset className={styles.choiceGrid}>
            <legend>{localized(container, "category_heading", locale, t("wizard.categoryPrompt"))}</legend>
            {categories.map((entry) => (
              <label key={entry.id} className={category === entry.id ? styles.selectedChoice : styles.choice}>
                <input type="radio" name="support-category" value={entry.id} checked={category === entry.id} onChange={() => chooseCategory(entry.id)} />
                <strong>{entry.label}</strong><span>{entry.description}</span>
              </label>
            ))}
          </fieldset>
        )}
        {step === 1 && (
          selectedCategory?.orderRelated ? (
            <div>
              <h3 className={styles.orderHeading}>{localized(container, "order_heading", locale, t("wizard.orderPrompt"))}</h3>
              {busy && !orders.length ? <p className={styles.notice}>{t("common.loading")}</p> : null}
              {!busy && !orders.length ? <p className={styles.notice}>{t("wizard.noOrders")}</p> : null}
              {orders.length > 0 && (
                <div className={styles.orderCardGrid} role="listbox" aria-label={t("wizard.orderPrompt")}>
                  {orders.map((order) => {
                    const meta = orderCardMeta(order);
                    const selected = String(order.id) === orderId;
                    const thumb = imageUrl(meta.image);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? styles.orderCardSelected : styles.orderCard}
                        onClick={() => chooseOrder(order.id)}
                      >
                        <span className={styles.orderCardThumb}>
                          {thumb ? (
                            <Image src={thumb} alt="" width={72} height={72} />
                          ) : (
                            <span aria-hidden="true">📦</span>
                          )}
                        </span>
                        <span className={styles.orderCardBody}>
                          <strong>{meta.name}</strong>
                          <span>{t("wizard.orderLabel", { number: orderLabel(order) })}</span>
                          {meta.date ? <time dateTime={String(meta.date)}>{dateFormatter.format(new Date(meta.date))}</time> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {sellerCount > 1 && <p className={styles.notice} role="status">{t("wizard.multiSellerNotice", { count: sellerCount })}</p>}
            </div>
          ) : <p className={styles.notice}>{t("wizard.platformNoOrder")}</p>
        )}
        {step === 2 && (
          <div className={styles.formStack}>
            <label className={styles.field}><span>{t("wizard.titleLabel")}</span>
              <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder={t("wizard.titlePlaceholder")} />
            </label>
            <label className={styles.field}><span>{t("wizard.descriptionLabel")}</span>
              <textarea value={description} maxLength={5000} rows={7} onChange={(event) => setDescription(event.target.value)} placeholder={t("wizard.descriptionPlaceholder")} />
            </label>
            <label className={styles.field}><span>{t("wizard.attachmentsLabel")}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => validateFiles(Array.from(event.target.files || []))} />
              <small>{t("wizard.attachmentsHint", { count: MAX_FILES, size: 10 })}</small>
            </label>
            {files.length > 0 && <ul className={styles.fileList}>{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>{t("common.remove")}</button></li>)}</ul>}
          </div>
        )}
        {step === 3 && (
          <div className={styles.review}>
            <h3>{t("wizard.reviewTitle")}</h3>
            <dl>
              <div><dt>{t("wizard.categoryLabel")}</dt><dd>{selectedCategory?.label}</dd></div>
              {selectedCategory?.orderRelated && <div><dt>{t("wizard.orderReviewLabel")}</dt><dd>{orderLabel(selectedOrder)}</dd></div>}
              <div><dt>{t("wizard.titleLabel")}</dt><dd>{title}</dd></div>
              <div><dt>{t("wizard.descriptionLabel")}</dt><dd>{description}</dd></div>
              <div><dt>{t("wizard.attachmentsLabel")}</dt><dd>{files.length}</dd></div>
            </dl>
          </div>
        )}
        {step === 4 && <p className={styles.notice}>{t("wizard.redirecting")}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {step < 4 && (
          <div className={styles.wizardActions}>
            {step > 0 && <button type="button" className={styles.backButton} onClick={() => { setError(""); setStep((current) => current - 1); }}>{localized(container, "back_label", locale, t("common.back"))}</button>}
            <button type="button" className={styles.continueButton} disabled={!canContinue || busy} onClick={() => step === 3 ? submit() : setStep((current) => current + 1)}>
              {busy ? t("common.loading") : step === 3 ? t("wizard.submit") : localized(container, "continue_label", locale, t("common.continue"))}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SupportFaq({ container, locale }) {
  const t = useTranslations("supportCenter");
  const nestedCategories = Array.isArray(container?.categories) ? [...container.categories].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0)) : [];
  const topLevelItems = localizedList(container, ["faqs", "questions", "items"], locale);
  const defaults = [
    ["order", "order_delivery"],
    ["return", "returns_refunds"],
    ["product", "product_issue"],
    ["payment", "payment"],
    ["account", "account"],
    ["technical", "platform"],
  ].map(([category, translationKey], index) => ({
    id: `fallback-${category}`,
    category,
    categoryLabel: t(`categories.${category}`),
    categoryOrder: index,
    order: 0,
    question: t(`faq.defaults.${translationKey}.question`),
    answer: t(`faq.defaults.${translationKey}.answer`),
  }));
  const nestedItems = nestedCategories.flatMap((faqCategory, categoryIndex) => {
    const categoryLabel = localized(faqCategory, "title", locale, t("faq.allCategories"));
    const category = semanticKey(faqCategory?.key || faqCategory?.category) || inferCategory(categoryLabel);
    return (Array.isArray(faqCategory?.items) ? faqCategory.items : [])
      .map((item, itemIndex) => ({
        id: item.id || `faq-${categoryIndex}-${itemIndex}`,
        category,
        categoryLabel,
        categoryOrder: Number(faqCategory?.order ?? categoryIndex),
        order: Number(item?.order ?? itemIndex),
        question: localized(item, "question", locale, item.title || ""),
        answer: localized(item, "answer", locale, item.description || ""),
        actionLabel: localized(item, "action_label", locale, ""),
        actionUrl: safeHref(item?.action_url, ""),
      }))
      .sort((a, b) => a.order - b.order);
  });
  const legacyItems = topLevelItems.map((item, index) => ({
    id: item.id || `faq-${index}`,
    category: semanticKey(item.category) || inferCategory(item.category),
    categoryLabel: item.category_label || item.category || t("faq.allCategories"),
    categoryOrder: Number(item.category_order ?? index),
    order: Number(item.order ?? index),
    question: localized(item, "question", locale, item.title || ""),
    answer: localized(item, "answer", locale, item.description || ""),
    actionLabel: localized(item, "action_label", locale, ""),
    actionUrl: safeHref(item?.action_url, ""),
  }));
  const faqs = nestedItems.length ? nestedItems : legacyItems.length ? legacyItems : defaults;
  const categories = useMemo(() => {
    const seen = new Set();
    return faqs
      .filter((faq) => {
        if (seen.has(faq.category)) return false;
        seen.add(faq.category);
        return true;
      })
      .sort((a, b) => a.categoryOrder - b.categoryOrder)
      .map((faq) => ({ id: faq.category, label: faq.categoryLabel }));
  }, [faqs]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [related, setRelated] = useState("");

  useEffect(() => {
    const receive = (event) => {
      const raw = String(event?.detail || "");
      const value = semanticKey(raw);
      const direct = categories.find((entry) => entry.id === value);
      const routed = categories.find((entry) => runtimeCategoryFor({ key: entry.id }) === runtimeCategoryFor({ key: value }));
      setRelated(direct?.id || routed?.id || value);
      if (direct || routed) setCategory((direct || routed).id);
      else setQuery(raw);
    };
    const stored = window.sessionStorage.getItem("support-topic");
    if (stored) receive({ detail: stored });
    window.addEventListener("support-topic-change", receive);
    return () => window.removeEventListener("support-topic-change", receive);
  }, [categories]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return faqs
      .filter((faq) => category === "all" || faq.category === category)
      .filter((faq) => !needle || `${faq.question} ${faq.answer}`.toLocaleLowerCase(locale).includes(needle))
      .sort((a, b) => Number(b.category === related) - Number(a.category === related) || a.categoryOrder - b.categoryOrder || a.order - b.order);
  }, [category, faqs, locale, query, related]);

  const configuredLinks = localizedList(container, ["self_service_links", "links"], locale);
  const links = configuredLinks.length ? configuredLinks : [
    { id: "orders", url: "/orders", title: t("faq.defaultOrders") },
    { id: "account", url: "/account", title: t("faq.defaultAccount") },
  ];
  return (
    <section id="support-faq" className={styles.section} aria-labelledby={`faq-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`faq-${container?.id || "support"}`}>{localized(container, "title", locale, t("faq.title"))}</h2>
        <p>{localized(container, "description", locale, localized(container, "subtitle", locale, t("faq.subtitle")))}</p>
      </div>
      <div className={styles.faqTools}>
        <label className={styles.field}><span>{t("faq.categoryLabel")}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">{t("faq.allCategories")}</option>
            {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>{t("faq.searchLabel")}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("faq.searchPlaceholder")} />
        </label>
      </div>
      {visible.length ? (
        <div className={styles.faqList}>
          {visible.map((faq) => (
            <details key={faq.id}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
              {faq.actionLabel && faq.actionUrl && <a className={styles.faqAction} href={faq.actionUrl}>{faq.actionLabel}</a>}
            </details>
          ))}
        </div>
      ) : (
        <div className={styles.noResults}><p>{localized(container, "no_results_text", locale, t("faq.noResults"))}</p><a href="#support-wizard">{t("faq.openCase")}</a></div>
      )}
      {links.length > 0 && (
        <nav className={styles.selfLinks} aria-label={t("faq.selfServiceLabel")}>
          {links.map((link, index) => <a key={link.id || index} href={safeHref(link.url || link.href, "/")}>{localized(link, "title", locale, link.label || t("faq.selfService"))}</a>)}
        </nav>
      )}
    </section>
  );
}

// Amazon-style "need help with a recent item?" strip — real customer orders, personalized
// title when logged in, guest fallback (no orders can be fetched without a token) otherwise.
function SupportOrderPicker({ container, locale }) {
  const t = useTranslations("supportCenter");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale || "de", { day: "2-digit", month: "short", year: "numeric" }),
    [locale],
  );
  const limit = Math.max(1, Math.min(24, Number(container?.orders_limit) || 6));

  useEffect(() => {
    const token = getToken("customer");
    if (!token) { setLoggedIn(false); return; }
    setLoggedIn(true);
    setLoading(true);
    Promise.all([
      getMedusaClient().request(`/store/support/orders?limit=${encodeURIComponent(limit)}`, { headers: authHeaders(false), cache: "no-store" }),
      getMedusaClient().getCustomer(token).catch(() => null),
    ]).then(([ordersRes, customerRes]) => {
      if (!ordersRes?.__error) setOrders(Array.isArray(ordersRes?.orders) ? ordersRes.orders : []);
      if (customerRes?.customer?.first_name) setFirstName(customerRes.customer.first_name);
    }).finally(() => setLoading(false));
  }, [limit]);

  const titleTemplate = loggedIn
    ? localized(container, "title", locale, t("orderPicker.title"))
    : localized(container, "guest_title", locale, t("orderPicker.guestTitle"));
  const title = firstName ? titleTemplate.replace("{first_name}", firstName) : titleTemplate.replace(/,?\s*\{first_name\}/, "");
  const otherItemUrl = safeHref(container?.cta_other_item_url, "/orders");
  const otherProblemUrl = safeHref(container?.cta_other_problem_url, "#support-wizard");

  return (
    <section className={styles.section} aria-labelledby={`orderpicker-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`orderpicker-${container?.id || "support"}`}>{title}</h2>
        {loggedIn && <p>{localized(container, "subtitle", locale, t("orderPicker.subtitle"))}</p>}
      </div>
      {loading ? (
        <p className={styles.notice}>{t("common.loading")}</p>
      ) : orders.length > 0 ? (
        <div className={styles.orderCardGrid} role="list">
          {orders.map((order) => {
            const meta = orderCardMeta(order);
            const thumb = imageUrl(meta.image);
            return (
              <button
                key={order.id}
                type="button"
                className={styles.orderCard}
                onClick={() => { emitTopic("order"); document.getElementById("support-wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              >
                <span className={styles.orderCardThumb}>
                  {thumb ? <Image src={thumb} alt="" width={72} height={72} /> : <span aria-hidden="true">📦</span>}
                </span>
                <span className={styles.orderCardBody}>
                  <strong>{meta.name}</strong>
                  <span>{t("wizard.orderLabel", { number: orderLabel(order) })}</span>
                  {meta.date ? <time dateTime={String(meta.date)}>{dateFormatter.format(new Date(meta.date))}</time> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.notice}>{localized(container, "empty_orders_text", locale, t("orderPicker.empty"))}</p>
      )}
      <div className={styles.heroActions}>
        <a className={styles.secondaryAction} href={otherItemUrl}>{localized(container, "cta_other_item_label", locale, t("orderPicker.otherItem"))}</a>
        <a className={styles.secondaryAction} href={otherProblemUrl} onClick={() => emitTopic("")}>{localized(container, "cta_other_problem_label", locale, t("orderPicker.otherProblem"))}</a>
      </div>
    </section>
  );
}

// Static "questions about your purchases?" card grid (icon + title + description + link).
function SupportHelpCards({ container, locale }) {
  const t = useTranslations("supportCenter");
  const cards = (Array.isArray(container?.cards) ? container.cards : [])
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  const columnsDesktop = Math.max(1, Math.min(4, Number(container?.columns_desktop) || 2));
  const viewAllUrl = safeHref(container?.view_all_url, "");

  return (
    <section className={styles.section} aria-labelledby={`helpcards-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`helpcards-${container?.id || "support"}`}>{localized(container, "title", locale, t("helpCards.title"))}</h2>
        {viewAllUrl && <a href={viewAllUrl} className={styles.viewAllLink}>{localized(container, "view_all_label", locale, t("helpCards.viewAll"))}</a>}
      </div>
      <div className={styles.helpCardGrid} style={{ "--support-help-columns": columnsDesktop }}>
        {cards.map((card, index) => (
          <a key={card.id || index} className={styles.helpCard} href={safeHref(card?.url, "#support-wizard")}>
            <span className={styles.helpCardIcon} aria-hidden="true">{card.icon || "•"}</span>
            <strong>{localized(card, "title", locale, "")}</strong>
            <span>{localized(card, "description", locale, "")}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Searchable "help library" — topic chips + article list + closing "still need help" CTA.
function SupportHelpLibrary({ container, locale }) {
  const t = useTranslations("supportCenter");
  const [query, setQuery] = useState("");
  const topics = (Array.isArray(container?.topics) ? container.topics : []).slice().sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  const articles = (Array.isArray(container?.articles) ? container.articles : []).slice().sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  const needle = query.trim().toLocaleLowerCase(locale);
  const visibleArticles = needle
    ? articles.filter((article) => `${localized(article, "title", locale, "")} ${localized(article, "excerpt", locale, "")}`.toLocaleLowerCase(locale).includes(needle))
    : articles;

  return (
    <section className={styles.section} aria-labelledby={`helplibrary-${container?.id || "support"}`}>
      <div className={styles.sectionHeading}>
        <h2 id={`helplibrary-${container?.id || "support"}`}>{localized(container, "title", locale, t("helpLibrary.title"))}</h2>
      </div>
      <label className={styles.field}>
        <span className={styles.srOnly}>{localized(container, "search_placeholder", locale, t("helpLibrary.searchPlaceholder"))}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localized(container, "search_placeholder", locale, t("helpLibrary.searchPlaceholder"))} />
      </label>
      {topics.length > 0 && (
        <>
          <h3 className={styles.orderHeading}>{localized(container, "recommended_heading", locale, t("helpLibrary.recommended"))}</h3>
          <nav className={styles.topicChips} aria-label={localized(container, "all_topics_label", locale, t("helpLibrary.allTopics"))}>
            {topics.map((topic, index) => (
              <a key={topic.id || index} href={safeHref(topic?.url, "#support-wizard")} className={styles.topicChip}>
                {localized(topic, "title", locale, "")}
              </a>
            ))}
          </nav>
        </>
      )}
      {visibleArticles.length > 0 && (
        <>
          <h3 className={styles.orderHeading}>{localized(container, "more_heading", locale, t("helpLibrary.more"))}</h3>
          <ul className={styles.articleList}>
            {visibleArticles.map((article, index) => (
              <li key={article.id || index}>
                <a href={safeHref(article?.url, "#support-wizard")}>
                  <strong>{localized(article, "title", locale, "")}</strong>
                  <span>{localized(article, "excerpt", locale, "")}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={styles.helpLibraryFooter}>
        <strong>{localized(container, "footer_title", locale, t("helpLibrary.footerTitle"))}</strong>
        <p>{localized(container, "footer_body", locale, "")}</p>
        <a className={styles.primaryAction} href={safeHref(container?.footer_cta_url, "#support-wizard")}>
          {localized(container, "footer_cta_label", locale, t("helpLibrary.footerCta"))}
        </a>
      </div>
    </section>
  );
}

export default function SupportLanding({ type, container, locale }) {
  if (type === "support_hero") return <SupportHero container={container} locale={locale} />;
  if (type === "support_topic_grid") return <SupportTopicGrid container={container} locale={locale} />;
  if (type === "support_case_wizard") return <SupportCaseWizard container={container} locale={locale} />;
  if (type === "support_faq") return <SupportFaq container={container} locale={locale} />;
  if (type === "support_order_picker") return <SupportOrderPicker container={container} locale={locale} />;
  if (type === "support_help_cards") return <SupportHelpCards container={container} locale={locale} />;
  if (type === "support_help_library") return <SupportHelpLibrary container={container} locale={locale} />;
  return null;
}
