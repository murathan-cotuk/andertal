"use client";

import React, { useState, useEffect } from "react";
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
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--footer-text, #ffffff);
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

  return (
    <FooterContainer className="site-footer">
      <Container>
        {footerColumns.length > 0 && (
          <Grid $columns={4}>
            {footerColumns.map(({ location, menu, items }) => (
              <Column key={location}>
                <Title>{menu?.name || " "}</Title>
                {items.length > 0 ? (
                  items.map((item) => (
                    <FooterLink key={item.id} href={menuItemHref(item)}>{item.label}</FooterLink>
                  ))
                ) : (
                  menu ? <Placeholder>Keine Einträge</Placeholder> : null
                )}
              </Column>
            ))}
          </Grid>
        )}
        <Bottom>
          <Copyright>© {new Date().getFullYear()} Belucha. All rights reserved.</Copyright>
          <FooterLink href={process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || "https://belucha-sellercentral.vercel.app"}>
            Für Händler
          </FooterLink>
        </Bottom>
      </Container>
    </FooterContainer>
  );
}

