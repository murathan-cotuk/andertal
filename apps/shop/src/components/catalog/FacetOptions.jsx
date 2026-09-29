"use client";

import React from "react";
import styled from "styled-components";
import { colorSwatchFallback } from "@/lib/color-swatch";
import CustomCheckbox from "@/components/ui/CustomCheckbox";

/** Colour facets render as swatches, size-like facets as pills, everything else as checkboxes. */
export function facetDisplayKind(key, title) {
  const k = `${key} ${title}`.toLowerCase();
  if (/farbe|colou?r|renk|couleur|colore/.test(k)) return "color";
  if (/gr(ö|oe)(ß|ss)e|size|beden|taille|taglia|talla|ma(ß|ss)e/.test(k)) return "size";
  return "list";
}

const Swatches = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 4px 2px;
  button {
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
`;

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  button {
    height: 34px;
    padding: 0 12px;
    border-radius: 17px;
    border: 1px solid #cfc6b8;
    background: #fff;
    font: inherit;
    font-size: 13px;
    color: var(--body-color, #1d1b18);
    cursor: pointer;
  }
  button[data-on="true"] {
    border-color: var(--body-color, #1d1b18);
    background: var(--body-color, #1d1b18);
    color: #fff;
    font-weight: 600;
  }
`;

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  font-size: 14px;
  cursor: pointer;
`;

/**
 * @param {{ kind: "color"|"size"|"list", values: string[], selected: string[], label: (v: string) => string, onToggle: (v: string) => void }} props
 */
export default function FacetOptions({ kind, values, selected, label, onToggle, checkboxSize = 14 }) {
  const isOn = (v) => (selected || []).includes(v);
  if (kind === "color") {
    return (
      <Swatches>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            title={label(v)}
            aria-label={label(v)}
            aria-pressed={isOn(v)}
            onClick={() => onToggle(v)}
            style={{ background: colorSwatchFallback(v), boxShadow: isOn(v) ? "0 0 0 2px #fff, 0 0 0 3.5px #1d1b18" : "inset 0 0 0 1px #cfc6b8" }}
          />
        ))}
      </Swatches>
    );
  }
  if (kind === "size") {
    return (
      <Pills>
        {values.map((v) => (
          <button key={v} type="button" aria-pressed={isOn(v)} data-on={isOn(v) ? "true" : "false"} onClick={() => onToggle(v)}>
            {label(v)}
          </button>
        ))}
      </Pills>
    );
  }
  return values.map((v) => (
    <Check key={v}>
      <CustomCheckbox checked={isOn(v)} onChange={() => onToggle(v)} size={checkboxSize} />
      {label(v)}
    </Check>
  ));
}
