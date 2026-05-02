"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Text, Select, Button, BlockStack, InlineStack, Box } from "@shopify/polaris";

function visualToHtml(html) {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(p|div|h[1-6]|ul|ol|li)\b/i.test(s)) return s;
  return "<p>" + s + "</p>";
}

/** Plain text → safe minimal HTML for multipart/alternative HTML part */
export function plainTextToEmailHtml(plain) {
  const raw = String(plain ?? "");
  const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const trimmed = esc.trim();
  if (!trimmed) return "";
  return esc
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => "<p>" + block.split("\n").join("<br/>") + "</p>")
    .join("");
}

export function htmlToPlainText(html) {
  const s = String(html ?? "").trim();
  if (!s) return "";
  if (typeof document === "undefined") {
    return s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  const d = document.createElement("div");
  d.innerHTML = s;
  const t = d.innerText ?? d.textContent ?? "";
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const STYLES = `
  .flow-rte-wrap { border: 1px solid var(--p-color-border); border-radius: 8px; overflow: hidden; background: var(--p-color-bg-surface); }
  .flow-rte-wrap:focus-within { border-color: var(--p-color-border-focus, #005bd3); box-shadow: 0 0 0 2px rgba(0,91,211,.12); }
  .flow-rte-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); gap: 8px; flex-wrap: wrap; }
  .flow-rte-toolbar-left { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .flow-rte-mode-group { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .flow-rte-mode-btn { padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); font-size: 12px; font-weight: 600; transition: background 0.15s, color 0.15s; }
  .flow-rte-mode-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
  .flow-rte-mode-btn.active { background: var(--p-color-bg-surface-selected); color: var(--p-color-text); }
  .flow-rte-btn { width: 30px; height: 30px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
  .flow-rte-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
  .flow-rte-btn svg { width: 15px; height: 15px; }
  .flow-rte-divider { width: 1px; height: 18px; background: var(--p-color-border); margin: 0 3px; flex-shrink: 0; }
  .flow-rte-html-btn { width: 30px; height: 30px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .flow-rte-html-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
  .flow-rte-html-btn.active { background: var(--p-color-bg-surface-selected); color: var(--p-color-text); }
  .flow-rte-html-btn svg { width: 15px; height: 15px; }
  .flow-rte-visual { outline: none; padding: 14px; font-size: 14px; line-height: 1.6; color: var(--p-color-text); min-height: var(--flow-rte-min-height, 240px); }
  .flow-rte-visual:empty:before { content: attr(data-placeholder); color: var(--p-color-text-subdued); pointer-events: none; }
  .flow-rte-visual p { margin: 0 0 0.5em; } .flow-rte-visual p:last-child { margin-bottom: 0; }
  .flow-rte-visual h2 { font-size: 1.35rem; font-weight: 700; margin: 0.65em 0 0.3em; }
  .flow-rte-visual h3 { font-size: 1.15rem; font-weight: 600; margin: 0.6em 0 0.25em; }
  .flow-rte-visual ul, .flow-rte-visual ol { margin: 0.4em 0 0.6em 1.5em; padding-left: 1.5em; }
  .flow-rte-visual ul { list-style-type: disc; } .flow-rte-visual ol { list-style-type: decimal; }
  .flow-rte-visual strong { font-weight: 600; }
  .flow-rte-html { width: 100%; padding: 14px; font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 12.5px; line-height: 1.55; color: var(--p-color-text); background: var(--p-color-bg-surface-secondary); border: none; resize: vertical; box-sizing: border-box; outline: none; min-height: var(--flow-rte-min-height, 240px); }
  .flow-rte-plain { width: 100%; padding: 14px; font-family: inherit; font-size: 14px; line-height: 1.55; color: var(--p-color-text); background: var(--p-color-bg-surface-secondary); border: none; resize: vertical; box-sizing: border-box; outline: none; min-height: var(--flow-rte-min-height, 240px); white-space: pre-wrap; }
  .flow-rte-plain::placeholder { color: var(--p-color-text-subdued); }
`;

/**
 * Flow e-posta gövdesi: görsel editör / ham HTML / düz metin (kaynak hep HTML).
 * ref.flushEmailBody() — görsel/düz metin içeriğini parent state'e yazıp HTML döndürür (test gönderimi vb.).
 */
const FlowEmailBodyEditor = forwardRef(function FlowEmailBodyEditor(
  {
    label,
    value = "",
    onChange,
    minHeight = "260px",
    placeholder = "",
    helpText,
    templates = [],
    templateSelectLabel = "Template",
    templateAppendLabel = "Append",
    modes = { visual: "Visual", html: "HTML", text: "Text" },
  },
  ref,
) {
  const [mode, setMode] = useState("visual");
  const [textDraft, setTextDraft] = useState("");
  const editorRef = useRef(null);
  const mountedValueRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const modeRef = useRef(mode);
  const textDraftRef = useRef(textDraft);
  const valueRef = useRef(value);
  const [templateChoice, setTemplateChoice] = useState("");
  onChangeRef.current = onChange;
  modeRef.current = mode;
  textDraftRef.current = textDraft;
  valueRef.current = value;

  useEffect(() => {
    if (mode === "visual" && editorRef.current) {
      editorRef.current.innerHTML = value || "";
      mountedValueRef.current = value;
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "visual" && editorRef.current && value !== mountedValueRef.current) {
      editorRef.current.innerHTML = value || "";
      mountedValueRef.current = value;
    }
  }, [value, mode]);

  useEffect(() => {
    if (mode === "text") setTextDraft(htmlToPlainText(value));
  }, [value, mode]);

  const exec = (cmd, arg) => {
    document.execCommand(cmd, false, arg ?? null);
    editorRef.current?.focus();
  };

  const flushVisual = () => {
    if (editorRef.current) {
      const html = visualToHtml(editorRef.current.innerHTML || "");
      mountedValueRef.current = html;
      onChangeRef.current?.(html);
      return html;
    }
    return value;
  };

  const flushText = () => {
    const html = plainTextToEmailHtml(textDraft);
    mountedValueRef.current = html;
    onChangeRef.current?.(html);
    return html;
  };

  useImperativeHandle(ref, () => ({
    flushEmailBody() {
      if (modeRef.current === "visual") {
        if (!editorRef.current) return String(valueRef.current ?? "");
        const html = visualToHtml(editorRef.current.innerHTML || "");
        mountedValueRef.current = html;
        onChangeRef.current?.(html);
        return html;
      }
      if (modeRef.current === "text") {
        const html = plainTextToEmailHtml(textDraftRef.current);
        mountedValueRef.current = html;
        onChangeRef.current?.(html);
        return html;
      }
      return String(valueRef.current ?? "");
    },
  }));

  const syncVisualFromDom = () => {
    if (!editorRef.current || mode !== "visual") return;
    const html = visualToHtml(editorRef.current.innerHTML || "");
    if (html === mountedValueRef.current) return;
    mountedValueRef.current = html;
    onChangeRef.current?.(html);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    let latest = value;
    if (mode === "visual") latest = flushVisual();
    else if (mode === "text") latest = flushText();
    else latest = value;

    if (next === "text") setTextDraft(htmlToPlainText(latest));
    setMode(next);
  };

  const handleBlurVisual = () => {
    syncVisualFromDom();
  };

  const appendTemplate = (tplHtml) => {
    const cur = String(value || "").trim();
    const block = String(tplHtml || "").trim();
    if (!block) return;
    const merged = cur ? `${cur}\n\n${block}` : block;
    mountedValueRef.current = merged;
    onChangeRef.current?.(merged);
    if (mode === "text") setTextDraft(htmlToPlainText(merged));
    if (mode === "visual" && editorRef.current) editorRef.current.innerHTML = merged;
  };

  const templateOptions = [{ label: "—", value: "" }, ...templates.map((t) => ({ label: t.label, value: t.id }))];

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {label && (
          <Text as="span" variant="bodyMd" fontWeight="medium">{label}</Text>
        )}
        {templates.length > 0 && (
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" fontWeight="semibold">{templateSelectLabel}</Text>
            <InlineTemplateRow
              templateAppendLabel={templateAppendLabel}
              templateOptions={templateOptions}
              templateChoice={templateChoice}
              setTemplateChoice={setTemplateChoice}
              templates={templates}
              onPick={(tpl) => appendTemplate(tpl.html)}
            />
          </BlockStack>
        )}
        <div className="flow-rte-wrap" style={{ "--flow-rte-min-height": minHeight }}>
          <div className="flow-rte-toolbar">
            <div className="flow-rte-toolbar-left">
              <div className="flow-rte-mode-group" role="tablist" aria-label="Editor mode">
                <button type="button" className={`flow-rte-mode-btn ${mode === "visual" ? "active" : ""}`} onClick={() => switchMode("visual")}>{modes.visual}</button>
                <button type="button" className={`flow-rte-mode-btn ${mode === "html" ? "active" : ""}`} onClick={() => switchMode("html")}>{modes.html}</button>
                <button type="button" className={`flow-rte-mode-btn ${mode === "text" ? "active" : ""}`} onClick={() => switchMode("text")}>{modes.text}</button>
              </div>
              {mode === "visual" && (
                <>
                  <span className="flow-rte-divider" aria-hidden />
                  <button type="button" className="flow-rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title="Bold">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h4.5a3.501 3.501 0 0 1 2.852 5.53A3.499 3.499 0 0 1 9 14H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1m1 5.5h3.5a1.5 1.5 0 0 0 0-3H5zm0 2V12h4a1.5 1.5 0 0 0 0-3H5z"/></svg>
                  </button>
                  <button type="button" className="flow-rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title="Italic">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 2.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H9.906l-2.273 10h2.117a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5h2.345l2.272-10H8.25a.75.75 0 0 1-.75-.75"/></svg>
                  </button>
                  <span className="flow-rte-divider" aria-hidden />
                  <button type="button" className="flow-rte-btn" style={{ width: 34, fontSize: 11 }} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); }}>H2</button>
                  <button type="button" className="flow-rte-btn" style={{ width: 34, fontSize: 11 }} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h3"); }}>H3</button>
                  <span className="flow-rte-divider" aria-hidden />
                  <button type="button" className="flow-rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} title="List">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/><path d="M2 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/><path d="M3 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/><path d="M5.25 2.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z"/><path d="M4.5 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 4.5 8"/><path d="M5.25 12.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z"/></svg>
                  </button>
                  <button type="button" className="flow-rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }} title="Ordered list">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 2.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z"/><path d="M5.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z"/><path d="M5 13a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 13"/><path d="M2.25 5.75a1.5 1.5 0 0 0-1.5 1.5.5.5 0 0 0 1 0 .5.5 0 0 1 1 0v.05a.5.5 0 0 1-.168.375l-1.423 1.264c-.515.459-.191 1.311.499 1.311h1.592a.5.5 0 0 0 0-1h-.935l.932-.828c.32-.285.503-.693.503-1.121v-.051a1.5 1.5 0 0 0-1.5-1.5"/></svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {mode === "html" && (
            <textarea
              className="flow-rte-html"
              value={value}
              onChange={(e) => {
                mountedValueRef.current = e.target.value;
                onChangeRef.current?.(e.target.value);
              }}
              spellCheck={false}
              placeholder="<p>HTML…</p>"
            />
          )}
          {mode === "text" && (
            <textarea
              className="flow-rte-plain"
              value={textDraft}
              onChange={(e) => {
                const v = e.target.value;
                setTextDraft(v);
                const html = plainTextToEmailHtml(v);
                mountedValueRef.current = html;
                onChangeRef.current?.(html);
              }}
              spellCheck
              placeholder={placeholder || "Plain text…"}
            />
          )}
          {mode === "visual" && (
            <div
              ref={editorRef}
              className="flow-rte-visual"
              contentEditable
              suppressContentEditableWarning
              data-placeholder={placeholder || "…"}
              onInput={syncVisualFromDom}
              onBlur={handleBlurVisual}
            />
          )}
        </div>
        {helpText && (
          <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>
        )}
      </div>
    </>
  );
});

export default FlowEmailBodyEditor;

function InlineTemplateRow({
  templateAppendLabel,
  templateOptions,
  templateChoice,
  setTemplateChoice,
  templates,
  onPick,
}) {
  return (
    <InlineStack gap="300" blockAlign="end" wrap>
      <Box minWidth="200px" maxWidth="480px" width="100%">
        <Select
          label="Template"
          labelHidden
          options={templateOptions}
          value={templateChoice}
          onChange={setTemplateChoice}
        />
      </Box>
      <Button
        size="slim"
        disabled={!templateChoice}
        onClick={() => {
          const tpl = templates.find((x) => x.id === templateChoice);
          if (tpl) onPick(tpl);
          setTemplateChoice("");
        }}
      >
        {templateAppendLabel}
      </Button>
    </InlineStack>
  );
}
