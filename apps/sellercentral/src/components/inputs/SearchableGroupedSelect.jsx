"use client";

import { useMemo, useState, useCallback } from "react";
import { Autocomplete, Icon } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

/**
 * Like SearchableSelect, but for option lists that are naturally grouped (pages by
 * type, categories by tree, …) where flattening + alphabetizing would destroy the
 * structure the user relies on to find things. Renders each group as its own
 * Autocomplete section (with a title), keeps each group's given order, and searches
 * across all of them at once — matching sections collapse to just their hits.
 *
 * @param {{
 *   label: string, labelHidden?: boolean,
 *   sections: Array<{ title: string, options: Array<{ label: string, value: string, sublabel?: string }> }>,
 *   value: string, onChange: (value: string) => void,
 *   placeholder?: string, emptyLabel?: string,
 * }} props
 */
export default function SearchableGroupedSelect({
  label,
  labelHidden = false,
  sections,
  value,
  onChange,
  placeholder,
  emptyLabel = "— Select —",
}) {
  const cleanSections = useMemo(
    () => (sections || []).filter((s) => Array.isArray(s.options) && s.options.length > 0),
    [sections],
  );
  const selected = useMemo(() => {
    for (const s of cleanSections) {
      const hit = s.options.find((o) => String(o.value) === String(value));
      if (hit) return hit;
    }
    return null;
  }, [cleanSections, value]);
  const [input, setInput] = useState(selected?.label || "");
  const [focused, setFocused] = useState(false);

  const filteredSections = useMemo(() => {
    const needle = input.trim().toLowerCase();
    const useAll = !needle || (selected && input === selected.label);
    return cleanSections
      .map((s) => ({
        title: s.title,
        options: (useAll
          ? s.options
          : s.options.filter((o) =>
              String(o.label || "").toLowerCase().includes(needle) ||
              String(o.sublabel || "").toLowerCase().includes(needle) ||
              String(o.value || "").toLowerCase().includes(needle),
            )
        ).slice(0, 200).map((o) => ({
          value: String(o.value),
          label: o.sublabel ? `${o.label} — ${o.sublabel}` : o.label,
        })),
      }))
      .filter((s) => s.options.length > 0);
  }, [cleanSections, input, selected]);

  const handleSelect = useCallback((chosen) => {
    const id = chosen?.[0] ?? "";
    onChange(id);
    for (const s of cleanSections) {
      const opt = s.options.find((o) => String(o.value) === String(id));
      if (opt) { setInput(opt.label || ""); return; }
    }
    setInput("");
  }, [onChange, cleanSections]);

  const handleInputChange = useCallback((v) => {
    setInput(v);
    if (v === "") onChange("");
  }, [onChange]);

  const textField = (
    <Autocomplete.TextField
      label={label}
      labelHidden={labelHidden}
      value={focused || input ? input : (selected?.label || "")}
      onChange={handleInputChange}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (!input.trim()) setInput(selected?.label || ""); }}
      prefix={<Icon source={SearchIcon} />}
      placeholder={placeholder || emptyLabel}
      autoComplete="off"
    />
  );

  return (
    <Autocomplete
      options={filteredSections}
      selected={selected ? [String(selected.value)] : []}
      onSelect={handleSelect}
      textField={textField}
      listTitle={label}
    />
  );
}
