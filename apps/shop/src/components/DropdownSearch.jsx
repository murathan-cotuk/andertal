"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import { InstantSearch, useSearchBox, useHits, useInstantSearch, Configure } from "react-instantsearch";
import styled from "styled-components";

const Wrap = styled.div`
  position: relative;
  width: 100%;
`;

const InputWrap = styled.div`
  position: relative;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  pointer-events: none;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px 12px 48px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  max-height: ${(p) => p.$maxHeight || "300px"};
  overflow-y: auto;
  z-index: 1000;
`;

const HitLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: #374151;
  text-decoration: none;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #f3f4f6;

  &:hover {
    background-color: #f3f4f6;
    color: #0ea5e9;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const HitImage = styled.img`
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
`;

const HitText = styled.div`
  flex: 1;
  min-width: 0;
`;

const Primary = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const Secondary = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
`;

const Tertiary = styled.div`
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
`;

const Empty = styled.div`
  padding: 24px 16px;
  color: #6b7280;
  font-size: 14px;
  text-align: center;
`;

function getByPath(obj, path) {
  if (!path || !obj) return undefined;
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function SearchInputWithDropdown({
  placeholder = "Search...",
  hitsPerPage = 5,
  attributes = {},
  maxHeight = "300px",
  className,
}) {
  const { query, refine } = useSearchBox();
  const { hits, results } = useHits();
  const { status } = useInstantSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapRef = useRef(null);

  const showDropdown = query.length > 0;
  const loading = status === "loading" || status === "stalled";

  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, hits.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    setIsOpen(showDropdown);
  }, [showDropdown]);

  const handleKeyDown = (e) => {
    if (!showDropdown || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i < hits.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i > 0 ? i - 1 : hits.length - 1));
    } else if (e.key === "Enter" && focusedIndex >= 0 && hits[focusedIndex]) {
      e.preventDefault();
      const hit = hits[focusedIndex];
      const urlPath = getByPath(hit, attributes.url || "url");
      if (urlPath) window.location.href = typeof urlPath === "string" ? (urlPath.startsWith("/") ? urlPath : `/product/${urlPath}`) : "#";
    }
  };

  const primaryKey = attributes.primaryText || "title";
  const secondaryKey = attributes.secondaryText;
  const tertiaryKey = attributes.tertiaryText;
  const urlKey = attributes.url || "url";
  const imageKey = attributes.image;

  return (
    <Wrap className={className} ref={wrapRef} onKeyDown={handleKeyDown}>
      <Configure hitsPerPage={hitsPerPage} />
      <InputWrap>
        <SearchIcon aria-hidden>🔍</SearchIcon>
        <Input
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => refine(e.target.value)}
          aria-expanded={showDropdown}
          aria-controls="search-hits"
        />
      </InputWrap>
      {showDropdown && (
        <Dropdown id="search-hits" $maxHeight={maxHeight} role="listbox">
          {loading && hits.length === 0 && <Empty>Searching...</Empty>}
          {!loading && hits.length === 0 && <Empty>No results for &quot;{query}&quot;</Empty>}
          {hits.map((hit, i) => {
            const url = getByPath(hit, urlKey);
            const link = url && (String(url).startsWith("/") ? url : `/product/${url}`);
            return (
              <HitLink
                key={hit.objectID || i}
                href={link || "#"}
                role="option"
                aria-selected={focusedIndex === i}
                $focused={focusedIndex === i}
                onClick={() => refine("")}
              >
                {imageKey && getByPath(hit, imageKey) && (
                  <HitImage src={getByPath(hit, imageKey)} alt="" />
                )}
                <HitText>
                  <Primary>{getByPath(hit, primaryKey) || "(No title)"}</Primary>
                  {secondaryKey && getByPath(hit, secondaryKey) && (
                    <Secondary>{getByPath(hit, secondaryKey)}</Secondary>
                  )}
                  {tertiaryKey && getByPath(hit, tertiaryKey) && (
                    <Tertiary>{getByPath(hit, tertiaryKey)}</Tertiary>
                  )}
                </HitText>
              </HitLink>
            );
          })}
        </Dropdown>
      )}
    </Wrap>
  );
}

export default function DropdownSearch({
  applicationId,
  apiKey,
  indexName,
  placeholder = "Search...",
  hitsPerPage = 5,
  attributes = {},
  className,
  maxHeight = "300px",
}) {
  const appId = applicationId || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = apiKey || process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  const index = indexName || process.env.NEXT_PUBLIC_ALGOLIA_INDEX_PRODUCTS;

  if (!appId || !key || !index) {
    return (
      <Wrap>
        <InputWrap>
          <SearchIcon aria-hidden>🔍</SearchIcon>
          <Input type="search" placeholder={placeholder} disabled />
        </InputWrap>
      </Wrap>
    );
  }

  const searchClient = algoliasearch(appId, key);

  return (
    <InstantSearch searchClient={searchClient} indexName={index}>
      <SearchInputWithDropdown
        placeholder={placeholder}
        hitsPerPage={hitsPerPage}
        attributes={attributes}
        maxHeight={maxHeight}
        className={className}
      />
    </InstantSearch>
  );
}
