"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Page, Text, Button, Badge, BlockStack, InlineStack,
  Box, Divider, Spinner, TextField, Tabs, Select,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { dateLocaleFor, lt } from "@/lib/locale-text";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getSupportCaseText } from "@/lib/support-case-i18n";
import SupportCaseInbox from "@/components/support/SupportCaseInbox";
import FlowEmailBodyEditor, { htmlToPlainText } from "@/components/content/FlowEmailBodyEditor";
import {
  MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS,
  applyMessagePlaceholders,
  buildCustomerInboxPlaceholderContext,
  buildSupportInboxPlaceholderContext,
} from "@/lib/message-template-placeholders";

function fmtDate(d, locale) {
  if (!d) return "";
  return new Date(d).toLocaleString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtCents(c) {
  if (c == null) return "—";
  return (Number(c) / 100).toFixed(2).replace(".", ",") + " €";
}

function stripUnsafeMarkup(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s(on\w+|javascript:)\s*=/gi, " data-blocked=");
}

function MessageBubbleBody({ body }) {
  const raw = String(body || "");
  const looksHtml = /<[a-z][\s\S]*>/i.test(raw);
  if (!looksHtml) {
    return <Text as="p" variant="bodySm">{raw}</Text>;
  }
  return (
    <div
      className="inbox-msg-html"
      style={{ wordBreak: "break-word", fontSize: 13, lineHeight: 1.45, color: "inherit" }}
      dangerouslySetInnerHTML={{ __html: stripUnsafeMarkup(raw) }}
    />
  );
}

const STATUS_TONE = {
  pending: "warning", processing: "info", shipped: "info",
  delivered: "success", cancelled: "critical", refunded: "critical", completed: "success",
};
function getStatusLabel(status, locale) {
  const map = {
    pending: locale === "en" ? "Pending" : locale === "tr" ? "Beklemede" : locale === "fr" ? "En attente" : locale === "es" ? "Pendiente" : locale === "it" ? "In attesa" : "Ausstehend",
    processing: locale === "en" ? "Processing" : locale === "tr" ? "İşleniyor" : locale === "fr" ? "En cours" : locale === "es" ? "En proceso" : locale === "it" ? "In elaborazione" : "In Bearbeitung",
    shipped: locale === "en" ? "Shipped" : locale === "tr" ? "Kargoya verildi" : locale === "fr" ? "Expédié" : locale === "es" ? "Enviado" : locale === "it" ? "Spedito" : "Versendet",
    delivered: locale === "en" ? "Delivered" : locale === "tr" ? "Teslim edildi" : locale === "fr" ? "Livré" : locale === "es" ? "Entregado" : locale === "it" ? "Consegnato" : "Geliefert",
    cancelled: locale === "en" ? "Cancelled" : locale === "tr" ? "İptal edildi" : locale === "fr" ? "Annulé" : locale === "es" ? "Cancelado" : locale === "it" ? "Annullato" : "Storniert",
    refunded: locale === "en" ? "Refunded" : locale === "tr" ? "İade edildi" : locale === "fr" ? "Remboursé" : locale === "es" ? "Reembolsado" : locale === "it" ? "Rimborsato" : "Erstattet",
    completed: locale === "en" ? "Completed" : locale === "tr" ? "Tamamlandı" : locale === "fr" ? "Terminé" : locale === "es" ? "Completado" : locale === "it" ? "Completato" : "Abgeschlossen",
  };
  return map[status] || status;
}

function groupByOrder(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.order_id || "__no_order__";
    if (!map[key]) {
      map[key] = {
        order_id: m.order_id,
        order_number: m.order_number,
        order_status: m.order_status || m.order_order_status,
        order_total_cents: m.order_total_cents,
        order_first_name: m.order_first_name,
        order_last_name: m.order_last_name,
        order_email: m.order_email,
        order_seller_id: m.order_seller_id,
        seller_store_name: m.seller_store_name,
        customer_number: m.customer_number,
        messages: [],
      };
    }
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")) }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

/** Superuser Kunden-Tab: oben Plattform/allgemein (ohne Bestellung oder ohne Verkäufer), darunter nach Verkäufer gruppiert. */
function partitionSuperuserCustomerThreads(threads, sellerNames) {
  const platform = [];
  const bySeller = new Map();
  const threadLast = (t) => t.messages[t.messages.length - 1]?.created_at || "";
  for (const t of threads) {
    const sid =
      t.order_seller_id != null && String(t.order_seller_id).trim() !== ""
        ? String(t.order_seller_id)
        : null;
    if (!t.order_id || !sid) {
      platform.push(t);
    } else {
      if (!bySeller.has(sid)) bySeller.set(sid, []);
      bySeller.get(sid).push(t);
    }
  }
  platform.sort((a, b) => threadLast(b).localeCompare(threadLast(a)));
  const sellerGroups = Array.from(bySeller.entries())
    .map(([sellerId, ths]) => ({
      sellerId,
      label:
        (ths[0]?.seller_store_name && String(ths[0].seller_store_name).trim()) ||
        sellerNames[sellerId] ||
        sellerId,
      threads: [...ths].sort((a, b) => threadLast(b).localeCompare(threadLast(a))),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return { platformThreads: platform, sellerGroups };
}

function groupBySeller(messages) {
  const map = {};
  for (const m of messages) {
    const key = m.seller_id || "__unknown__";
    if (!map[key]) {
      map[key] = { seller_id: m.seller_id, messages: [] };
    }
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")) }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

/** Normalized subject key for grouping (empty string = no subject / legacy). */
function normalizeSupportSubjectKey(subject) {
  if (subject == null) return "";
  return String(subject).trim();
}

function supportSubjectTitle(subjectKey, locale) {
  return subjectKey ? subjectKey : (locale === "en" ? "General" : locale === "tr" ? "Genel" : locale === "fr" ? "Général" : locale === "es" ? "General" : locale === "it" ? "Generale" : "Allgemein");
}

function replySubjectForSupportThread(messages) {
  const sorted = [...messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  for (const m of sorted) {
    const t = m.subject != null && String(m.subject).trim();
    if (t) return String(m.subject).trim();
  }
  return null;
}

function groupBySupportSubject(messages) {
  const map = {};
  for (const m of messages) {
    const key = normalizeSupportSubjectKey(m.subject);
    if (!map[key]) map[key] = { subject_key: key, messages: [] };
    map[key].messages.push(m);
  }
  return Object.values(map)
    .map((t) => ({
      ...t,
      messages: [...t.messages].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
      reply_subject: replySubjectForSupportThread(t.messages),
    }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.created_at || "";
      const bLast = b.messages[b.messages.length - 1]?.created_at || "";
      return bLast.localeCompare(aLast);
    });
}

function useMessageTemplates(client, locale) {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesErr, setTemplatesErr] = useState("");

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesErr("");
    try {
      const data = await client.getMessageTemplates();
      setTemplates(data?.templates || []);
    } catch (e) {
      setTemplatesErr(e?.message || (locale === "en" ? "Templates could not be loaded" : locale === "tr" ? "Şablonlar yüklenemedi" : locale === "fr" ? "Impossible de charger les modèles" : locale === "es" ? "No se pudieron cargar las plantillas" : locale === "it" ? "Impossibile caricare i modelli" : "Vorlagen konnten nicht geladen werden"));
    } finally {
      setTemplatesLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return {
    templates,
    templatesLoading,
    templatesErr,
    loadTemplates,
  };
}

// ── Customer tab (original inbox) ──────────────────────────────────────────

function CustomerInbox({ client, isSuperuser, sellerNames, readOnly = false }) {
  const locale = useLocale();
  const ui = getUI(locale);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [placeholderInsert, setPlaceholderInsert] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortFilter, setSortFilter] = useState("unread_first");
  const bottomRef = useRef(null);
  const replyEditorRef = useRef(null);
  const { templates, templatesLoading, templatesErr, loadTemplates } = useMessageTemplates(client, locale);

  const placeholderCtx = useMemo(
    () => buildCustomerInboxPlaceholderContext(selected, sellerNames || {}),
    [selected, sellerNames],
  );
  const replyPlainTrim = useMemo(() => htmlToPlainText(reply).trim(), [reply]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 320);
    return () => clearTimeout(t);
  }, [searchQ]);

  const unreadCount = (thread) =>
    thread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_seller).length;

  const sortedThreads = useMemo(() => {
    let arr = sortFilter === "unread_only"
      ? threads.filter((t) => unreadCount(t) > 0)
      : [...threads];
    if (sortFilter === "unread_first") {
      arr.sort((a, b) => {
        const au = unreadCount(a) > 0 ? 1 : 0;
        const bu = unreadCount(b) > 0 ? 1 : 0;
        if (bu !== au) return bu - au;
        const aL = a.messages[a.messages.length - 1]?.created_at || "";
        const bL = b.messages[b.messages.length - 1]?.created_at || "";
        return bL.localeCompare(aL);
      });
    } else if (sortFilter === "newest" || sortFilter === "unread_only") {
      arr.sort((a, b) => {
        const aL = a.messages[a.messages.length - 1]?.created_at || "";
        const bL = b.messages[b.messages.length - 1]?.created_at || "";
        return bL.localeCompare(aL);
      });
    } else if (sortFilter === "oldest") {
      arr.sort((a, b) => {
        const aL = a.messages[a.messages.length - 1]?.created_at || "";
        const bL = b.messages[b.messages.length - 1]?.created_at || "";
        return aL.localeCompare(bL);
      });
    }
    return arr;
  }, [threads, sortFilter]);

  const partitioned = useMemo(() => {
    if (!isSuperuser) return null;
    return partitionSuperuserCustomerThreads(sortedThreads, sellerNames || {});
  }, [sortedThreads, isSuperuser, sellerNames]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = debouncedQ ? { q: debouncedQ } : {};
      const data = await client.getMessages(params);
      if (!data?.__error) setThreads(groupByOrder(data?.messages || []));
    } finally {
      setLoading(false);
    }
  }, [client, debouncedQ]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selected?.messages?.length]);

  const handleSelectThread = async (thread) => {
    setSelected(thread);
    setReply("");
    setErr("");
    setOrderItems([]);
    if (thread.order_id) {
      try {
        const data = await client.request(`/admin-hub/orders/${thread.order_id}`);
        if (data?.order?.items) setOrderItems(data.order.items);
      } catch (_) {}
    }
    const toMark = thread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_seller);
    if (toMark.length) {
      await Promise.all(toMark.map((m) => client.markMessageRead(m.id).catch(() => {})));
      const threadKey = thread.order_id || "__no_order__";
      setThreads((prev) => prev.map((t) => {
        if ((t.order_id || "__no_order__") !== threadKey) return t;
        return { ...t, messages: t.messages.map((m) => m.sender_type === "customer" && !m.is_read_by_seller ? { ...m, is_read_by_seller: true } : m) };
      }));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-msg-unread-refresh"));
      }
    }
  };

  const handleSend = async () => {
    const html = replyEditorRef.current?.flushEmailBody?.() ?? reply;
    const bodyOut = applyMessagePlaceholders(String(html || "").trim(), placeholderCtx);
    if (!htmlToPlainText(bodyOut).trim() || !selected) return;
    setSending(true);
    setErr("");
    try {
      await client.sendMessage({
        order_id: selected.order_id || undefined,
        product_id: selected.product_id || undefined,
        body: bodyOut,
        subject: selected.order_number ? `Re: ${locale === "en" ? "Order" : locale === "tr" ? "Sipariş" : locale === "fr" ? "Commande" : locale === "es" ? "Pedido" : locale === "it" ? "Ordine" : "Bestellung"} #${selected.order_number}` : ui.message,
        locale,
      });
      setReply("");
      const data = await client.getMessages(debouncedQ ? { q: debouncedQ } : {});
      if (!data?.__error) {
        const updated = groupByOrder(data?.messages || []);
        setThreads(updated);
        const key = selected.order_id || "__no_order__";
        const updatedThread = updated.find((t) => (t.order_id || "__no_order__") === key);
        if (updatedThread) setSelected(updatedThread);
      }
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Error sending" : locale === "tr" ? "Gönderme hatası" : locale === "fr" ? "Erreur d'envoi" : locale === "es" ? "Error al enviar" : locale === "it" ? "Errore di invio" : "Fehler beim Senden"));
    }
    setSending(false);
  };

  const templateOptions = useMemo(
    () => [
      { label: locale === "en" ? "Choose template…" : locale === "tr" ? "Şablon seç…" : locale === "fr" ? "Choisir un modèle…" : locale === "es" ? "Elegir plantilla…" : locale === "it" ? "Scegli modello…" : "Vorlage wählen…", value: "" },
      ...templates.map((t) => ({ label: t.name || `${locale === "en" ? "Template" : locale === "tr" ? "Şablon" : locale === "fr" ? "Modèle" : locale === "es" ? "Plantilla" : locale === "it" ? "Modello" : "Vorlage"} #${t.id}`, value: String(t.id) })),
    ],
    [templates, locale],
  );

  const applySelectedTemplate = () => {
    if (!selectedTemplateId) return;
    const t = templates.find((it) => String(it.id) === String(selectedTemplateId));
    if (!t?.body) return;
    setReply(applyMessagePlaceholders(t.body, placeholderCtx));
  };

  const saveCurrentReplyAsTemplate = async () => {
    const name = templateName.trim();
    const body = String(replyEditorRef.current?.flushEmailBody?.() ?? reply).trim();
    if (!name || !body) {
      setErr(locale === "en" ? "Template name and message are required" : locale === "tr" ? "Şablon adı ve mesaj gereklidir" : locale === "fr" ? "Le nom du modèle et le message sont requis" : locale === "es" ? "El nombre de plantilla y el mensaje son obligatorios" : locale === "it" ? "Nome del modello e messaggio sono obbligatori" : "Vorlagenname und Nachricht sind erforderlich");
      return;
    }
    setTemplateSaving(true);
    setErr("");
    try {
      await client.createMessageTemplate({ name, body });
      setTemplateName("");
      await loadTemplates();
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Template could not be saved" : locale === "tr" ? "Şablon kaydedilemedi" : locale === "fr" ? "Le modèle n'a pas pu être sauvegardé" : locale === "es" ? "La plantilla no pudo guardarse" : locale === "it" ? "Il modello non ha potuto essere salvato" : "Vorlage konnte nicht gespeichert werden"));
    } finally {
      setTemplateSaving(false);
    }
  };

  const renderThreadRow = (thread, keySuffix = "") => {
    const last = thread.messages[thread.messages.length - 1];
    const unread = unreadCount(thread);
    const isActive = selected && (selected.order_id || "__no_order__") === (thread.order_id || "__no_order__");
    const customerName = [thread.order_first_name, thread.order_last_name].filter(Boolean).join(" ") || thread.order_email || (locale === "en" ? "Customer" : locale === "tr" ? "Müşteri" : locale === "fr" ? "Client" : locale === "es" ? "Cliente" : locale === "it" ? "Cliente" : "Kunde");
    const custNo = thread.customer_number != null ? ` · ${locale === "en" ? "Cust.No." : locale === "tr" ? "Müş.No." : locale === "fr" ? "N° client" : locale === "es" ? "N° cliente" : locale === "it" ? "N° cliente" : "Kd.Nr."} ${thread.customer_number}` : "";
    return (
      <div key={`${thread.order_id || "__no_order__"}${keySuffix}`} style={{ borderBottom: "1px solid #e1e3e5" }}>
        <button
          type="button"
          onClick={() => handleSelectThread(thread)}
          style={{
            width: "100%", textAlign: "left", padding: "10px 14px",
            background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : unread > 0 ? "#eff6ff" : "transparent",
            borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : unread > 0 ? "3px solid #3b82f6" : "3px solid transparent",
            borderTop: "none", borderRight: "none", borderBottom: "none",
            cursor: "pointer", display: "block",
          }}
        >
          <InlineStack align="space-between" blockAlign="start" gap="100">
            <Text as="span" variant="bodySm" fontWeight="bold">{customerName}</Text>
            <InlineStack gap="100" blockAlign="center">
              {unread > 0 && (
                <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {unread}
                </span>
              )}
              <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at, locale)}</Text>
            </InlineStack>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {thread.order_number ? `${locale === "en" ? "Order" : locale === "tr" ? "Sipariş" : locale === "fr" ? "Commande" : locale === "es" ? "Pedido" : locale === "it" ? "Ordine" : "Bestellung"} #${thread.order_number}` : (locale === "en" ? "General" : locale === "tr" ? "Genel" : locale === "fr" ? "Général" : locale === "es" ? "General" : locale === "it" ? "Generale" : "Allgemein")}
            {custNo}
          </Text>
          <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {last?.body?.slice(0, 55) || "—"}
          </div>
        </button>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 260px", gap: 12, height: "calc(100vh - 220px)", minHeight: 500 }}>
      {/* Thread list */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{locale === "en" ? "Conversations" : locale === "tr" ? "Konuşmalar" : locale === "fr" ? "Conversations" : locale === "es" ? "Conversaciones" : locale === "it" ? "Conversazioni" : "Konversationen"}</Text>
            <TextField
              label={ui.search}
              labelHidden
              placeholder={locale === "en" ? "Order no., customer no., name, email…" : locale === "tr" ? "Sipariş no., müşteri no., ad, e-posta…" : locale === "fr" ? "N° commande, n° client, nom, e-mail…" : locale === "es" ? "N° pedido, n° cliente, nombre, email…" : locale === "it" ? "N° ordine, n° cliente, nome, email…" : "Bestellnr., Kundennr., Name, E-Mail…"}
              value={searchQ}
              onChange={setSearchQ}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearchQ("")}
            />
            <Select
              label={locale === "en" ? "Sort" : locale === "tr" ? "Sıralama" : locale === "fr" ? "Tri" : locale === "es" ? "Orden" : locale === "it" ? "Ordina" : "Sortierung"}
              labelHidden
              options={[
                { label: locale === "en" ? "Unread first" : locale === "tr" ? "Okunmayanlar önce" : locale === "fr" ? "Non lus en premier" : locale === "es" ? "No leídos primero" : locale === "it" ? "Non letti prima" : "Ungelesen zuerst", value: "unread_first" },
                { label: locale === "en" ? "Newest first" : locale === "tr" ? "En yeni önce" : locale === "fr" ? "Plus récents en premier" : locale === "es" ? "Más recientes primero" : locale === "it" ? "Più recenti prima" : "Neueste zuerst", value: "newest" },
                { label: locale === "en" ? "Oldest first" : locale === "tr" ? "En eski önce" : locale === "fr" ? "Plus anciens en premier" : locale === "es" ? "Más antiguos primero" : locale === "it" ? "Più vecchi prima" : "Älteste zuerst", value: "oldest" },
                { label: locale === "en" ? "Unread only" : locale === "tr" ? "Sadece okunmayanlar" : locale === "fr" ? "Non lus seulement" : locale === "es" ? "Solo no leídos" : locale === "it" ? "Solo non letti" : "Nur ungelesen", value: "unread_only" },
              ]}
              value={sortFilter}
              onChange={setSortFilter}
            />
            {isSuperuser && (
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "en" ? "Top: Platform / no seller · Bottom: Customer contacts per seller" : locale === "tr" ? "Üst: Platform / satıcı yok · Alt: Satıcı başına müşteri iletişimleri" : locale === "fr" ? "Haut: Plateforme / sans vendeur · Bas: Contacts clients par vendeur" : locale === "es" ? "Arriba: Plataforma / sin vendedor · Abajo: Contactos de clientes por vendedor" : locale === "it" ? "In alto: Piattaforma / senza venditore · In basso: Contatti clienti per venditore" : "Oben: Plattform / ohne Verkäufer · Unten: Kundenkontakte pro Verkäufer"}
              </Text>
            )}
          </BlockStack>
        </Box>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
          {!loading && threads.length === 0 && (
            <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">{locale === "en" ? "No messages" : locale === "tr" ? "Mesaj yok" : locale === "fr" ? "Aucun message" : locale === "es" ? "Sin mensajes" : locale === "it" ? "Nessun messaggio" : "Keine Nachrichten"}</Text></Box>
          )}
          {!loading && !isSuperuser && sortedThreads.map((thread) => renderThreadRow(thread))}
          {!loading && isSuperuser && partitioned && (
            <>
              {partitioned.platformThreads.length > 0 && (
                <>
                  <Box paddingInline="300" paddingBlockStart="200" paddingBlockEnd="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{locale === "en" ? "Platform / general" : locale === "tr" ? "Platform / genel" : locale === "fr" ? "Plateforme / général" : locale === "es" ? "Plataforma / general" : locale === "it" ? "Piattaforma / generale" : "Plattform / allgemein"}</Text>
                  </Box>
                  {partitioned.platformThreads.map((thread) => renderThreadRow(thread, "-pf"))}
                </>
              )}
              {partitioned.sellerGroups.map((grp) => (
                <div key={grp.sellerId}>
                  <div style={{ padding: "12px 14px", background: "var(--p-color-bg-surface-secondary, #f3f4f6)", borderBottom: "1px solid var(--p-color-border)" }}>
                    <Text as="p" variant="bodySm" fontWeight="bold">
                      {locale === "en" ? "Seller" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Verkäufer"}: {grp.label}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {grp.sellerId}
                    </Text>
                  </div>
                  {grp.threads.map((thread) => renderThreadRow(thread, `-${grp.sellerId}`))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "Select a conversation" : locale === "tr" ? "Bir konuşma seçin" : locale === "fr" ? "Sélectionner une conversation" : locale === "es" ? "Seleccionar una conversación" : locale === "it" ? "Seleziona una conversazione" : "Konversation auswählen"}</Text>
          </div>
        ) : (
          <>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {selected.order_number ? `${locale === "en" ? "Order" : locale === "tr" ? "Sipariş" : locale === "fr" ? "Commande" : locale === "es" ? "Pedido" : locale === "it" ? "Ordine" : "Bestellung"} #${selected.order_number}` : (locale === "en" ? "General" : locale === "tr" ? "Genel" : locale === "fr" ? "Général" : locale === "es" ? "General" : locale === "it" ? "Generale" : "Allgemein")}
                </Text>
                {selected.order_status && (
                  <Badge tone={STATUS_TONE[selected.order_status] || "new"}>
                    {getStatusLabel(selected.order_status, locale) || selected.order_status}
                  </Badge>
                )}
                {selected.order_id && (
                  <Button variant="plain" size="slim" url={`/orders/${selected.order_id}`}>{locale === "en" ? "Open →" : locale === "tr" ? "Aç →" : locale === "fr" ? "Ouvrir →" : locale === "es" ? "Abrir →" : locale === "it" ? "Apri →" : "Öffnen →"}</Button>
                )}
              </InlineStack>
            </Box>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {selected.messages.map((m) => {
                const isSeller = m.sender_type === "seller";
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: isSeller ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "72%",
                      background: isSeller ? "var(--p-color-bg-fill-brand, #ff971c)" : "var(--p-color-bg-surface-secondary)",
                      color: isSeller ? "#fff" : "var(--p-color-text)",
                      borderRadius: isSeller ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      padding: "9px 13px",
                      border: isSeller ? "none" : "1px solid var(--p-color-border-subdued)",
                    }}>
                      {!isSeller && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-color-text-subdued)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>
                          {locale === "en" ? "Customer" : locale === "tr" ? "Müşteri" : locale === "fr" ? "Client" : locale === "es" ? "Cliente" : locale === "it" ? "Cliente" : "Kunde"}
                        </div>
                      )}
                      <MessageBubbleBody body={m.body} />
                      <div style={{ fontSize: 10, marginTop: 4, opacity: isSeller ? 0.85 : 0.65 }}>{fmtDate(m.created_at, locale)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {!readOnly && <Box padding="300" borderBlockStartWidth="025" borderColor="border">
              <BlockStack gap="200">
                {err && <Text as="p" variant="bodySm" tone="critical">{err}</Text>}
                {templatesErr && <Text as="p" variant="bodySm" tone="critical">{templatesErr}</Text>}
                <InlineStack gap="200" blockAlign="end" wrap>
                  <div style={{ minWidth: 200, flex: "1 1 180px" }}>
                    <Select
                      label={locale === "en" ? "Placeholder" : locale === "tr" ? "Yer tutucu" : locale === "fr" ? "Variable" : locale === "es" ? "Variable" : locale === "it" ? "Variabile" : "Platzhalter"}
                      labelHidden
                      options={MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS}
                      value={placeholderInsert}
                      onChange={(v) => {
                        setPlaceholderInsert("");
                        if (!v) return;
                        setReply((prev) => `${prev || ""}${prev && !/\s$/.test(prev) ? " " : ""}${v}`);
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 220, flex: "1 1 200px" }}>
                    <Select
                      label={locale === "en" ? "Reply template" : locale === "tr" ? "Yanıt şablonu" : locale === "fr" ? "Modèle de réponse" : locale === "es" ? "Plantilla de respuesta" : locale === "it" ? "Modello di risposta" : "Antwortvorlage"}
                      labelHidden
                      options={templateOptions}
                      value={selectedTemplateId}
                      onChange={setSelectedTemplateId}
                      disabled={templatesLoading}
                    />
                  </div>
                  <Button onClick={applySelectedTemplate} disabled={!selectedTemplateId}>
                    {locale === "en" ? "Apply template" : locale === "tr" ? "Şablonu uygula" : locale === "fr" ? "Appliquer le modèle" : locale === "es" ? "Aplicar plantilla" : locale === "it" ? "Applica modello" : "Vorlage anwenden"}
                  </Button>
                </InlineStack>
                <InlineStack gap="200" blockAlign="end" wrap>
                  <div style={{ minWidth: 240, flex: 1 }}>
                    <TextField
                      label={locale === "en" ? "Save as template" : locale === "tr" ? "Şablon olarak kaydet" : locale === "fr" ? "Enregistrer comme modèle" : locale === "es" ? "Guardar como plantilla" : locale === "it" ? "Salva come modello" : "Als Vorlage speichern"}
                      labelHidden
                      placeholder={locale === "en" ? "Template name…" : locale === "tr" ? "Şablon adı…" : locale === "fr" ? "Nom du modèle…" : locale === "es" ? "Nombre de plantilla…" : locale === "it" ? "Nome del modello…" : "Vorlagenname…"}
                      value={templateName}
                      onChange={setTemplateName}
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={saveCurrentReplyAsTemplate} loading={templateSaving} disabled={templateSaving || !replyPlainTrim || !templateName.trim()}>
                    {ui.save}
                  </Button>
                </InlineStack>
                <FlowEmailBodyEditor
                  ref={replyEditorRef}
                  key={`cust-${selected?.order_id || "__no_order__"}-${selected?.messages?.length ?? 0}`}
                  label={locale === "en" ? "Reply" : locale === "tr" ? "Yanıt" : locale === "fr" ? "Réponse" : locale === "es" ? "Respuesta" : locale === "it" ? "Risposta" : "Antwort"}
                  value={reply}
                  onChange={setReply}
                  minHeight="140px"
                  placeholder={locale === "en" ? "Reply (Visual, HTML or Text)…" : locale === "tr" ? "Yanıt (Görsel, HTML veya Metin)…" : locale === "fr" ? "Réponse (Visuel, HTML ou Texte)…" : locale === "es" ? "Respuesta (Visual, HTML o Texto)…" : locale === "it" ? "Risposta (Visuale, HTML o Testo)…" : "Antwort (Visuell, HTML oder Text)…"}
                  modes={{ visual: locale === "en" ? "Visual" : locale === "tr" ? "Görsel" : locale === "fr" ? "Visuel" : locale === "es" ? "Visual" : locale === "it" ? "Visuale" : "Visuell", html: "HTML", text: lt(locale, "Text", "Metin", "Text", "Text", "Text", "Text") }}
                />
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <Box minWidth="100%">
                    <Button variant="primary" onClick={handleSend} disabled={sending || !replyPlainTrim} loading={sending}>
                      {ui.send}
                    </Button>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Box>}
          </>
        )}
      </div>

      {/* Order detail sidebar */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{locale === "en" ? "Order details" : locale === "tr" ? "Sipariş detayları" : locale === "fr" ? "Détails de commande" : locale === "es" ? "Detalles del pedido" : locale === "it" ? "Dettagli ordine" : "Bestelldetails"}</Text>
        </Box>
        {!selected || !selected.order_id ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "Select an order" : locale === "tr" ? "Bir sipariş seçin" : locale === "fr" ? "Sélectionner une commande" : locale === "es" ? "Seleccionar un pedido" : locale === "it" ? "Seleziona un ordine" : "Bestellung auswählen"}</Text>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <Box padding="300">
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">{locale === "en" ? "Customer" : locale === "tr" ? "Müşteri" : locale === "fr" ? "Client" : locale === "es" ? "Cliente" : locale === "it" ? "Cliente" : "Kunde"}</Text>
                  <Text as="p" variant="bodySm">
                    {[selected.order_first_name, selected.order_last_name].filter(Boolean).join(" ") || "—"}
                  </Text>
                  {selected.order_email && (
                    <Text as="p" variant="bodySm" tone="subdued">{selected.order_email}</Text>
                  )}
                  {selected.customer_number != null && (
                    <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "Cust.No." : locale === "tr" ? "Müş.No." : locale === "fr" ? "N° client" : locale === "es" ? "N° cliente" : locale === "it" ? "N° cliente" : "Kundennr."} {selected.customer_number}</Text>
                  )}
                  {isSuperuser && selected.order_seller_id && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {locale === "en" ? "Seller" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Verkäufer"}: {selected.seller_store_name || sellerNames?.[selected.order_seller_id] || selected.order_seller_id}
                    </Text>
                  )}
                </BlockStack>
                <Divider />
                <InlineStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">{ui.status}</Text>
                    <Badge tone={STATUS_TONE[selected.order_status] || "new"}>
                      {getStatusLabel(selected.order_status, locale) || selected.order_status || "—"}
                    </Badge>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">{ui.colTotal}</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">{fmtCents(selected.order_total_cents)}</Text>
                  </BlockStack>
                </InlineStack>
                {orderItems.length > 0 && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{locale === "en" ? "Items" : locale === "tr" ? "Ürünler" : locale === "fr" ? "Articles" : locale === "es" ? "Artículos" : locale === "it" ? "Articoli" : "Artikel"}</Text>
                      {orderItems.map((item, i) => (
                        <InlineStack key={item.id || i} gap="200" blockAlign="center" wrap={false}>
                          <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid var(--p-color-border)", overflow: "hidden", flexShrink: 0, background: "var(--p-color-bg-surface-secondary)" }}>
                            {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                          </div>
                          <BlockStack gap="0">
                            <Text as="p" variant="bodySm" fontWeight="medium" truncate>{item.title || "—"}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{item.quantity}× {fmtCents(item.unit_price_cents)}</Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </>
                )}
                <Button variant="primary" url={`/orders/${selected.order_id}`} fullWidth>
                  {locale === "en" ? "Open order →" : locale === "tr" ? "Siparişi aç →" : locale === "fr" ? "Ouvrir la commande →" : locale === "es" ? "Abrir pedido →" : locale === "it" ? "Apri ordine →" : "Bestellung öffnen →"}
                </Button>
              </BlockStack>
            </Box>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Support / Sellers tab ───────────────────────────────────────────────────
// Superusers: sellers (left) → subjects per seller (middle) → messages (right)
// Regular sellers: subjects (left, by Betreff) → messages (right), like Kunden/orders

function unreadTotalForSellerSupportThread(sellerThread, isSuperuser) {
  return groupBySupportSubject(sellerThread.messages).reduce((n, st) => {
    if (isSuperuser) {
      return n + st.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_support).length;
    }
    return n + st.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_seller).length;
  }, 0);
}

function SupportInbox({ client, isSuperuser, mySellerID, sellerNames, sellerUserIds, readOnly = false }) {
  const locale = useLocale();
  const ui = getUI(locale);
  const [rawMessages, setRawMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supportSearchQ, setSupportSearchQ] = useState("");
  const [supportDebouncedQ, setSupportDebouncedQ] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  /** `null` = none; `""` = legacy / no subject */
  const [selectedSubjectKey, setSelectedSubjectKey] = useState(null);
  const [isNewSubject, setIsNewSubject] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [placeholderInsert, setPlaceholderInsert] = useState("");
  const bottomRef = useRef(null);
  const replyEditorRef = useRef(null);
  const { templates, templatesLoading, templatesErr, loadTemplates } = useMessageTemplates(client, locale);

  const sellerThreads = isSuperuser ? groupBySeller(rawMessages) : [];
  const selectedSellerThread = selectedSellerId
    ? sellerThreads.find((t) => t.seller_id === selectedSellerId) || null
    : null;

  const subjectThreadsForSeller = selectedSellerThread
    ? groupBySupportSubject(selectedSellerThread.messages)
    : [];

  const subjectThreadsRegular = !isSuperuser ? groupBySupportSubject(rawMessages) : [];

  const subjectList = isSuperuser ? subjectThreadsForSeller : subjectThreadsRegular;
  const selectedSubjectThread =
    selectedSubjectKey !== null
      ? subjectList.find((t) => t.subject_key === selectedSubjectKey) || null
      : null;

  const placeholderCtx = useMemo(
    () => buildSupportInboxPlaceholderContext(selectedSellerThread, sellerNames),
    [selectedSellerThread, sellerNames],
  );
  const replyPlainTrim = useMemo(() => htmlToPlainText(reply).trim(), [reply]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = supportDebouncedQ ? { q: supportDebouncedQ } : {};
      const data = await client.getSupportMessages(params);
      if (!data?.__error) setRawMessages(data?.messages || []);
    } finally {
      setLoading(false);
    }
  }, [client, supportDebouncedQ]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [selectedSubjectThread?.messages?.length, isNewSubject, reply]);

  const unreadForSubjectThread = (subThread) => {
    if (isSuperuser) {
      return subThread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_support).length;
    }
    return subThread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_seller).length;
  };

  const unreadForSellerThread = (sellerThread) =>
    unreadTotalForSellerSupportThread(sellerThread, isSuperuser);

  const getSellerLabel = (seller_id) => {
    if (!seller_id) return locale === "en" ? "Unknown" : locale === "tr" ? "Bilinmiyor" : locale === "fr" ? "Inconnu" : locale === "es" ? "Desconocido" : locale === "it" ? "Sconosciuto" : "Unbekannt";
    const key = String(seller_id);
    const fallback = key.length > 18 ? `${key.slice(0, 18)}…` : key;
    return sellerNames[key] || sellerNames[seller_id] || fallback;
  };

  const getSellerProfileHref = (seller_id) => {
    if (!seller_id) return null;
    const key = String(seller_id);
    const userId = sellerUserIds[key] || sellerUserIds[seller_id];
    return userId ? `/sellers/${userId}` : null;
  };

  const handleSelectSeller = (thread) => {
    setSelectedSellerId(thread.seller_id);
    setSelectedSubjectKey(null);
    setIsNewSubject(false);
    setNewSubject("");
    setReply("");
    setErr("");
  };

  const handleSelectSubject = (subThread) => {
    setSelectedSubjectKey(subThread.subject_key);
    setIsNewSubject(false);
    setNewSubject("");
    setReply("");
    setErr("");
    const threadIds = new Set(subThread.messages.map((m) => m.id));
    if (isSuperuser && selectedSellerId) {
      const marked = subThread.messages.filter((m) => m.sender_type === "customer" && !m.is_read_by_support);
      Promise.resolve(
        client.markSupportMessagesRead(selectedSellerId, "support", subThread.subject_key),
      ).then(() => {
        if (typeof window !== "undefined" && marked.length) {
          window.dispatchEvent(new Event("andertal-msg-unread-refresh"));
        }
      }).catch(() => {});
      setRawMessages((prev) => prev.map((m) => {
        if (!threadIds.has(m.id)) return m;
        if (m.sender_type === "customer") return { ...m, is_read_by_support: true };
        return m;
      }));
    } else if (!isSuperuser) {
      const toMark = subThread.messages.filter((m) => m.sender_type === "seller" && !m.is_read_by_seller);
      Promise.all(toMark.map((m) => client.markMessageRead(m.id).catch(() => {}))).then(() => {
        if (typeof window !== "undefined" && toMark.length) {
          window.dispatchEvent(new Event("andertal-msg-unread-refresh"));
        }
      });
      setRawMessages((prev) => prev.map((m) => {
        if (!threadIds.has(m.id)) return m;
        if (m.sender_type === "seller") return { ...m, is_read_by_seller: true };
        return m;
      }));
    }
  };

  const startNewSubject = () => {
    setSelectedSubjectKey(null);
    setIsNewSubject(true);
    setNewSubject("");
    setReply("");
    setErr("");
  };

  const headerTitle = () => {
    const newTopicLabel = locale === "en" ? "New topic" : locale === "tr" ? "Yeni konu" : locale === "fr" ? "Nouveau sujet" : locale === "es" ? "Nuevo tema" : locale === "it" ? "Nuovo argomento" : "Neues Thema";
    if (isSuperuser) {
      if (!selectedSellerThread) return "Support";
      if (isNewSubject) return `${newTopicLabel} · ${getSellerLabel(selectedSellerThread.seller_id)}`;
      if (selectedSubjectThread) {
        return `${supportSubjectTitle(selectedSubjectThread.subject_key, locale)} · ${getSellerLabel(selectedSellerThread.seller_id)}`;
      }
      return getSellerLabel(selectedSellerThread.seller_id);
    }
    if (isNewSubject) return newTopicLabel;
    if (selectedSubjectThread) return supportSubjectTitle(selectedSubjectThread.subject_key, locale);
    return "Support Team";
  };

  const canSend = () => {
    if (!replyPlainTrim) return false;
    if (isSuperuser && !selectedSellerThread) return false;
    if (isNewSubject) return !!newSubject.trim();
    if (!selectedSubjectThread) return false;
    return true;
  };

  const templateOptions = useMemo(
    () => [
      { label: locale === "en" ? "Choose template…" : locale === "tr" ? "Şablon seç…" : locale === "fr" ? "Choisir un modèle…" : locale === "es" ? "Elegir plantilla…" : locale === "it" ? "Scegli modello…" : "Vorlage wählen…", value: "" },
      ...templates.map((t) => ({ label: t.name || `${locale === "en" ? "Template" : locale === "tr" ? "Şablon" : locale === "fr" ? "Modèle" : locale === "es" ? "Plantilla" : locale === "it" ? "Modello" : "Vorlage"} #${t.id}`, value: String(t.id) })),
    ],
    [templates, locale],
  );

  const applySelectedTemplate = () => {
    if (!selectedTemplateId) return;
    const t = templates.find((it) => String(it.id) === String(selectedTemplateId));
    if (!t?.body) return;
    setReply(applyMessagePlaceholders(t.body, placeholderCtx));
  };

  const saveCurrentReplyAsTemplate = async () => {
    const name = templateName.trim();
    const body = String(replyEditorRef.current?.flushEmailBody?.() ?? reply).trim();
    if (!name || !body) {
      setErr(locale === "en" ? "Template name and message are required" : locale === "tr" ? "Şablon adı ve mesaj gereklidir" : locale === "fr" ? "Le nom du modèle et le message sont requis" : locale === "es" ? "El nombre de plantilla y el mensaje son obligatorios" : locale === "it" ? "Nome del modello e messaggio sono obbligatori" : "Vorlagenname und Nachricht sind erforderlich");
      return;
    }
    setTemplateSaving(true);
    setErr("");
    try {
      await client.createMessageTemplate({ name, body });
      setTemplateName("");
      await loadTemplates();
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Template could not be saved" : locale === "tr" ? "Şablon kaydedilemedi" : locale === "fr" ? "Le modèle n'a pas pu être sauvegardé" : locale === "es" ? "La plantilla no pudo guardarse" : locale === "it" ? "Il modello non ha potuto essere salvato" : "Vorlage konnte nicht gespeichert werden"));
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSend = async () => {
    if (!canSend()) return;
    const html = replyEditorRef.current?.flushEmailBody?.() ?? reply;
    const bodyOut = applyMessagePlaceholders(String(html || "").trim(), placeholderCtx);
    if (!htmlToPlainText(bodyOut).trim()) return;
    setSending(true);
    setErr("");
    try {
      const subjectForApi = isNewSubject
        ? newSubject.trim()
        : (() => {
          const t = selectedSubjectThread;
          if (!t) return null;
          if (t.reply_subject) return t.reply_subject;
          return t.subject_key !== "" ? t.subject_key : null;
        })();

      if (isSuperuser) {
        await client.sendSupportMessage({
          body: bodyOut,
          target_seller_id: selectedSellerThread.seller_id,
          sender_seller_id: null,
          subject: subjectForApi || undefined,
          locale,
        });
      } else {
        await client.sendSupportMessage({
          body: bodyOut,
          sender_seller_id: mySellerID,
          subject: subjectForApi || undefined,
          locale,
        });
      }
      setReply("");
      if (isNewSubject) {
        setNewSubject("");
        setIsNewSubject(false);
      }
      const data = await client.getSupportMessages(supportDebouncedQ ? { q: supportDebouncedQ } : {});
      if (!data?.__error) {
        const msgs = data?.messages || [];
        setRawMessages(msgs);
        const sk = normalizeSupportSubjectKey(subjectForApi);
        setSelectedSubjectKey(sk);
      }
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Error sending" : locale === "tr" ? "Gönderme hatası" : locale === "fr" ? "Erreur d'envoi" : locale === "es" ? "Error al enviar" : locale === "it" ? "Errore di invio" : "Fehler beim Senden"));
    }
    setSending(false);
  };

  const activeMessages = selectedSubjectThread?.messages || [];
  const showComposer =
    isSuperuser
      ? !!selectedSellerThread && (isNewSubject || !!selectedSubjectThread)
      : isNewSubject || !!selectedSubjectThread;

  const gridCols = isSuperuser ? "280px 260px 1fr" : "280px 1fr";

  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, height: "calc(100vh - 220px)", minHeight: 500 }}>

      {isSuperuser && (
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
          <Box padding="300" borderBlockEndWidth="025" borderColor="border">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : locale === "fr" ? "Vendeurs" : locale === "es" ? "Vendedores" : locale === "it" ? "Venditori" : "Verkäufer"}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "en" ? "Top: unread messages to you (Support). Store name and ID per row." : locale === "tr" ? "Üst: size gelen okunmamış mesajlar (Destek). Mağaza adı ve kimliği." : locale === "fr" ? "Haut: messages non lus pour vous (Support). Nom du magasin et ID par ligne." : locale === "es" ? "Arriba: mensajes no leídos para usted (Soporte). Nombre de tienda e ID por fila." : locale === "it" ? "In alto: messaggi non letti per voi (Supporto). Nome negozio e ID per riga." : "Oben: ungelesene Nachrichten an Sie (Support). Store-Name und ID pro Zeile."}
              </Text>
              <TextField
                label={locale === "en" ? "Search support" : locale === "tr" ? "Destek ara" : locale === "fr" ? "Rechercher support" : locale === "es" ? "Buscar soporte" : locale === "it" ? "Cerca supporto" : "Suche Support"}
                labelHidden
                placeholder={locale === "en" ? "Seller, subject, message…" : locale === "tr" ? "Satıcı, konu, mesaj…" : locale === "fr" ? "Vendeur, sujet, message…" : locale === "es" ? "Vendedor, asunto, mensaje…" : locale === "it" ? "Venditore, oggetto, messaggio…" : "Verkäufer, Betreff, Nachricht…"}
                value={supportSearchQ}
                onChange={setSupportSearchQ}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSupportSearchQ("")}
              />
            </BlockStack>
          </Box>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
            {!loading && sellerThreads.length === 0 && (
              <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">{locale === "en" ? "No messages" : locale === "tr" ? "Mesaj yok" : locale === "fr" ? "Aucun message" : locale === "es" ? "Sin mensajes" : locale === "it" ? "Nessun messaggio" : "Keine Nachrichten"}</Text></Box>
            )}
            {sellerThreads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = unreadForSellerThread(thread);
              const isActive = selectedSellerThread?.seller_id === thread.seller_id;
              const rowStore =
                thread.messages.find((m) => m.seller_store_name && String(m.seller_store_name).trim())?.seller_store_name || null;
              const title = (rowStore && String(rowStore).trim()) || getSellerLabel(thread.seller_id);
              return (
                <div key={thread.seller_id || "__unknown__"} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <button
                    type="button"
                    onClick={() => handleSelectSeller(thread)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : "transparent",
                      borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : (unread > 0 ? "3px solid #f59e0b" : "3px solid transparent"),
                      borderTop: "none", borderRight: "none", borderBottom: "none",
                      cursor: "pointer", display: "block",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="start" gap="100">
                      <BlockStack gap="050">
                        <Text as="span" variant="bodySm" fontWeight="bold">{title}</Text>
                        <Text as="span" variant="bodySm" tone="subdued">{thread.seller_id || "—"}</Text>
                      </BlockStack>
                      <InlineStack gap="100" blockAlign="center">
                        {unread > 0 && (
                          <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: "0 4px" }}>
                            {unread}
                          </span>
                        )}
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at, locale)}</Text>
                      </InlineStack>
                    </InlineStack>
                    <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {last?.body?.slice(0, 55) || "—"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subject column: superuser (per seller) or regular seller */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        <Box padding="300" borderBlockEndWidth="025" borderColor="border">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{locale === "en" ? "Topics" : locale === "tr" ? "Konular" : locale === "fr" ? "Sujets" : locale === "es" ? "Temas" : locale === "it" ? "Argomenti" : "Themen"}</Text>
              {!readOnly && (!isSuperuser || selectedSellerThread) && (
                <Button variant="plain" size="slim" onClick={startNewSubject} disabled={isSuperuser && !selectedSellerThread}>
                  + {locale === "en" ? "New" : locale === "tr" ? "Yeni" : locale === "fr" ? "Nouveau" : locale === "es" ? "Nuevo" : locale === "it" ? "Nuovo" : "Neu"}
                </Button>
              )}
            </InlineStack>
            {!isSuperuser && (
              <TextField
                label={ui.search}
                labelHidden
                placeholder={locale === "en" ? "Subject, message…" : locale === "tr" ? "Konu, mesaj…" : locale === "fr" ? "Sujet, message…" : locale === "es" ? "Asunto, mensaje…" : locale === "it" ? "Oggetto, messaggio…" : "Betreff, Nachricht…"}
                value={supportSearchQ}
                onChange={setSupportSearchQ}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSupportSearchQ("")}
              />
            )}
          </BlockStack>
        </Box>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSuperuser && !selectedSellerThread && (
            <Box padding="400"><Text as="p" variant="bodySm" tone="subdued" alignment="center">{locale === "en" ? "Select a seller" : locale === "tr" ? "Bir satıcı seçin" : locale === "fr" ? "Sélectionner un vendeur" : locale === "es" ? "Seleccionar un vendedor" : locale === "it" ? "Seleziona un venditore" : "Verkäufer wählen"}</Text></Box>
          )}
          {(isSuperuser ? !!selectedSellerThread : true) && loading && (
            <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
          )}
          {((isSuperuser && selectedSellerThread) || !isSuperuser) && !loading && subjectList.length === 0 && !isNewSubject && (
            <Box padding="400">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">{locale === "en" ? "No conversations yet" : locale === "tr" ? "Henüz konuşma yok" : locale === "fr" ? "Aucune conversation encore" : locale === "es" ? "Sin conversaciones aún" : locale === "it" ? "Nessuna conversazione ancora" : "Noch keine Konversationen"}</Text>
            </Box>
          )}
          {subjectList.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            const unread = unreadForSubjectThread(thread);
            const isActive = !isNewSubject && selectedSubjectKey !== null && selectedSubjectKey === thread.subject_key;
            return (
              <div key={`${isSuperuser ? selectedSellerThread?.seller_id : "me"}-${thread.subject_key || "__"}`} style={{ borderBottom: "1px solid #e1e3e5" }}>
                <button
                  type="button"
                  onClick={() => handleSelectSubject(thread)}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    background: isActive ? "var(--p-color-bg-surface-selected, #fff7ed)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--p-color-bg-fill-brand, #ff971c)" : "3px solid transparent",
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    cursor: "pointer", display: "block",
                  }}
                >
                  <InlineStack align="space-between" blockAlign="start" gap="100">
                    <Text as="span" variant="bodySm" fontWeight="bold">{supportSubjectTitle(thread.subject_key, locale)}</Text>
                    <InlineStack gap="100" blockAlign="center">
                      {unread > 0 && (
                        <span style={{ background: "var(--p-color-bg-fill-critical)", color: "#fff", borderRadius: "50%", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: "0 4px" }}>
                          {unread}
                        </span>
                      )}
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(last?.created_at, locale)}</Text>
                    </InlineStack>
                  </InlineStack>
                  <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {last?.body?.slice(0, 48) || "—"}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: "var(--p-color-bg-surface)" }}>
        {!showComposer ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" variant="bodySm" tone="subdued">
              {isSuperuser && !selectedSellerThread
                ? (locale === "en" ? "Select a seller" : locale === "tr" ? "Bir satıcı seçin" : locale === "fr" ? "Sélectionner un vendeur" : locale === "es" ? "Seleccionar un vendedor" : locale === "it" ? "Seleziona un venditore" : "Verkäufer auswählen")
                : (locale === "en" ? 'Select a topic or click "New"' : locale === "tr" ? 'Bir konu seçin veya "Yeni"ye tıklayın' : locale === "fr" ? 'Sélectionner un sujet ou cliquer sur "Nouveau"' : locale === "es" ? 'Seleccionar un tema o hacer clic en "Nuevo"' : locale === "it" ? 'Seleziona un argomento o clicca su "Nuovo"' : 'Thema auswählen oder "Neu"')}
            </Text>
          </div>
        ) : (
          <>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="p" variant="bodyMd" fontWeight="semibold">{headerTitle()}</Text>
                {isSuperuser && selectedSellerThread?.seller_id && getSellerProfileHref(selectedSellerThread.seller_id) && (
                  <Button variant="plain" size="slim" url={getSellerProfileHref(selectedSellerThread.seller_id)}>
                    {locale === "en" ? "Profile →" : locale === "tr" ? "Profil →" : locale === "fr" ? "Profil →" : locale === "es" ? "Perfil →" : locale === "it" ? "Profilo →" : "Profil →"}
                  </Button>
                )}
              </InlineStack>
            </Box>

            {loading && activeMessages.length === 0 && !isNewSubject ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Spinner size="small" />
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {isNewSubject && (
                  <Box paddingBlockEnd="200">
                    <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "First message with subject — the topic will then appear in the list." : locale === "tr" ? "Konuyla ilk mesaj — konu daha sonra listede görünecek." : locale === "fr" ? "Premier message avec sujet — le sujet apparaîtra ensuite dans la liste." : locale === "es" ? "Primer mensaje con asunto — el tema aparecerá en la lista." : locale === "it" ? "Primo messaggio con oggetto — l'argomento apparirà nella lista." : "Erste Nachricht mit Betreff — danach erscheint das Thema in der Liste."}</Text>
                  </Box>
                )}
                {activeMessages.length === 0 && !isNewSubject && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No messages in this topic yet." : locale === "tr" ? "Bu konuda henüz mesaj yok." : locale === "fr" ? "Aucun message dans ce sujet encore." : locale === "es" ? "Sin mensajes en este tema aún." : locale === "it" ? "Nessun messaggio in questo argomento ancora." : "Noch keine Nachrichten in diesem Thema."}</Text>
                  </div>
                )}
                {activeMessages.map((m) => {
                  const isMe = isSuperuser ? m.sender_type === "seller" : m.sender_type === "customer";
                  const senderLabel = isMe ? null : (isSuperuser ? (locale === "en" ? "Seller" : locale === "tr" ? "Satıcı" : locale === "fr" ? "Vendeur" : locale === "es" ? "Vendedor" : locale === "it" ? "Venditore" : "Verkäufer") : "Support Team");
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "72%",
                        background: isMe ? "var(--p-color-bg-fill-brand, #ff971c)" : "var(--p-color-bg-surface-secondary)",
                        color: isMe ? "#fff" : "var(--p-color-text)",
                        borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        padding: "9px 13px",
                        border: isMe ? "none" : "1px solid var(--p-color-border-subdued)",
                      }}>
                        {senderLabel && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-color-text-subdued)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>
                            {senderLabel}
                          </div>
                        )}
                        <MessageBubbleBody body={m.body} />
                        <div style={{ fontSize: 10, marginTop: 4, opacity: isMe ? 0.85 : 0.65 }}>{fmtDate(m.created_at, locale)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}

            {!readOnly && <Box padding="300" borderBlockStartWidth="025" borderColor="border">
              <BlockStack gap="200">
                {err && <Text as="p" variant="bodySm" tone="critical">{err}</Text>}
                {templatesErr && <Text as="p" variant="bodySm" tone="critical">{templatesErr}</Text>}
                {isNewSubject && (
                  <TextField label={locale === "en" ? "Subject" : locale === "tr" ? "Konu" : locale === "fr" ? "Sujet" : locale === "es" ? "Asunto" : locale === "it" ? "Oggetto" : "Betreff"} value={newSubject} onChange={setNewSubject} autoComplete="off" placeholder={locale === "en" ? "e.g. Question about payout" : locale === "tr" ? "örn. Ödeme hakkında soru" : locale === "fr" ? "p. ex. Question sur le paiement" : locale === "es" ? "p. ej. Pregunta sobre el pago" : locale === "it" ? "p. es. Domanda sul pagamento" : "z. B. Frage zu Auszahlung"} />
                )}
                <InlineStack gap="200" blockAlign="end" wrap>
                  <div style={{ minWidth: 200, flex: "1 1 180px" }}>
                    <Select
                      label={locale === "en" ? "Placeholder" : locale === "tr" ? "Yer tutucu" : locale === "fr" ? "Variable" : locale === "es" ? "Variable" : locale === "it" ? "Variabile" : "Platzhalter"}
                      labelHidden
                      options={MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS}
                      value={placeholderInsert}
                      onChange={(v) => {
                        setPlaceholderInsert("");
                        if (!v) return;
                        setReply((prev) => `${prev || ""}${prev && !/\s$/.test(prev) ? " " : ""}${v}`);
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 220, flex: "1 1 200px" }}>
                    <Select
                      label={locale === "en" ? "Reply template" : locale === "tr" ? "Yanıt şablonu" : locale === "fr" ? "Modèle de réponse" : locale === "es" ? "Plantilla de respuesta" : locale === "it" ? "Modello di risposta" : "Antwortvorlage"}
                      labelHidden
                      options={templateOptions}
                      value={selectedTemplateId}
                      onChange={setSelectedTemplateId}
                      disabled={templatesLoading}
                    />
                  </div>
                  <Button onClick={applySelectedTemplate} disabled={!selectedTemplateId}>
                    {locale === "en" ? "Apply template" : locale === "tr" ? "Şablonu uygula" : locale === "fr" ? "Appliquer le modèle" : locale === "es" ? "Aplicar plantilla" : locale === "it" ? "Applica modello" : "Vorlage anwenden"}
                  </Button>
                </InlineStack>
                <InlineStack gap="200" blockAlign="end" wrap>
                  <div style={{ minWidth: 240, flex: 1 }}>
                    <TextField
                      label={locale === "en" ? "Save as template" : locale === "tr" ? "Şablon olarak kaydet" : locale === "fr" ? "Enregistrer comme modèle" : locale === "es" ? "Guardar como plantilla" : locale === "it" ? "Salva come modello" : "Als Vorlage speichern"}
                      labelHidden
                      placeholder={locale === "en" ? "Template name…" : locale === "tr" ? "Şablon adı…" : locale === "fr" ? "Nom du modèle…" : locale === "es" ? "Nombre de plantilla…" : locale === "it" ? "Nome del modello…" : "Vorlagenname…"}
                      value={templateName}
                      onChange={setTemplateName}
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={saveCurrentReplyAsTemplate} loading={templateSaving} disabled={templateSaving || !replyPlainTrim || !templateName.trim()}>
                    {ui.save}
                  </Button>
                </InlineStack>
                <FlowEmailBodyEditor
                  ref={replyEditorRef}
                  key={`sup-${selectedSellerId || ""}-${String(selectedSubjectKey)}-${isNewSubject ? "new" : "t"}`}
                  label={ui.message}
                  value={reply}
                  onChange={setReply}
                  minHeight="140px"
                  placeholder={locale === "en" ? "Message (Visual, HTML or Text)…" : locale === "tr" ? "Mesaj (Görsel, HTML veya Metin)…" : locale === "fr" ? "Message (Visuel, HTML ou Texte)…" : locale === "es" ? "Mensaje (Visual, HTML o Texto)…" : locale === "it" ? "Messaggio (Visuale, HTML o Testo)…" : "Nachricht (Visuell, HTML oder Text)…"}
                  modes={{ visual: locale === "en" ? "Visual" : locale === "tr" ? "Görsel" : locale === "fr" ? "Visuel" : locale === "es" ? "Visual" : locale === "it" ? "Visuale" : "Visuell", html: "HTML", text: lt(locale, "Text", "Metin", "Text", "Text", "Text", "Text") }}
                />
                <InlineStack gap="200" blockAlign="center">
                  <Button variant="primary" onClick={handleSend} disabled={sending || !canSend()} loading={sending}>
                    {ui.send}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main InboxPage ──────────────────────────────────────────────────────────

export default function InboxPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const caseText = getSupportCaseText(locale);
  const [activeTab, setActiveTab] = useState(0);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerID, setMySellerID] = useState(null);
  const [sellerNames, setSellerNames] = useState({});
  const [sellerUserIds, setSellerUserIds] = useState({});
  const [sellerOptions, setSellerOptions] = useState([]);
  const client = getMedusaAdminClient();

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? localStorage.getItem("sellerId") : null;
    setIsSuperuser(su);
    setMySellerID(sid);
    // Superuser: map business seller_id → store name (support threads group by seller_id, not user UUID)
    if (su) {
      client.getSellers().then((data) => {
        const names = {};
        const userIds = {};
        for (const s of data?.sellers || []) {
          const label =
            (s.store_name && String(s.store_name).trim()) ||
            s.email ||
            s.company_name ||
            s.seller_id ||
            s.id;
          if (s.seller_id) {
            names[String(s.seller_id)] = label;
            if (s.id) userIds[String(s.seller_id)] = s.id;
          }
          if (s.id) names[String(s.id)] = label;
        }
        setSellerNames(names);
        setSellerUserIds(userIds);
        setSellerOptions((data?.sellers || [])
          .filter((seller) => seller.seller_id)
          .map((seller) => ({
            value: String(seller.seller_id),
            label: `${names[String(seller.seller_id)] || seller.seller_id} · ${seller.seller_id}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)));
      }).catch(() => {});
    }
  }, [client]);

  const tabs = [
    { id: "cases", content: caseText.customersTab || caseText.title },
    { id: "support", content: caseText.supportTab || caseText.legacySupport },
  ];

  return (
    <Page fullWidth title={locale === "en" ? "Messages" : locale === "tr" ? "Mesajlar" : locale === "fr" ? "Messages" : locale === "es" ? "Mensajes" : locale === "it" ? "Messaggi" : "Nachrichten"} secondaryActions={[{ content: locale === "en" ? "Templates" : locale === "tr" ? "Şablonlar" : locale === "fr" ? "Modèles" : locale === "es" ? "Plantillas" : locale === "it" ? "Modelli" : "Vorlagen", url: "/inbox/templates" }]}>
      <div style={{ marginBottom: 0 }}>
        <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} fitted={false} />
      </div>
      <div style={{ marginTop: 12 }}>
        {activeTab === 0 && (
          <SupportCaseInbox client={client} isSuperuser={isSuperuser} sellerOptions={sellerOptions} />
        )}
        {activeTab === 1 && (
          <SupportInbox
            client={client}
            isSuperuser={isSuperuser}
            mySellerID={mySellerID}
            sellerNames={sellerNames}
            sellerUserIds={sellerUserIds}
          />
        )}
      </div>
    </Page>
  );
}
