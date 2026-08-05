"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { getToken } from "@andertal/lib";
import { getMedusaClient, resolveMedusaBaseUrl } from "@/lib/medusa-client";
import styles from "./CaseInbox.module.css";

const FILTERS = ["open", "awaiting_customer", "awaiting_seller", "resolved", "closed", "unread"];
const ACTIVE_STATUSES = new Set(["open", "awaiting_customer", "awaiting_seller", "awaiting_support", "in_progress", "reopened"]);
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024;

function headers(json = true) {
  const token = getToken("customer");
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function caseId(entry) {
  return String(entry?.id || entry?.case_id || "");
}

function caseNumber(entry) {
  return entry?.case_number || entry?.number || caseId(entry).slice(-8).toUpperCase();
}

function statusOf(entry) {
  return String(entry?.status || "open").toLowerCase();
}

function normalizeAttachment(entry) {
  return entry?.attachment || entry;
}

function attachmentUrl(entry) {
  const value = String(entry?.public_url || entry?.url || entry?.file_url || entry?.path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${resolveMedusaBaseUrl()}${value}`;
  return `${resolveMedusaBaseUrl()}/uploads/${value.replace(/^\/+/, "")}`;
}

function imageUrl(value) {
  const source = String(value || "").trim();
  if (!source || /^https?:\/\//i.test(source) || source.startsWith("/")) return source;
  return `${resolveMedusaBaseUrl()}/uploads/${source}`;
}

function normalizeItems(data) {
  return Array.isArray(data?.items) ? data.items : Array.isArray(data?.order_items) ? data.order_items : [];
}

function ErrorNotice({ error, t }) {
  if (!error) return null;
  if (error.message && !error.status && !error.code) return <p className={styles.error} role="alert">{error.message}</p>;
  const key = error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : error.status === 404 ? "notFound" : error.status === 409 || error.code === "CASE_CLOSED" ? "caseClosed" : "generic";
  return <p className={styles.error} role="alert">{t(`errors.${key}`)}</p>;
}

function translatedStatus(entry, t) {
  const status = statusOf(entry);
  return t.has(`statuses.${status}`) ? t(`statuses.${status}`) : t("statuses.open");
}

function AttachmentList({ attachments, label }) {
  if (!Array.isArray(attachments) || !attachments.length) return null;
  const available = attachments.map(normalizeAttachment).filter((attachment) => attachmentUrl(attachment));
  if (!available.length) return null;
  return (
    <div className={styles.attachments} aria-label={label}>
      {available.map((attachment, index) => {
        const url = attachmentUrl(attachment);
        return <a key={attachment?.id || index} href={url} target="_blank" rel="noreferrer">{attachment?.original_name || attachment?.filename || attachment?.name || `#${index + 1}`}</a>;
      })}
    </div>
  );
}

function ConfirmModal({ open, title, description, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll("button");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [onCancel, open]);

  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className={styles.modal} role="alertdialog" aria-modal="true" aria-labelledby="close-case-title" aria-describedby="close-case-description">
        <h2 id="close-case-title">{title}</h2>
        <p id="close-case-description">{description}</p>
        <div><button ref={cancelRef} type="button" onClick={onCancel}>{cancelLabel}</button><button type="button" className={styles.dangerButton} onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  );
}

function CaseListItem({ entry, selected, onSelect, dateFormatter, t }) {
  const unread = Number(entry?._unread_count ?? entry?.unread_count ?? entry?.unread ?? 0);
  const last = entry?.last_message || entry?.latest_message;
  return (
    <button type="button" className={`${styles.caseListItem} ${selected ? styles.selectedCase : ""}`} onClick={onSelect}>
      <span className={styles.caseListTop}><strong>{t("caseReference", { number: caseNumber(entry) })}</strong><time>{dateFormatter(entry?.last_message_at || entry?.updated_at, true)}</time></span>
      <span className={styles.caseTitle}>{entry?.title || t("untitled")}</span>
      <span className={styles.casePreview}>{last?.body || entry?.last_message_preview || entry?.description || ""}</span>
      <span className={styles.caseMeta}><span className={`${styles.status} ${styles[`status_${statusOf(entry)}`] || ""}`}>{translatedStatus(entry, t)}</span>{entry?.order_number && <span>{t("orderReference", { number: entry.order_number })}</span>}{unread > 0 && <span className={styles.unread}>{unread}</span>}</span>
    </button>
  );
}

function CaseDetail({ detail, loading, error, onBack, onRefresh, onMutated, dateFormatter, locale, t }) {
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const bottomRef = useRef(null);
  const uploadedRef = useRef(null);
  const id = caseId(detail);
  const status = statusOf(detail);
  const readOnly = detail?.legacy_read_only === true || id.startsWith("legacy-");
  // Closed/resolved cases stay replyable — sending a message reopens them on the backend.
  const canReply = !readOnly && (ACTIVE_STATUSES.has(status) || status === "closed" || status === "resolved");
  const active = !readOnly && ACTIVE_STATUSES.has(status);
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  const events = Array.isArray(detail?.timeline) ? detail.timeline : Array.isArray(detail?.events) ? detail.events : [];
  const timeline = useMemo(() => [
    ...events.map((event) => ({ ...event, _kind: "event", _date: event.created_at || event.timestamp })),
    ...messages.map((message) => ({ ...message, _kind: "message", _date: message.created_at })),
  ].sort((a, b) => String(a._date || "").localeCompare(String(b._date || ""))), [events, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [id, messages.length]);

  useEffect(() => {
    uploadedRef.current = null;
  }, [files]);

  const mutate = async (path, body = {}) => {
    setBusy(true);
    setLocalError(null);
    const result = await getMedusaClient().request(`/store/support/cases/${encodeURIComponent(id)}/${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (result?.__error) {
      setLocalError({ status: result.status, code: result.code, message: result.message });
      return false;
    }
    await onMutated(id);
    return true;
  };

  const chooseFiles = (incoming) => {
    const next = [...files, ...incoming];
    if (next.length > MAX_FILES || next.some((file) => !ACCEPTED.has(file.type) || file.size > MAX_SIZE)) {
      setLocalError({ message: t("errors.fileValidation") });
      return;
    }
    setFiles(next);
    setLocalError(null);
  };

  const upload = async () => {
    if (!files.length) return [];
    if (uploadedRef.current?.length === files.length) return uploadedRef.current;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const response = await fetch(`${resolveMedusaBaseUrl()}/store/support/attachments/upload`, { method: "POST", headers: headers(false), body: form });
    if (!response.ok) throw Object.assign(new Error("upload"), { status: response.status });
    const result = await response.json();
    if (!Array.isArray(result?.attachments) || result.attachments.length !== files.length) throw new Error("upload");
    uploadedRef.current = result.attachments;
    return result.attachments;
  };

  const sendReply = async () => {
    if (!reply.trim() || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      const uploaded = await upload();
      const result = await getMedusaClient().request(`/store/support/cases/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ body: reply.trim(), attachments: uploaded }),
      });
      if (result?.__error) throw { status: result.status, code: result.code, message: result.message };
      setReply("");
      setFiles([]);
      uploadedRef.current = null;
      await onMutated(id);
    } catch (sendError) {
      setLocalError(sendError);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className={styles.detailState} role="status">{t("loadingDetail")}</div>;
  if (error) return <div className={styles.detailState}><button type="button" className={styles.mobileBack} onClick={onBack}>← {t("backToCases")}</button><ErrorNotice error={error} t={t} /></div>;
  if (!detail) return <div className={styles.detailState}>{t("selectCase")}</div>;

  const items = normalizeItems(detail);
  return (
    <article className={styles.detail}>
      <header className={styles.detailHeader}>
        <button type="button" className={styles.mobileBack} onClick={onBack}>← <span>{t("backToCases")}</span></button>
        <div><span>{t("caseReference", { number: caseNumber(detail) })}</span><h2>{detail.title || t("untitled")}</h2></div>
        <button type="button" className={styles.iconButton} onClick={onRefresh} aria-label={t("refresh")}>↻</button>
      </header>
      <div className={styles.summary}>
        <dl>
          <div><dt>{t("summary.status")}</dt><dd><span className={`${styles.status} ${styles[`status_${status}`] || ""}`}>{translatedStatus(detail, t)}</span></dd></div>
          <div><dt>{t("summary.category")}</dt><dd>{t.has(`categories.${detail.category}`) ? t(`categories.${detail.category}`) : detail.category}</dd></div>
          {detail.order_number && <div><dt>{t("summary.order")}</dt><dd>{detail.order_number}</dd></div>}
          <div><dt>{t("summary.created")}</dt><dd>{dateFormatter(detail.created_at)}</dd></div>
        </dl>
        <p>{detail.description}</p>
        {items.length > 0 && <div className={styles.items}>{items.map((item) => {
          const itemImage = item.image_snapshot || item.image || item.thumbnail;
          return <div key={item.id} className={styles.itemCard}>{itemImage && <Image src={imageUrl(itemImage)} alt="" width={54} height={54} />}<span><strong>{item.title_snapshot || item.title || item.product_title}</strong>{item.variant_title && <small>{item.variant_title}</small>}</span></div>;
        })}</div>}
      </div>
      <div className={styles.timeline} aria-label={t("timelineLabel")}>
        {timeline.map((entry, index) => {
          if (entry._kind === "event") {
            const eventType = entry.event_type || entry.type || "";
            return <div key={entry.id || `event-${index}`} className={styles.event}><span>{entry.label || entry.description || (t.has(`events.${eventType}`) ? t(`events.${eventType}`) : t("events.updated"))}</span><time>{dateFormatter(entry._date)}</time></div>;
          }
          const role = String(entry.sender_role || entry.role || entry.sender_type || "support").toLowerCase();
          const customer = role === "customer";
          return (
            <div key={entry.id || `message-${index}`} className={`${styles.messageRow} ${customer ? styles.customerMessage : ""}`}>
              <div className={styles.messageBubble}>
                <span className={styles.roleLabel}>{t.has(`roles.${role}`) ? t(`roles.${role}`) : role}</span>
                <p>{entry.body}</p>
                <AttachmentList attachments={entry.attachments} label={t("attachments")} />
                <time>{dateFormatter(entry.created_at)}</time>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {readOnly ? <p className={styles.retentionNotice}>{t("legacyReadOnly")}</p> : null}
      <div className={styles.caseActions}>
        {active && <button type="button" onClick={() => setConfirmClose(true)} disabled={busy}>{t("closeCase")}</button>}
        {!readOnly && (status === "closed" || status === "resolved") && <button type="button" onClick={() => mutate("hide")} disabled={busy}>{t("hideCase")}</button>}
      </div>
      {canReply ? (
        <div className={styles.replyBox}>
          {(status === "closed" || status === "resolved") && (
            <p className={styles.retentionNotice} style={{ marginTop: 0 }}>{t.has("reopenByReplyHint") ? t("reopenByReplyHint") : "Sending a reply reopens this case."}</p>
          )}
          <label htmlFor="case-reply">{t("replyLabel")}</label>
          <textarea id="case-reply" rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t("replyPlaceholder")} />
          <div className={styles.replyTools}>
            <label className={styles.fileButton}>{t("addAttachments")}<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => chooseFiles(Array.from(event.target.files || []))} /></label>
            <button type="button" className={styles.sendButton} disabled={busy || !reply.trim()} onClick={sendReply}>{busy ? t("sending") : t("send")}</button>
          </div>
          {files.length > 0 && <ul className={styles.selectedFiles}>{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button></li>)}</ul>}
        </div>
      ) : <p className={styles.inactiveNotice}>{t("inactiveReply")}</p>}
      <ErrorNotice error={localError} t={t} />
      <ConfirmModal
        open={confirmClose}
        title={t("closeModal.title")}
        description={t("closeModal.description")}
        confirmLabel={t("closeModal.confirm")}
        cancelLabel={t("closeModal.cancel")}
        onCancel={() => setConfirmClose(false)}
        onConfirm={async () => { setConfirmClose(false); await mutate("close"); }}
      />
    </article>
  );
}

export default function CaseInbox({ embedded = false }) {
  const t = useTranslations("caseInbox");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const requestedCase = searchParams?.get("case") || "";
  const [filter, setFilter] = useState("open");
  const [page, setPage] = useState(1);
  const [cases, setCases] = useState([]);
  const [count, setCount] = useState(0);
  const [selectedId, setSelectedId] = useState(requestedCase);
  const [detail, setDetail] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(Boolean(requestedCase));
  const [listError, setListError] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const limit = 10;

  const dateFormatter = useCallback((value, short = false) => {
    if (!value) return "";
    return new Intl.DateTimeFormat(locale, short ? { day: "2-digit", month: "2-digit" } : { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }, [locale]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    const requestCases = (query) => getMedusaClient().request(`/store/support/cases?${query}`, { headers: headers(false), cache: "no-store" });
    try {
      let nextCases = [];
      let nextCount = 0;
      let errorResult = null;
      if (filter === "open" || filter === "unread") {
        const result = await requestCases(`page=${page}&limit=${limit}&view=${encodeURIComponent(filter)}`);
        errorResult = result?.__error ? result : null;
        if (!errorResult) {
          nextCases = Array.isArray(result?.cases) ? result.cases : [];
          nextCount = Number(result?.total ?? result?.count ?? nextCases.length);
        }
      } else {
        const exact = await requestCases(`page=${page}&limit=${limit}&status=${encodeURIComponent(filter)}`);
        errorResult = exact?.__error ? exact : null;
        if (!errorResult) {
          nextCases = Array.isArray(exact?.cases) ? exact.cases : [];
          nextCount = Number(exact?.total ?? exact?.count ?? nextCases.length);
        }
      }
      if (errorResult) {
        setListError({ status: errorResult.status, message: errorResult.message });
        setCases([]);
        setCount(0);
      } else {
        setListError(null);
        setCases(nextCases);
        setCount(nextCount);
      }
    } catch (error) {
      setListError({ status: 0, message: error?.message });
      setCases([]);
      setCount(0);
    } finally {
      setListLoading(false);
    }
  }, [filter, page]);

  const loadDetail = useCallback(async (id, markRead = true) => {
    if (!id) return;
    setDetailLoading(true);
    setDetailError(null);
    const result = await getMedusaClient().request(`/store/support/cases/${encodeURIComponent(id)}`, { headers: headers(false), cache: "no-store" });
    if (result?.__error) {
      setDetail(null);
      setDetailError({ status: result.status, code: result.code, message: result.message });
    } else {
      const next = result?.case
        ? { ...result.case, items: result.items || [], messages: result.messages || [], events: result.events || [] }
        : result;
      setDetail(next);
      if (markRead && !next?.legacy_read_only && !String(id).startsWith("legacy-")) {
        getMedusaClient().request(`/store/support/cases/${encodeURIComponent(id)}/read`, { method: "POST", headers: headers(), body: "{}" }).then(() => loadList());
      }
    }
    setDetailLoading(false);
  }, [loadList]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (requestedCase) {
      setSelectedId(requestedCase);
      loadDetail(requestedCase);
    }
  }, [loadDetail, requestedCase]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      loadList();
      if (selectedId) loadDetail(selectedId, false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadDetail, loadList, selectedId]);

  const select = (entry) => {
    const id = caseId(entry);
    setSelectedId(id);
    loadDetail(id);
    window.history.replaceState(null, "", `?case=${encodeURIComponent(id)}`);
  };

  const refresh = async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId, false);
  };

  const mutated = async (id) => {
    await Promise.all([loadList(), loadDetail(id, false)]);
  };

  return (
    <div className={`${styles.inbox} ${embedded ? styles.embedded : ""} ${selectedId ? styles.hasSelection : ""}`}>
      <aside className={styles.sidebar} aria-label={t("caseListLabel")}>
        <div className={styles.sidebarHeader}><div><h1>{t("title")}</h1><p>{t("subtitle")}</p></div><button type="button" className={styles.iconButton} onClick={refresh} aria-label={t("refresh")}>↻</button></div>
        <div className={styles.filters} role="group" aria-label={t("filterLabel")}>
          {FILTERS.map((entry) => <button type="button" key={entry} aria-pressed={filter === entry} onClick={() => { setFilter(entry); setPage(1); }}>{t(`filters.${entry}`)}</button>)}
        </div>
        <ErrorNotice error={listError} t={t} />
        <div className={styles.caseList}>
          {listLoading ? <p className={styles.listState}>{t("loadingCases")}</p> : cases.length ? cases.map((entry) => <CaseListItem key={caseId(entry)} entry={entry} selected={caseId(entry) === selectedId} onSelect={() => select(entry)} dateFormatter={dateFormatter} t={t} />) : <p className={styles.listState}>{t("empty")}</p>}
        </div>
        {count > limit && <nav className={styles.pagination} aria-label={t("paginationLabel")}><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("previous")}</button><span>{t("page", { page })}</span><button type="button" disabled={page * limit >= count} onClick={() => setPage((current) => current + 1)}>{t("next")}</button></nav>}
      </aside>
      <main className={styles.detailPane}>
        <CaseDetail detail={detail} loading={detailLoading} error={detailError} onBack={() => { setSelectedId(""); setDetail(null); window.history.replaceState(null, "", window.location.pathname); }} onRefresh={refresh} onMutated={mutated} dateFormatter={dateFormatter} locale={locale} t={t} />
      </main>
    </div>
  );
}
