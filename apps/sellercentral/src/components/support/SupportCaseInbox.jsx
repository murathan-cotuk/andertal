"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Spinner, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { dateLocaleFor } from "@/lib/locale-text";
import { getSupportCaseText } from "@/lib/support-case-i18n";
import styles from "./SupportCaseInbox.module.css";

const TERMINAL = new Set(["resolved", "closed"]);
const FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

function dateTime(value, locale) {
  if (!value) return "—";
  return new Date(value).toLocaleString(dateLocaleFor(locale), {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function caseItems(value) {
  return value?.items || value?.item_snapshots || value?.order_items || [];
}

function unreadCount(value) {
  const raw = value?.unread_count ?? value?.unread_messages ?? value?.inbox?.unread_count;
  if (raw != null) return Number(raw) || 0;
  return value?.is_unread || value?.unread ? 1 : 0;
}

function lastPreview(value) {
  return value?.last_message?.body || value?.last_message_body || value?.message_preview || "";
}

function safeUrl(value) {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\/)/i.test(url) ? url : "";
}

function StatusPill({ status, text }) {
  const label = {
    open: text.open, awaiting_customer: text.awaitingCustomer, awaiting_seller: text.awaitingSeller,
    awaiting_support: text.awaitingSupport, resolved: text.resolved, closed: text.closed, reopened: text.reopened,
  }[status] || status || "—";
  const tone = TERMINAL.has(status) ? styles.statusTerminal : status?.startsWith("awaiting") ? styles.statusAwaiting : styles.statusOpen;
  return <span className={`${styles.status} ${tone}`}>{label}</span>;
}

function Attachment({ attachment, text }) {
  const url = safeUrl(attachment?.url || attachment?.public_url);
  if (!url) return null;
  const name = attachment?.name || attachment?.original_name || text.attachment;
  const mime = String(attachment?.mime_type || "");
  return mime.startsWith("image/") ? (
    <a href={url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
      <img className={styles.attachmentImage} src={url} alt={name} />
      {name}
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>{name}</a>
  );
}

function CloseModal({ text, busy, onClose, onConfirm }) {
  const modalRef = useRef(null);
  const restoreRef = useRef(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    restoreRef.current = document.activeElement;
    const modal = modalRef.current;
    const focusables = () => [...modal.querySelectorAll("button, textarea, input, [href], [tabindex]:not([tabindex='-1'])")]
      .filter((node) => !node.disabled);
    focusables()[0]?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [busy, onClose]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="support-close-title" aria-describedby="support-close-help">
        <h2 id="support-close-title">{text.closeQuestion}</h2>
        <p id="support-close-help">{text.closeHelp}</p>
        <label>
          {text.resolutionNote}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.dangerButton} onClick={() => onConfirm(note)} disabled={busy}>{text.confirmClose}</button>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>{text.keepOpen}</button>
        </div>
      </div>
    </div>
  );
}

export default function SupportCaseInbox({ client, isSuperuser, sellerOptions = [] }) {
  const locale = useLocale();
  const text = useMemo(() => getSupportCaseText(locale), [locale]);
  const [cases, setCases] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const bottomRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const limit = 20;

  const filters = [
    ["all", text.allCases], ["open", text.open], ["awaiting_customer", text.awaitingCustomer],
    ["awaiting_seller", text.awaitingSeller], ["awaiting_support", text.awaitingSupport],
    ["resolved", text.resolved], ["closed", text.closed], ["unread", text.unread],
  ];

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit, filter: appliedSearch };
      if (filter === "open" || filter === "unread") params.view = filter;
      else if (filter !== "all") params.status = filter;
      const data = await client.getSupportCases(params);
      const nextCases = data?.cases || data?.items || [];
      setCases(nextCases);
      setTotal(Number(data?.total ?? data?.count ?? nextCases.length) || 0);
    } catch (err) {
      setError(err?.message || text.loadError);
    } finally {
      setLoading(false);
    }
  }, [client, page, filter, appliedSearch, text.loadError]);

  const openCase = useCallback(async (id, { updateUrl = true } = {}) => {
    if (!id) return;
    setSelectedId(id);
    setDetailLoading(true);
    setError("");
    setReply("");
    setFiles([]);
    try {
      const data = await client.getSupportCase(id);
      setDetail(data);
      setSellerId(data?.case?.seller_id || "");
      setCases((current) => current.map((entry) => entry.id === id ? { ...entry, unread_count: 0, is_unread: false, unread: false } : entry));
      client.markSupportCaseRead(id).catch(() => {});
      if (updateUrl && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("case", id);
        window.history.replaceState({}, "", url);
      }
    } catch (err) {
      setDetail(null);
      setError(err?.message || text.loadError);
    } finally {
      setDetailLoading(false);
    }
  }, [client, text.loadError]);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => {
    if (autoOpenedRef.current || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("case");
    autoOpenedRef.current = true;
    if (id) openCase(id, { updateUrl: false });
  }, [openCase]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [detail?.messages?.length]);

  const refreshDetailAndList = async () => {
    await Promise.all([loadCases(), selectedId ? openCase(selectedId, { updateUrl: false }) : Promise.resolve()]);
  };

  const handleFiles = (selected) => {
    const next = [...files, ...Array.from(selected || [])];
    if (next.length > MAX_FILES) return setError(text.tooManyFiles);
    if (next.some((file) => !FILE_TYPES.has(file.type))) return setError(text.invalidType);
    if (next.some((file) => file.size > MAX_BYTES)) return setError(text.fileTooLarge);
    setError("");
    setFiles(next);
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || TERMINAL.has(detail?.case?.status)) return;
    setBusy(true);
    setError("");
    try {
      let attachments = [];
      if (files.length) {
        const uploaded = await client.uploadSupportCaseAttachments(files);
        attachments = (uploaded?.attachments || []).map((item) => item.id || item.upload_id);
      }
      await client.sendSupportCaseMessage(selectedId, { body: reply.trim(), attachments });
      setReply("");
      setFiles([]);
      await refreshDetailAndList();
    } catch (err) {
      if (err?.statusCode === 409 && (err?.code === "CASE_CLOSED" || String(err?.originalMessage || "").toLowerCase().includes("closed"))) {
        setError(text.caseClosedConflict);
        await openCase(selectedId, { updateUrl: false });
      } else setError(err?.message || text.actionError);
    } finally {
      setBusy(false);
    }
  };

  const closeCase = async (note) => {
    setBusy(true);
    setError("");
    try {
      await client.closeSupportCase(selectedId, note);
      setCloseOpen(false);
      await refreshDetailAndList();
    } catch (err) {
      setError(err?.message || text.actionError);
    } finally {
      setBusy(false);
    }
  };

  const reopenCase = async () => {
    setBusy(true);
    setError("");
    try {
      await client.reopenSupportCase(selectedId);
      await refreshDetailAndList();
    } catch (err) {
      setError(err?.message || text.actionError);
    } finally {
      setBusy(false);
    }
  };

  const reassign = async () => {
    setBusy(true);
    setError("");
    try {
      await client.reassignSupportCase(selectedId, sellerId);
      await refreshDetailAndList();
    } catch (err) {
      setError(err?.message || text.actionError);
    } finally {
      setBusy(false);
    }
  };

  const supportCase = detail?.case;
  const items = detail?.items || [];
  const messages = detail?.messages || [];
  const terminal = TERMINAL.has(supportCase?.status);
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      {error && <div style={{ marginBottom: 12 }}><Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner></div>}
      <div className={styles.shell}>
        <section className={styles.queue} aria-label={text.title}>
          <div className={styles.toolbar}>
            <TextField
              label={text.search}
              labelHidden
              placeholder={text.search}
              value={search}
              onChange={setSearch}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") { setPage(1); setAppliedSearch(search.trim()); }
              }}
              connectedRight={<button type="button" className={styles.iconButton} onClick={() => { setPage(1); setAppliedSearch(search.trim()); loadCases(); }} aria-label={text.refresh}>↻</button>}
            />
          </div>
          <div className={styles.filters} aria-label={text.category}>
            {filters.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`${styles.filter} ${filter === value ? styles.filterActive : ""}`}
                aria-pressed={filter === value}
                onClick={() => { setFilter(value); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.list} aria-live="polite">
            {loading ? <div className={styles.empty}><Spinner size="small" accessibilityLabel={text.loading} /></div> : cases.length === 0 ? (
              <div className={styles.empty}>{text.noCases}</div>
            ) : cases.map((entry) => {
              const entryItems = caseItems(entry);
              const unread = unreadCount(entry);
              const active = entry.id === selectedId;
              const route = entry.seller_store_name || entry.seller_name || entry.seller_id || text.platformRouting;
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={`${styles.caseRow} ${active ? styles.caseRowActive : ""} ${unread ? styles.caseRowUnread : ""}`}
                  onClick={() => openCase(entry.id)}
                  aria-current={active ? "true" : undefined}
                >
                  <span className={styles.rowTop}>
                    <strong>{entry.case_number || `${text.caseLabel} ${entry.id}`}</strong>
                    <span className={styles.rowMeta}>{unread > 0 && <span className={styles.unreadDot} aria-label={text.unread} />} {dateTime(entry.updated_at || entry.last_message_at, locale)}</span>
                  </span>
                  <span className={styles.rowSubject}>{entry.title || "—"}</span>
                  <span className={styles.rowMeta}>
                    <StatusPill status={entry.status} text={text} />
                    <span>{entry.category || "—"}</span>
                    {entry.order_number && <span>{text.order} #{entry.order_number}</span>}
                    <span>{route}</span>
                    {entryItems.length > 0 && <span className={styles.thumbs}>{entryItems.slice(0, 3).map((item, index) => {
                      const src = safeUrl(item.image_snapshot || item.image || item.thumbnail);
                      return src ? <img key={item.id || index} className={styles.thumb} src={src} alt="" /> : null;
                    })}</span>}
                  </span>
                  <span className={styles.preview}>{lastPreview(entry) || entry.customer_email || "—"}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.pagination}>
            <button type="button" className={styles.iconButton} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>{text.previous}</button>
            <span>{text.page} {page} {text.of} {pageCount}</span>
            <button type="button" className={styles.iconButton} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>{text.next}</button>
          </div>
        </section>

        <section className={styles.detail} aria-label={supportCase?.case_number || text.selectCase}>
          {detailLoading ? <div className={styles.empty}><Spinner size="small" accessibilityLabel={text.loading} /></div> : !supportCase ? (
            <div className={styles.empty}>{text.selectCase}</div>
          ) : (
            <>
              <header className={styles.detailHeader}>
                <div className={styles.detailTitle}>
                  <span>{supportCase.case_number}</span>
                  <h2>{supportCase.title}</h2>
                  <StatusPill status={supportCase.status} text={text} />
                </div>
                <div className={styles.actions}>
                  {!terminal && <button type="button" className={styles.dangerButton} onClick={() => setCloseOpen(true)} disabled={busy}>{text.closeCase}</button>}
                  <button type="button" className={styles.secondaryButton} onClick={refreshDetailAndList} disabled={busy}>{text.refresh}</button>
                </div>
              </header>
              <div className={styles.summary}>
                <div className={styles.summaryBlock}><span className={styles.summaryLabel}>{text.customer}</span>{supportCase.customer_name || supportCase.customer_email || "—"}</div>
                <div className={styles.summaryBlock}><span className={styles.summaryLabel}>{text.order}</span>{supportCase.order_number || supportCase.order_id || "—"}</div>
                <div className={styles.summaryBlock}><span className={styles.summaryLabel}>{text.category}</span>{[supportCase.category, supportCase.subcategory].filter(Boolean).join(" · ") || "—"}</div>
                <div className={styles.summaryBlock}>
                  <span className={styles.summaryLabel}>{text.routing}</span>
                  {supportCase.seller_store_name || supportCase.seller_name || supportCase.seller_id || text.platformRouting}
                </div>
                <div className={styles.summaryBlock}>
                  <span className={styles.summaryLabel}>{text.items}</span>
                  {items.length ? items.map((item) => item.title_snapshot || item.title).filter(Boolean).join(", ") : "—"}
                </div>
                <div className={styles.summaryBlock}><span className={styles.summaryLabel}>{text.caseLabel}</span>{dateTime(supportCase.created_at, locale)}</div>
                {isSuperuser && (
                  <div className={styles.routeControl}>
                    <div>
                      <label className={styles.summaryLabel} htmlFor="support-case-seller">{text.reassign}</label>
                      <select id="support-case-seller" value={sellerId} onChange={(event) => setSellerId(event.target.value)} style={{ width: "100%", minHeight: 44, borderRadius: 8, border: "1px solid var(--p-color-border)", padding: "0 10px", background: "var(--p-color-bg-surface)", color: "inherit" }}>
                        <option value="">{text.unassigned}</option>
                        {sellerOptions.map((seller) => <option key={seller.value} value={seller.value}>{seller.label}</option>)}
                      </select>
                    </div>
                    <button type="button" className={styles.secondaryButton} onClick={reassign} disabled={busy || sellerId === (supportCase.seller_id || "")}>{text.apply}</button>
                  </div>
                )}
              </div>
              <div className={styles.messages}>
                {messages.map((message) => {
                  const own = isSuperuser ? message.sender_role === "support" : message.sender_role === "seller";
                  const role = message.sender_role === "customer" ? text.customer : message.sender_role === "support" ? text.support : text.seller;
                  return (
                    <article key={message.id} className={`${styles.message} ${own ? styles.messageOwn : ""}`}>
                      <div className={styles.role}>{role}</div>
                      <div className={styles.bubble}>
                        {String(message.body || "")}
                        {(message.attachments || []).map((attachment, index) => <Attachment key={attachment.upload_id || attachment.id || index} attachment={attachment} text={text} />)}
                        <div className={styles.time}>{dateTime(message.created_at, locale)}</div>
                      </div>
                    </article>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {isSuperuser && Array.isArray(detail.events) && detail.events.length > 0 && (
                <details className={styles.audit}>
                  <summary>{text.audit} ({detail.events.length})</summary>
                  {detail.events.map((event) => (
                    <div key={event.id} className={styles.auditItem}>
                      <strong>{event.event_type}</strong> · {event.actor_role || "—"} · {dateTime(event.created_at, locale)}
                      {event.data && <div>{typeof event.data === "string" ? event.data : JSON.stringify(event.data)}</div>}
                    </div>
                  ))}
                </details>
              )}
              {terminal ? (
                <div className={styles.locked}>
                  <p>{text.conversationLocked}</p>
                  <button type="button" className={styles.primaryButton} onClick={reopenCase} disabled={busy}>{text.reopenCase}</button>
                </div>
              ) : (
                <div className={styles.composer}>
                  <label htmlFor="support-case-reply">{text.reply}</label>
                  <textarea id="support-case-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={10000} placeholder={text.replyPlaceholder} />
                  <div className={styles.attachments}>
                    <label className={styles.fileLabel}>
                      {text.addFiles}
                      <input className={styles.fileInput} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => { handleFiles(event.target.files); event.target.value = ""; }} />
                    </label>
                    {files.map((file, index) => (
                      <span key={`${file.name}-${file.lastModified}`} className={styles.fileChip}>
                        {file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`${text.remove} ${file.name}`}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className={styles.fileRules}>{text.fileRules}</div>
                  <div className={styles.actions} style={{ marginTop: 10 }}>
                    <button type="button" className={styles.primaryButton} onClick={sendReply} disabled={busy || !reply.trim()}>{text.send}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {closeOpen && <CloseModal text={text} busy={busy} onClose={() => setCloseOpen(false)} onConfirm={closeCase} />}
    </>
  );
}
