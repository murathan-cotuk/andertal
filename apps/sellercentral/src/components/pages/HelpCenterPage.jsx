"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Page, Card, TextField, Text, BlockStack, InlineStack, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { HELP_ARTICLES, HELP_CATEGORIES, helpLocaleText } from "@/lib/help-articles";

const CARD_BORDER = "#e3e5e7";

function ArticleCard({ article, locale }) {
  const title = helpLocaleText(article.title, locale);
  const summary = helpLocaleText(article.summary, locale);
  return (
    <Link href={`/help/${article.slug}`} style={{ textDecoration: "none", display: "block", height: "100%" }}>
      <div
        style={{
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          padding: "18px 20px",
          height: "100%",
          background: "#fff",
          transition: "border-color 0.12s, box-shadow 0.12s",
          boxShadow: "0 1px 2px rgba(16,24,40,0.03)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff971c"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(16,24,40,0.08)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.03)"; }}
      >
        <div style={{ fontSize: 22, marginBottom: 8 }}>{article.icon}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.35 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.5 }}>{summary}</div>
      </div>
    </Link>
  );
}

export default function HelpCenterPage() {
  const locale = useLocale();
  const t = useTranslations("helpCenter");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_ARTICLES.filter((a) => {
      if (activeCategory && a.category !== activeCategory) return false;
      if (!q) return true;
      const title = helpLocaleText(a.title, locale).toLowerCase();
      const summary = helpLocaleText(a.summary, locale).toLowerCase();
      return title.includes(q) || summary.includes(q);
    });
  }, [query, activeCategory, locale]);

  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const cat of HELP_CATEGORIES) byCat.set(cat.id, []);
    for (const a of filtered) {
      if (!byCat.has(a.category)) byCat.set(a.category, []);
      byCat.get(a.category).push(a);
    }
    return byCat;
  }, [filtered]);

  return (
    <Page fullWidth>
      <Box paddingBlockEnd="400">
        <BlockStack gap="100">
          <Text as="h1" variant="headingLg">{t("title")}</Text>
          <Text as="p" tone="subdued">{t("subtitle")}</Text>
        </BlockStack>
      </Box>

      <Card>
        <Box padding="400">
          <TextField
            label={t("searchPlaceholder")}
            labelHidden
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={setQuery}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setQuery("")}
          />
          <Box paddingBlockStart="300">
            <InlineStack gap="200" wrap>
              <CategoryChip
                active={activeCategory === null}
                label={t("allCategories")}
                onClick={() => setActiveCategory(null)}
              />
              {HELP_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  active={activeCategory === cat.id}
                  label={`${cat.icon} ${helpLocaleText(cat.label, locale)}`}
                  onClick={() => setActiveCategory(cat.id)}
                />
              ))}
            </InlineStack>
          </Box>
        </Box>
      </Card>

      <Box paddingBlockStart="500">
        {filtered.length === 0 ? (
          <Card>
            <Box padding="600">
              <Text as="p" tone="subdued" alignment="center">{t("noResults")}</Text>
            </Box>
          </Card>
        ) : (
          <BlockStack gap="500">
            {HELP_CATEGORIES.map((cat) => {
              const articles = grouped.get(cat.id) || [];
              if (!articles.length) return null;
              return (
                <BlockStack gap="300" key={cat.id}>
                  <Text as="h2" variant="headingSm">{cat.icon} {helpLocaleText(cat.label, locale)}</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                    {articles.map((a) => (
                      <ArticleCard key={a.slug} article={a} locale={locale} />
                    ))}
                  </div>
                </BlockStack>
              );
            })}
          </BlockStack>
        )}
      </Box>
    </Page>
  );
}

function CategoryChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "#ff971c" : CARD_BORDER}`,
        background: active ? "#fff7ed" : "#fff",
        color: active ? "#c2410c" : "#374151",
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        borderRadius: 999,
        padding: "6px 14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
