"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";

function slugify(s) {
  return (s || "")
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
function menuItemHref(item) {
  if (!item) return "#";
  const raw = item.link_value;
  let value = raw;
  let parsed = null;
  const itemSlug = String(item.slug || "").trim();
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try { parsed = JSON.parse(raw); } catch (_) {}
  }
  if (item.link_type === "page") {
    const labelSlug = itemSlug || parsed?.label_slug || slugify(item.label);
    return labelSlug ? `/${labelSlug}` : "#";
  }
  if (item.link_type === "api") {
    const fn = String(parsed?.function || parsed?.api_function || value || "").trim().toLowerCase();
    if (fn === "brand" || fn === "marke" || fn === "brands") return "/brands";
    if (fn === "sales") return "/sales";
    if (fn === "neuheiten") return "/neuheiten";
    if (fn === "bestsellers") return "/bestsellers";
    return "#";
  }
  if (parsed) {
    if (itemSlug) value = itemSlug;
    else if (parsed.handle) value = parsed.handle;
    else if (parsed.slug) value = parsed.slug;
  } else if (itemSlug) {
    value = itemSlug;
  }
  if (item.link_type === "url" && value) return String(value).startsWith("http") ? value : `/${String(value).replace(/^\//, "")}`;
  if ((item.link_type === "category" || item.link_type === "collection") && value) return `/${value}`;
  if (item.link_type === "product" && value) return `/produkt/${value}`;
  return value ? `/${String(value).replace(/^\//, "")}` : "#";
}

const FooterContainer = styled.footer`
  background-color: var(--footer-bg, #136761);
  color: var(--footer-text, #ffffff);
  padding: 48px 0 24px;
  margin-top: auto;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$columns || 4}, 1fr);
  gap: 32px;
  margin-bottom: 32px;
  @media (max-width: 767px) {
    display: block;
    margin-bottom: 0;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 767px) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--footer-text, #ffffff);
`;

const AccordionHeader = styled.button`
  display: none;
  @media (max-width: 767px) {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    padding: 16px 0;
    color: var(--footer-text, #ffffff);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    -webkit-tap-highlight-color: transparent;
  }
`;

const AccordionChevron = styled.span`
  display: inline-block;
  transition: transform 0.25s ease;
  transform: ${(p) => (p.$open ? "rotate(180deg)" : "rotate(0deg)")};
  font-style: normal;
  font-size: 12px;
  flex-shrink: 0;
`;

const AccordionLinks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 767px) {
    display: block;
    overflow: hidden;
    max-height: ${(p) => (p.$open ? "400px" : "0")};
    transition: max-height 0.3s ease;
    padding-bottom: ${(p) => (p.$open ? "12px" : "0")};
  }
`;

const DesktopTitle = styled(Title)`
  @media (max-width: 767px) {
    display: none;
  }
`;

const FooterLink = styled(Link)`
  color: var(--footer-text, #ffffff);
  font-size: 14px;
  transition: color 0.2s ease;

  &:hover {
    color: var(--footer-text, #ffffff);
    opacity: 0.9;
  }
`;

const Placeholder = styled.div`
  color: var(--footer-text, #ffffff);
  font-size: 14px;
`;

const LogoPlaceholder = styled(Link)`
  color: var(--footer-text, #ffffff);
  opacity: 0.95;
  font-weight: 700;
  font-size: 18px;
  text-decoration: none;

  &:hover {
    opacity: 1;
    color: var(--footer-text, #ffffff);
  }
`;

const Bottom = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding-top: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Copyright = styled.p`
  color: var(--footer-text, #ffffff);
  font-size: 14px;
`;

const FOOTER_LOCATIONS = ["footer1", "footer2", "footer3", "footer4"];

export default function Footer() {
  const [footerColumns, setFooterColumns] = useState([]);
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    fetch("/api/store-menus")
      .then((r) => r.json())
      .then((data) => {
        const menus = data.menus || [];
        const columns = FOOTER_LOCATIONS.map((loc) => {
          const menu = menus.find((m) => (m.location || "").toLowerCase().trim() === loc.toLowerCase());
          if (!menu) return { location: loc, menu: null, items: [] };
          const items = (menu.items || []).filter((i) => !i.parent_id);
          return { location: loc, menu, items };
        });
        setFooterColumns(columns);
      })
      .catch(() => setFooterColumns([]));
  }, []);

  const toggle = useCallback((loc) => {
    setOpenSections((prev) => ({ ...prev, [loc]: !prev[loc] }));
  }, []);

  return (
    <FooterContainer className="site-footer">
      <Container>
        {footerColumns.length > 0 && (
          <Grid $columns={4}>
            {footerColumns.map(({ location, menu, items }) => {
              const isOpen = !!openSections[location];
              const name = menu?.name || " ";
              return (
                <Column key={location}>
                  {/* Desktop: plain title */}
                  <DesktopTitle>{name}</DesktopTitle>

                  {/* Mobile: accordion toggle */}
                  <AccordionHeader
                    type="button"
                    onClick={() => toggle(location)}
                    aria-expanded={isOpen}
                  >
                    <span>{name}</span>
                    <AccordionChevron $open={isOpen} aria-hidden>▾</AccordionChevron>
                  </AccordionHeader>

                  <AccordionLinks $open={isOpen}>
                    {items.length > 0 ? (
                      items.map((item) => (
                        <FooterLink key={item.id} href={menuItemHref(item)}>{item.label}</FooterLink>
                      ))
                    ) : (
                      menu ? <Placeholder>Keine Einträge</Placeholder> : null
                    )}
                  </AccordionLinks>
                </Column>
              );
            })}
          </Grid>
        )}
        <Bottom style={{ marginTop: 24 }}>
          <Copyright>© {new Date().getFullYear()} Belucha. All rights reserved.</Copyright>
        </Bottom>
      </Container>
    </FooterContainer>
  );
}

