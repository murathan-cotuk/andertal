"use client";

import { useMemo, useState, useCallback } from "react";
import { Autocomplete, Icon } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

/**
 * Drop-in replacement for a plain Polaris <Select> when the option list is long
 * (products, pages, categories, …) — adds type-to-filter search and keeps the
 * list alphabetically sorted, instead of forcing the user to scroll a static
 * dropdown to find one entry among hundreds.
 *
 * @param {{
 *   label: string, labelHidden?: boolean,
 *   options: Array<{ label: string, value: string, sublabel?: string }>,
 *   value: string, onChange: (value: string) => void,
 *   placeholder?: string, emptyLabel?: string,
 * }} props
 */
export default function SearchableSelect({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
  placeholder,
  emptyLabel = "— Select —",
}) {
  const sortedOptions = useMemo(
    () => [...(options || [])].sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" })),
    [options],
  );
  const selected = sortedOptions.find((o) => String(o.value) === String(value));
  const [input, setInput] = useState(selected?.label || "");
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    const needle = input.trim().toLowerCase();
    const base = !needle || (selected && input === selected.label)
      ? sortedOptions
      : sortedOptions.filter((o) =>
          String(o.label || "").toLowerCase().includes(needle) ||
          String(o.sublabel || "").toLowerCase().includes(needle),
        );
    return base.slice(0, 200).map((o) => ({ value: String(o.value), label: o.sublabel ? `${o.label} — ${o.sublabel}` : o.label }));
  }, [sortedOptions, input, selected]);

  const handleSelect = useCallback((chosen) => {
    const id = chosen?.[0] ?? "";
    onChange(id);
    const opt = sortedOptions.find((o) => String(o.value) === String(id));
    setInput(opt?.label || "");
  }, [onChange, sortedOptions]);

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
      options={filtered}
      selected={selected ? [String(selected.value)] : []}
      onSelect={handleSelect}
      textField={textField}
      listTitle={label}
    />
  );
}
