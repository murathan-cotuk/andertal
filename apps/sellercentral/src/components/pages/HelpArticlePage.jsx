"use client";

import { useLocale, useTranslations } from "next-intl";
import { Page, Card, Text, BlockStack, Box } from "@shopify/polaris";
import { Link } from "@/i18n/navigation";
import { HELP_ARTICLES, HELP_CATEGORIES, helpLocaleBody, helpLocaleText } from "@/lib/help-articles";

const ORANGE = "#ff971c";

function Block({ block }) {
  if (block.type === "h2") {
    return <Text as="h2" variant="headingMd">{block.text}</Text>;
  }
  if (block.type === "p") {
    return <Text as="p">{block.text}</Text>;
  }
  if (block.type === "ul") {
    return (
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, listStyleType: "disc" }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ fontSize: 14, color: "#1f2937", lineHeight: 1.55, display: "list-item" }}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "note") {
    const isWarning = block.variant === "warning";
    return (
      <div
        style={{
          borderRadius: 10,
          padding: "12px 16px",
          background: isWarning ? "#fffbeb" : "#eff6ff",
          border: `1px solid ${isWarning ? "#fde68a" : "#bfdbfe"}`,
          fontSize: 13.5,
          color: isWarning ? "#92400e" : "#1e40af",
          lineHeight: 1.55,
        }}
      >
        {isWarning ? "⚠️ " : "💡 "}{block.text}
      </div>
    );
  }
  return null;
}

export default function HelpArticlePage({ slug }) {
  const locale = useLocale();
  const t = useTranslations("helpCenter");
  const article = HELP_ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    return (
      <Page fullWidth>
        <Card>
          <Box padding="600">
            <BlockStack gap="300">
              <Text as="p" tone="subdued" alignment="center">{t("noResults")}</Text>
              <Box>
                <Link href="/help" style={{ color: ORANGE, fontWeight: 600, fontSize: 14 }}>&larr; {t("back")}</Link>
              </Box>
            </BlockStack>
          </Box>
        </Card>
      </Page>
    );
  }

  const title = helpLocaleText(article.title, locale);
  const body = helpLocaleBody(article, locale);
  const category = HELP_CATEGORIES.find((c) => c.id === article.category);
  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, 4);

  return (
    <Page fullWidth>
      <Box paddingBlockEnd="300">
        <Link href="/help" style={{ color: "#6b7280", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
          &larr; {t("back")}
        </Link>
      </Box>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 24, alignItems: "flex-start" }}>
        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <BlockStack gap="150">
                {category && (
                  <Text as="span" tone="subdued" variant="bodySm">
                    {category.icon} {helpLocaleText(category.label, locale)}
                  </Text>
                )}
                <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                  {article.icon} {title}
                </div>
              </BlockStack>
              <BlockStack gap="300">
                {body.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>

        {related.length > 0 && (
          <div style={{ position: "sticky", top: 16 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">{category ? helpLocaleText(category.label, locale) : ""}</Text>
                  <BlockStack gap="200">
                    {related.map((a) => (
                      <Link
                        key={a.slug}
                        href={`/help/${a.slug}`}
                        style={{ fontSize: 13, color: "#374151", textDecoration: "none", display: "block", lineHeight: 1.4 }}
                      >
                        {a.icon} {helpLocaleText(a.title, locale)}
                      </Link>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
