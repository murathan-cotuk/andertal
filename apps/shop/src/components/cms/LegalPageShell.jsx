"use client";

/**
 * Text pages (Impressum, AGB, Datenschutz …) in the "Warmer Marktplatz" layout:
 * breadcrumb, a side card with the footer menu that links to this page, and the text in a white card.
 */

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { menuItemHref } from "@/lib/shop-menu-href";

const FOOTER_LOCATIONS = ["footer1", "footer2", "footer3", "footer4"];

const Wrap = styled.div`
  max-width: 1360px;
  margin: 0 auto;
  padding: 18px 24px 72px;
  box-sizing: border-box;
  @media (max-width: 767px) {
    padding: 12px 12px 48px;
  }
`;

const Crumbs = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #5e574e;
  margin-bottom: 26px;
  a {
    color: #5e574e;
    text-decoration: none;
  }
  b {
    color: var(--body-color, #1d1b18);
    font-weight: 600;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 40px;
  align-items: flex-start;
  @media (max-width: 1023px) {
    flex-direction: column;
    gap: 16px;
  }
`;

const SideNav = styled.nav`
  width: 308px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 20px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  .side-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #5e574e;
    padding: 8px 14px;
  }
  a {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    font-size: 15px;
    color: var(--body-color, #1d1b18);
    text-decoration: none;
  }
  a:hover {
    background: #f6f2ec;
  }
  a[aria-current="page"] {
    background: var(--body-color, #1d1b18);
    color: #fff;
    font-weight: 700;
  }
  @media (max-width: 1023px) {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    padding: 0;
    gap: 8px;
    background: transparent;
    border-radius: 0;
    a {
      flex-shrink: 0;
      min-height: 36px;
      border-radius: 999px;
      background: #fff;
      white-space: nowrap;
    }
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
    .side-title {
      display: none;
    }
    a {
      flex-shrink: 0;
      min-height: 38px;
      white-space: nowrap;
    }
  }
`;

const Article = styled.article`
  flex: 1;
  min-width: 0;
  max-width: 932px;
  background: #fff;
  border-radius: 24px;
  padding: 48px 56px;
  box-sizing: border-box;
  .legal-updated {
    font-size: 13px;
    color: #5e574e;
  }
  h1 {
    margin: 8px 0 24px;
    font-family: var(--h1-ff, inherit);
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.05;
  }
  .legal-body h2 {
    font-family: var(--h2-ff, inherit);
    font-size: 22px;
    font-weight: 800;
    margin: 32px 0 10px;
  }
  .legal-body h3 {
    font-size: 17px;
    font-weight: 700;
    margin: 24px 0 8px;
  }
  .legal-body p,
  .legal-body ul,
  .legal-body ol {
    margin: 0 0 10px;
    line-height: 1.7;
    color: #3a352f;
    font-size: 16px;
  }
  .legal-body a {
    color: var(--shop-accent, #a65300);
    text-decoration: underline;
  }
  .legal-body > *:first-child {
    margin-top: 0;
  }
  .legal-help {
    margin-top: 32px;
    padding: 20px 24px;
    border-radius: 16px;
    background: #fcebd5;
    font-size: 15px;
    line-height: 1.6;
  }
  .legal-help a {
    font-weight: 700;
    color: #8a4600;
    text-decoration: underline;
  }
  @media (max-width: 767px) {
    padding: 24px 20px;
    border-radius: 18px;
  }
`;

export default function LegalPageShell({ slug, title, html, hero = "", updatedAt = null }) {
  const tUi = useTranslations("shopUi");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store-menus?locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const menus = (data?.menus || []).filter((m) => FOOTER_LOCATIONS.includes(String(m.location || "").toLowerCase().trim()));
        const withItems = menus.map((m) => ({ ...m, items: (m.items || []).filter((i) => !i.parent_id) }));
        const own = withItems.find((m) => m.items.some((i) => menuItemHref(i) === `/pages/${slug}`));
        const legal = own || withItems.find((m) => String(m.location).toLowerCase() === "footer4") || null;
        setMenu(legal && legal.items.length ? legal : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale, slug]);

  const updated = updatedAt ? new Date(updatedAt) : null;
  const updatedLabel = updated && !Number.isNaN(updated.getTime())
    ? updated.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" })
    : "";

  return (
    <Wrap>
      <Crumbs data-breadcrumb="" aria-label={tUi("breadcrumb")}>
        <Link href="/">{tCommon("home")}</Link>
        <span aria-hidden="true">›</span>
        <b>{title}</b>
      </Crumbs>
      <Row>
        {menu ? (
          <SideNav aria-label={menu.name || title}>
            {menu.name ? <span className="side-title">{menu.name}</span> : null}
            {menu.items.map((item) => {
              const href = menuItemHref(item);
              return (
                <Link key={item.id} href={href} aria-current={href === `/pages/${slug}` ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </SideNav>
        ) : null}
        <Article>
          {updatedLabel ? <span className="legal-updated">{tCommon("lastUpdated", { date: updatedLabel })}</span> : null}
          <h1>{title}</h1>
          {hero ? <img src={hero} alt="" style={{ width: "100%", borderRadius: 16, marginBottom: 24, display: "block" }} /> : null}
          {html ? <div className="legal-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
          <div className="legal-help">
            {tCommon("legalHelp")} <Link href="/pages/customer-support">{tCommon("legalHelpLink")}</Link>
          </div>
        </Article>
      </Row>
    </Wrap>
  );
}
