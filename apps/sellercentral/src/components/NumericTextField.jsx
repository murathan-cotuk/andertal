"use client";

import { useEffect, useRef, useState } from "react";
import { TextField } from "@shopify/polaris";

/** Keep only digits (and optional single leading minus for signed integers). */
export function sanitizeIntegerDraft(raw, { signed = false } = {}) {
  let s = String(raw ?? "");
  let out = "";
  let i = 0;
  if (signed && s.startsWith("-")) {
    out = "-";
    i = 1;
  }
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

function parseIntegerDraft(raw) {
  const s = String(raw ?? "").trim();
  if (s === "" || s === "-") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(n, min, max) {
  let out = n;
  if (min != null && Number.isFinite(min)) out = Math.max(min, out);
  if (max != null && Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

/**
 * Controlled numeric TextField that keeps a local draft while typing.
 * Avoids type="number" + immediate parse/clamp fighting mid-edit (e.g. 80 → 30).
 */
export function NumericTextField({
  value,
  onChange,
  min,
  max,
  fallback,
  allowEmpty = false,
  signed = false,
  autoComplete = "off",
  onBlur: onBlurProp,
  ...rest
}) {
  const [draft, setDraft] = useState(null);
  const focusedRef = useRef(false);

  const storedText =
    value == null || value === ""
      ? ""
      : String(value);

  useEffect(() => {
    if (!focusedRef.current) setDraft(null);
  }, [storedText]);

  const displayValue = draft !== null ? draft : storedText;

  const commit = (raw) => {
    const cleaned = sanitizeIntegerDraft(raw, { signed });
    if (cleaned === "" || cleaned === "-") {
      if (allowEmpty) {
        onChange(null);
        return;
      }
      onChange(fallback != null ? fallback : min != null ? min : 0);
      return;
    }
    let n = parseIntegerDraft(cleaned);
    if (n == null) {
      onChange(fallback != null ? fallback : min != null ? min : 0);
      return;
    }
    n = clampNumber(n, min, max);
    onChange(n);
  };

  return (
    <TextField
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      value={displayValue}
      onFocus={(e) => {
        focusedRef.current = true;
        setDraft(storedText);
        rest.onFocus?.(e);
      }}
      onChange={(v) => {
        setDraft(sanitizeIntegerDraft(v, { signed }));
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        commit(draft !== null ? draft : storedText);
        setDraft(null);
        onBlurProp?.(e);
      }}
    />
  );
}

/** Compact native input variant for tight grids (e.g. padding boxes). */
export function NumericInput({
  value,
  onChange,
  min,
  max,
  fallback = 0,
  allowEmpty = false,
  style,
  className,
  ...rest
}) {
  const [draft, setDraft] = useState(null);
  const focusedRef = useRef(false);

  const storedText = value == null || value === "" ? "" : String(value);

  useEffect(() => {
    if (!focusedRef.current) setDraft(null);
  }, [storedText]);

  const displayValue = draft !== null ? draft : storedText;

  const commit = (raw) => {
    const cleaned = sanitizeIntegerDraft(raw);
    if (cleaned === "") {
      onChange(allowEmpty ? null : fallback);
      return;
    }
    const parsed = parseIntegerDraft(cleaned);
    if (parsed == null) {
      onChange(fallback);
      return;
    }
    onChange(clampNumber(parsed, min, max));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      style={style}
      value={displayValue}
      onFocus={(e) => {
        focusedRef.current = true;
        setDraft(storedText);
        rest.onFocus?.(e);
      }}
      onChange={(e) => setDraft(sanitizeIntegerDraft(e.target.value))}
      onBlur={(e) => {
        focusedRef.current = false;
        commit(draft !== null ? draft : storedText);
        setDraft(null);
        rest.onBlur?.(e);
      }}
    />
  );
}
