"use client";

import { useState, useEffect, useRef } from "react";
import { Text } from "@shopify/polaris";

function visualToHtml(html) {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(p|div|h[1-6]|ul|ol|li)\b/i.test(s)) return s;
  return "<p>" + s + "</p>";
}

const STYLES = `
  .rte-wrap { border: 1px solid var(--p-color-border); border-radius: 8px; overflow: hidden; background: var(--p-color-bg-surface); }
  .rte-wrap:focus-within { border-color: var(--p-color-border-focus, #005bd3); box-shadow: 0 0 0 2px rgba(0,91,211,.12); }
  .rte-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); gap: 4px; flex-wrap: wrap; }
  .rte-toolbar-left { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
  .rte-btn { width: 30px; height: 30px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
  .rte-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
  .rte-btn.active { background: var(--p-color-bg-surface-selected); color: var(--p-color-text); }
  .rte-btn svg { width: 15px; height: 15px; }
  .rte-divider { width: 1px; height: 18px; background: var(--p-color-border); margin: 0 3px; flex-shrink: 0; }
  .rte-html-btn { width: 30px; height: 30px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .rte-html-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
  .rte-html-btn.active { background: var(--p-color-bg-surface-selected); color: var(--p-color-text); }
  .rte-html-btn svg { width: 15px; height: 15px; }
  .rte-visual { outline: none; padding: 14px; font-size: 14px; line-height: 1.6; color: var(--p-color-text); min-height: var(--rte-min-height, 160px); }
  .rte-visual:empty:before { content: attr(data-placeholder); color: var(--p-color-text-subdued); pointer-events: none; }
  .rte-visual p { margin: 0 0 0.5em; } .rte-visual p:last-child { margin-bottom: 0; }
  .rte-visual h1 { font-size: 1.6rem; font-weight: 700; margin: 0.7em 0 0.3em; }
  .rte-visual h2 { font-size: 1.35rem; font-weight: 700; margin: 0.65em 0 0.3em; }
  .rte-visual h3 { font-size: 1.15rem; font-weight: 600; margin: 0.6em 0 0.25em; }
  .rte-visual ul, .rte-visual ol { margin: 0.4em 0 0.6em 1.5em; padding-left: 1.5em; }
  .rte-visual ul { list-style-type: disc; } .rte-visual ol { list-style-type: decimal; }
  .rte-visual li { margin-bottom: 0.2em; }
  .rte-visual strong { font-weight: 600; }
  .rte-visual em { font-style: italic; }
  .rte-visual u { text-decoration: underline; }
  .rte-html { width: 100%; padding: 14px; font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 12.5px; line-height: 1.55; color: var(--p-color-text); background: var(--p-color-bg-surface-secondary); border: none; resize: vertical; box-sizing: border-box; outline: none; min-height: var(--rte-min-height, 160px); }
  .rte-html::placeholder { color: var(--p-color-text-subdued); }
`;

/**
 * Reusable WYSIWYG / HTML editor.
 * Props:
 *   label      – string shown above the editor
 *   value      – controlled HTML string
 *   onChange   – (htmlString) => void
 *   minHeight  – CSS value, default "160px"
 *   placeholder – shown when editor is empty (visual mode)
 *   helpText   – shown below editor
 */
export default function RichTextEditor({
  label,
  value = "",
  onChange,
  minHeight = "160px",
  placeholder = "Text eingeben…",
  helpText,
}) {
  const [mode, setMode] = useState("visual");
  const editorRef = useRef(null);
  const mountedValueRef = useRef(null); // tracks last value we wrote into innerHTML

  // On mount: set innerHTML
  useEffect(() => {
    if (editorRef.current && mountedValueRef.current !== value) {
      editorRef.current.innerHTML = value || "";
      mountedValueRef.current = value;
    }
  }, []);

  // When switching to visual: restore innerHTML from current value prop
  useEffect(() => {
    if (mode === "visual" && editorRef.current) {
      editorRef.current.innerHTML = value || "";
      mountedValueRef.current = value;
    }
  }, [mode]);

  // If value changes externally while in visual mode (e.g. container switch), resync
  useEffect(() => {
    if (mode === "visual" && editorRef.current && value !== mountedValueRef.current) {
      editorRef.current.innerHTML = value || "";
      mountedValueRef.current = value;
    }
  }, [value, mode]);

  const exec = (cmd, arg) => {
    document.execCommand(cmd, false, arg ?? null);
    editorRef.current?.focus();
  };

  const handleBlur = () => {
    if (editorRef.current) {
      const html = visualToHtml(editorRef.current.innerHTML || "");
      mountedValueRef.current = html;
      onChange?.(html);
    }
  };

  const toggleMode = () => {
    if (mode === "visual") {
      // visual → html: flush visual content first
      if (editorRef.current) {
        const html = visualToHtml(editorRef.current.innerHTML || "");
        mountedValueRef.current = html;
        onChange?.(html);
      }
      setMode("html");
    } else {
      // html → visual: value prop is already updated (textarea is controlled)
      setMode("visual");
    }
  };

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {label && (
          <Text as="span" variant="bodyMd" fontWeight="medium">{label}</Text>
        )}
        <div className="rte-wrap" style={{ "--rte-min-height": minHeight }}>
          {/* Toolbar */}
          <div className="rte-toolbar">
            <div className="rte-toolbar-left">
              {mode === "visual" && (
                <>
                  {/* Bold */}
                  <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title="Fett">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h4.5a3.501 3.501 0 0 1 2.852 5.53A3.499 3.499 0 0 1 9 14H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1m1 5.5h3.5a1.5 1.5 0 0 0 0-3H5zm0 2V12h4a1.5 1.5 0 0 0 0-3H5z"/></svg>
                  </button>
                  {/* Italic */}
                  <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title="Kursiv">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 2.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H9.906l-2.273 10h2.117a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5h2.345l2.272-10H8.25a.75.75 0 0 1-.75-.75"/></svg>
                  </button>
                  {/* Underline */}
                  <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} title="Unterstrichen">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.25 1.75a.75.75 0 0 0-1.5 0v6a4.25 4.25 0 0 0 8.5 0v-6a.75.75 0 0 0-1.5 0v6a2.75 2.75 0 1 1-5.5 0z"/><path d="M2.75 13.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5z"/></svg>
                  </button>
                  <span className="rte-divider" aria-hidden />
                  {/* H2 */}
                  <button type="button" className="rte-btn" style={{ width: 36, fontSize: 11 }} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); }} title="Überschrift 2">H2</button>
                  {/* H3 */}
                  <button type="button" className="rte-btn" style={{ width: 36, fontSize: 11 }} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h3"); }} title="Überschrift 3">H3</button>
                  <span className="rte-divider" aria-hidden />
                  {/* Bullet list */}
                  <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} title="Aufzählung">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/><path d="M2 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/><path d="M3 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/><path d="M5.25 2.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z"/><path d="M4.5 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 4.5 8"/><path d="M5.25 12.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z"/></svg>
                  </button>
                  {/* Numbered list */}
                  <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }} title="Nummerierte Liste">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 2.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z"/><path d="M5.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z"/><path d="M5 13a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 13"/><path d="M2.25 5.75a1.5 1.5 0 0 0-1.5 1.5.5.5 0 0 0 1 0 .5.5 0 0 1 1 0v.05a.5.5 0 0 1-.168.375l-1.423 1.264c-.515.459-.191 1.311.499 1.311h1.592a.5.5 0 0 0 0-1h-.935l.932-.828c.32-.285.503-.693.503-1.121v-.051a1.5 1.5 0 0 0-1.5-1.5"/></svg>
                  </button>
                </>
              )}
            </div>
            {/* HTML toggle */}
            <button
              type="button"
              className={`rte-html-btn ${mode === "html" ? "active" : ""}`}
              onClick={toggleMode}
              title={mode === "html" ? "Visuell anzeigen" : "HTML anzeigen"}
            >
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.221 2.956a.75.75 0 0 0-1.442-.412l-3 10.5a.75.75 0 0 0 1.442.412z"/><path d="M5.03 4.22a.75.75 0 0 1 0 1.06l-2.72 2.72 2.72 2.72a.749.749 0 1 1-1.06 1.06l-3.25-3.25a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0"/><path d="M10.97 11.78a.75.75 0 0 1 0-1.06l2.72-2.72-2.72-2.72a.749.749 0 1 1 1.06-1.06l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0"/></svg>
            </button>
          </div>

          {/* Editor area */}
          {mode === "html" ? (
            <textarea
              className="rte-html"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              spellCheck={false}
              placeholder="<p>HTML…</p>"
            />
          ) : (
            <div
              ref={editorRef}
              className="rte-visual"
              contentEditable
              suppressContentEditableWarning
              data-placeholder={placeholder}
              onBlur={handleBlur}
            />
          )}
        </div>
        {helpText && (
          <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>
        )}
      </div>
    </>
  );
}
