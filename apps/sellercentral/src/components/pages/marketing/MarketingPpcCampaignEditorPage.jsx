"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Spinner,
  Badge,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import {
  PLATFORM_OPTIONS,
  BID_OPTIONS,
  TARGET_OPTIONS,
  SHOP_GOAL_OPTIONS,
  parseCampaignToForm,
  mergeCampaignSettings,
  fmtBudget,
} from "@/components/pages/marketing/ppcCampaignShared";
import { resolveImageUrl } from "@/lib/image-url";

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const VIDEO_MAX_BYTES = 120 * 1024 * 1024;

const shell = {
  pageBg: "#f4f6fb",
  heroGradient: "linear-gradient(135deg, #0b1220 0%, #151f35 42%, #251e45 72%, #312066 100%)",
  heroGlow: "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(99, 102, 241, 0.35), transparent 55%)",
  cardRadius: 18,
  cardShadow: "0 4px 24px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
  accent: "#6366f1",
  accentSoft: "rgba(99, 102, 241, 0.12)",
  border: "1px solid rgba(226, 232, 240, 0.95)",
};

function StepHeader({ step, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 12,
          background: shell.accentSoft,
          border: `1px solid rgba(99, 102, 241, 0.25)`,
          color: "#4338ca",
          fontWeight: 800,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {step}
      </div>
      <div style={{ minWidth: 0 }}>
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {subtitle ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45, maxWidth: 560 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ShopPreviewMock({ name, budgetEuro, goalLabel, targetType, productCount, highlightVideoUrl }) {
  const shopClip = highlightVideoUrl ? resolveImageUrl(highlightVideoUrl) : "";
  return (
    <div
      style={{
        borderRadius: shell.cardRadius,
        border: shell.border,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: shell.cardShadow,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#64748b", textTransform: "uppercase" }}>
          Live-Vorschau im Shop
        </span>
      </div>
      <div style={{ padding: 18 }}>
        {shopClip ? (
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 14,
              aspectRatio: "16/9",
              background: "#0f172a",
              border: "1px solid #e2e8f0",
            }}
          >
            <video src={shopClip} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : null}
        <div
          style={{
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            padding: 14,
            background: "#fff",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: "linear-gradient(145deg, #e0e7ff, #fae8ff)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name || "Deine Kampagne"}
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #fef3c7, #fde68a)",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                }}
              >
                Sponsored
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>{goalLabel}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Tagesbudget</span>
            <strong style={{ color: "#0f172a" }}>{budgetEuro ? `${budgetEuro} €` : "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Zielgruppe</span>
            <strong style={{ color: "#0f172a" }}>
              {targetType === "all" ? "Alle Artikel" : targetType === "groups" ? "Gruppen" : `${productCount} Produkt(e)`}
            </strong>
          </div>
          <div style={{ marginTop: 12 }}>
            <ProgressBar progress={budgetEuro ? 72 : 24} tone="primary" size="small" />
            <span style={{ fontSize: 10, marginTop: 6, display: "block", color: "#94a3b8" }}>
              Höhere Sichtbarkeit bei aktiver Kampagnenfreigabe
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignVideoSlot({
  title,
  badge,
  roleLine,
  specsLine,
  aspectMode,
  url,
  uploading,
  onSelectFile,
  onClear,
}) {
  const inputRef = useRef(null);
  const resolved = url ? resolveImageUrl(url) : "";
  const wide = aspectMode === "169";

  return (
    <div
      style={{
        borderRadius: 18,
        border: shell.border,
        padding: 20,
        background: "linear-gradient(165deg, #fafbff 0%, #ffffff 52%, #f8fafc 100%)",
        boxShadow: shell.cardShadow,
        height: "100%",
      }}
    >
      <InlineStack align="space-between" blockAlign="start" wrap>
        <BlockStack gap="100">
          <Text as="span" variant="headingSm">{title}</Text>
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{roleLine}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>{specsLine}</p>
        </BlockStack>
        <Badge tone="attention">{badge}</Badge>
      </InlineStack>

      <div
        style={{
          marginTop: 16,
          width: "100%",
          ...(wide ? { aspectRatio: "16/9" } : { aspectRatio: "9/16", maxWidth: 240, marginLeft: "auto", marginRight: "auto" }),
          borderRadius: 14,
          overflow: "hidden",
          background: "linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #312e81 120%)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: wide ? 168 : 320,
        }}
      >
        {resolved ? (
          <video
            src={resolved}
            controls
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: wide ? "contain" : "cover",
              display: "block",
              maxHeight: wide ? 320 : 420,
            }}
          />
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{
              width: "100%",
              height: "100%",
              minHeight: wide ? 168 : 320,
              border: "none",
              background: "transparent",
              cursor: uploading ? "wait" : "pointer",
              color: "rgba(248,250,252,0.92)",
              fontSize: 14,
              fontWeight: 650,
              padding: 16,
            }}
          >
            {uploading ? "Wird hochgeladen …" : "+ Video hinzufügen"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f);
          e.target.value = "";
        }}
      />

      <InlineStack gap="300" wrap blockAlign="center">
        <div style={{ marginTop: 14 }}>
          <Button size="slim" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {resolved ? "Video ersetzen" : "Datei wählen"}
          </Button>
        </div>
        {resolved ? (
          <div style={{ marginTop: 14 }}>
            <Button size="slim" tone="critical" variant="plain" disabled={uploading} onClick={onClear}>
              Entfernen
            </Button>
          </div>
        ) : null}
      </InlineStack>
    </div>
  );
}

export default function MarketingPpcCampaignEditorPage({ campaignId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loadedCampaign, setLoadedCampaign] = useState(null);
  const [form, setForm] = useState(() => parseCampaignToForm({}));
  const [productSearch, setProductSearch] = useState("");
  const [videoUploadSlot, setVideoUploadSlot] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    }
  }, []);

  const loadConnectedPlatforms = useCallback(async () => {
    if (!isSuperuser) return;
    try {
      const client = getMedusaAdminClient();
      const d = await client.getMarketingAccounts();
      const active = (d?.accounts || []).filter((a) => a.is_active && Object.keys(a.credentials || {}).some((k) => a.credentials[k]));
      setConnectedPlatforms(active.map((a) => a.platform));
    } catch {
      setConnectedPlatforms([]);
    }
  }, [isSuperuser]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setMsg(null);
    try {
      const client = getMedusaAdminClient();
      const [campRes, gRes, pRes] = await Promise.all([
        client.getCampaign(campaignId),
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
      const c = campRes?.campaign;
      if (!c) {
        setMsg({ tone: "critical", text: "Kampagne nicht gefunden." });
        setLoadedCampaign(null);
        setForm(parseCampaignToForm({}));
        return;
      }
      if (String(c.campaign_type || "").toLowerCase() !== "ppc" && !(c.budget_daily_cents > 0)) {
        setMsg({ tone: "warning", text: "Diese Kampagne ist keine Werbekampagne." });
      }
      setLoadedCampaign(c);
      setForm(parseCampaignToForm(c));
      setGroups(Array.isArray(gRes?.groups) ? gRes.groups : []);
      setProducts(Array.isArray(pRes?.products) ? pRes.products : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadConnectedPlatforms();
  }, [loadConnectedPlatforms]);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const togglePlatform = (val) => {
    setForm((prev) => {
      const set = new Set(prev.ad_platforms);
      if (set.has(val)) set.delete(val); else set.add(val);
      return { ...prev, ad_platforms: Array.from(set) };
    });
  };

  const toggleProduct = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, product_ids: Array.from(ids) };
    });
  };

  const toggleGroup = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.group_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, group_ids: Array.from(ids) };
    });
  };

  const goalLabel = useMemo(() => {
    const g = SHOP_GOAL_OPTIONS.find((o) => o.value === form.seller_shop_goal);
    return g?.label || SHOP_GOAL_OPTIONS[0].label;
  }, [form.seller_shop_goal]);

  const uploadCampaignVideo = async (slot, file) => {
    const okMime = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type || "");
    const okExt = /\.(mp4|webm|mov)$/i.test(file.name || "");
    if (!okMime && !okExt) {
      setMsg({ tone: "warning", text: "Bitte MP4, WebM oder MOV verwenden." });
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      setMsg({ tone: "warning", text: "Video maximal 120 MB." });
      return;
    }
    setVideoUploadSlot(slot);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await getMedusaAdminClient().uploadMedia(fd, { purpose: "campaign_video" });
      const u = r?.url;
      if (!u) throw new Error("Keine URL zurückgegeben.");
      if (slot === "shop") setField("seller_video_shop_url", u);
      else setField("seller_video_reels_url", u);
      setMsg({ tone: "success", text: "Video hochgeladen. Änderungen mit Speichern übernehmen." });
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Upload fehlgeschlagen." });
    } finally {
      setVideoUploadSlot(null);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: "Bitte einen Kampagnennamen eingeben." });
      return;
    }
    const budgetEuro = parseFloat(form.budget_daily_cents);
    if (!form.budget_daily_cents || Number.isNaN(budgetEuro) || budgetEuro <= 0) {
      setMsg({ tone: "warning", text: "Bitte ein gültiges Tagesbudget eingeben (z.B. 5 für 5 €/Tag)." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const client = getMedusaAdminClient();
      const settingsMerged = mergeCampaignSettings(loadedCampaign?.settings, {
        seller_shop_goal: form.seller_shop_goal,
        seller_audience_note: form.seller_audience_note,
        seller_creative_note: form.seller_creative_note,
        seller_video_shop_url: form.seller_video_shop_url || "",
        seller_video_reels_url: form.seller_video_reels_url || "",
      });

      const basePayload = {
        name: form.name.trim(),
        description: form.description,
        target_type: form.target_type,
        product_ids: form.product_ids,
        group_ids: form.group_ids,
        variant_ids: [],
        budget_daily_cents: Math.round(budgetEuro * 100),
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        campaign_type: "ppc",
        discount_type: "percentage",
        discount_value: 0,
        settings: settingsMerged,
      };

      let payload = basePayload;
      if (isSuperuser) {
        payload = {
          ...basePayload,
          bid_strategy: form.bid_strategy,
          ad_platforms: form.ad_platforms,
        };
      }

      await client.updateCampaign(campaignId, payload);
      setMsg({ tone: "success", text: "Kampagne gespeichert." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      !productSearch ||
      (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.ean || "").includes(productSearch),
  );

  if (loading) {
    return (
      <Page title="Kampagne laden …" backAction={{ content: "Zurück", url: "/marketing/campaigns" }}>
        <Card>
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spinner size="large" accessibilityLabel="Laden" />
            <p style={{ marginTop: 16, color: "#64748b", fontSize: 14 }}>Deine Werbekampagne wird geladen …</p>
          </div>
        </Card>
      </Page>
    );
  }

  const sellerExperience = !isSuperuser;

  return (
    <Page
      fullWidth
      title={sellerExperience ? "Shop-Werbung bearbeiten" : form.name.trim() || "Werbekampagne"}
      subtitle={sellerExperience ? undefined : `Kampagnen-ID: ${campaignId}`}
      backAction={{ content: "Zurück zur Übersicht", url: "/marketing/campaigns" }}
      primaryAction={{ content: "Speichern", onAction: save, loading: saving }}
    >
      <div style={{ background: shell.pageBg, margin: "-16px -16px 0", paddingBottom: 48 }}>
        {sellerExperience && (
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background: shell.heroGradient,
              padding: "36px 28px 44px",
              marginBottom: 28,
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: shell.heroGlow, pointerEvents: "none" }} />
            <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Badge tone="success">Shop-Promotion</Badge>
                <Badge tone="info">Sichtbarkeit & Ranking</Badge>
              </InlineStack>
              <h1
                style={{
                  margin: "14px 0 0",
                  fontSize: "clamp(1.65rem, 3vw, 2.25rem)",
                  fontWeight: 750,
                  letterSpacing: "-0.03em",
                  color: "#f8fafc",
                  lineHeight: 1.15,
                  maxWidth: 720,
                  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
                }}
              >
                {form.name.trim() || "Neue Shop-Kampagne"}
              </h1>
              <p style={{ margin: "14px 0 0", fontSize: 15, color: "rgba(226, 232, 240, 0.88)", maxWidth: 620, lineHeight: 1.55 }}>
                Steigere die Sichtbarkeit deiner Angebote im Marktplatz: Sponsored-Badge, bessere Platzierung und mehr Aufmerksamkeit —
                unabhängig davon, wie wir die Reichweite technisch ausspielen.
              </p>
              <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(226,232,240,0.75)", fontFamily: "ui-monospace, monospace" }}>
                  ID {campaignId}
                </span>
                <span style={{ opacity: 0.35, color: "#fff" }}>|</span>
                <span style={{ fontSize: 13, color: "rgba(248,250,252,0.9)" }}>
                  Budget {form.budget_daily_cents ? `${form.budget_daily_cents} €/Tag` : fmtBudget(loadedCampaign?.budget_daily_cents)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 1180, margin: "0 auto", padding: sellerExperience ? "0 20px" : "20px" }}>
          {msg && (
            <div style={{ marginBottom: 20 }}>
              <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
                {msg.text}
              </Banner>
            </div>
          )}

          {isSuperuser && connectedPlatforms.length === 0 && (
            <div style={{ marginBottom: 20 }}>
              <Banner tone="warning">
                Admin-Hinweis: Marketing-Konten unter <strong>Apps & Integrationen</strong> verbinden, um externe Ausspielung zu steuern.
              </Banner>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 28,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: "1 1 420px", minWidth: 0, maxWidth: "100%" }}>
            <BlockStack gap="500">
              {/* Step 1 */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={1}
                  title="Grundlagen & Strategie"
                  subtitle={
                    sellerExperience
                      ? "Benenne deine Kampagne und beschreibe intern, worum es geht — das hilft uns, sie konsistent zu platzieren."
                      : "Interne Benennung und Beschreibung."
                  }
                />
                <BlockStack gap="400">
                  <TextField label="Kampagnenname *" value={form.name} onChange={(v) => setField("name", v)} autoComplete="off" />
                  <TextField
                    label="Interne Notiz"
                    value={form.description}
                    onChange={(v) => setField("description", v)}
                    multiline={3}
                    autoComplete="off"
                    helpText={sellerExperience ? "Nur für dich und unser Team sichtbar." : undefined}
                  />

                  {sellerExperience && (
                    <>
                      <Divider />
                      <Text as="h3" variant="headingSm">
                        Dein Ziel im Shop
                      </Text>
                      <div style={{ display: "grid", gap: 12 }}>
                        {SHOP_GOAL_OPTIONS.map((opt) => {
                          const active = form.seller_shop_goal === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setField("seller_shop_goal", opt.value)}
                              style={{
                                textAlign: "left",
                                cursor: "pointer",
                                padding: "14px 16px",
                                borderRadius: 14,
                                border: active ? "2px solid #6366f1" : "1px solid #e2e8f0",
                                background: active ? "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))" : "#fafafa",
                                transition: "border-color 0.15s, box-shadow 0.15s",
                                boxShadow: active ? "0 4px 20px rgba(99, 102, 241, 0.12)" : "none",
                              }}
                            >
                              <div style={{ fontWeight: 650, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>{opt.label}</div>
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{opt.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                      <TextField
                        label="Zielgruppe / Hinweise (optional)"
                        value={form.seller_audience_note}
                        onChange={(v) => setField("seller_audience_note", v)}
                        multiline={2}
                        autoComplete="off"
                        placeholder="z.B. Beauty-Käufer:innen, Geschenk-Saison …"
                      />
                      <TextField
                        label="Botschaften & Highlights (optional)"
                        value={form.seller_creative_note}
                        onChange={(v) => setField("seller_creative_note", v)}
                        multiline={2}
                        autoComplete="off"
                        placeholder="USP, Materialien, Sets, Trustpilot …"
                      />
                    </>
                  )}
                </BlockStack>
              </div>

              {/* Step 2 — Videos */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={2}
                  title="Video-Creative"
                  subtitle={
                    sellerExperience
                      ? "Zwei Formate: eines für maximale Präsenz im Shop, eines für vertikale Social-Werbung."
                      : "Verkäufer-Assets: Shop-Highlight (16:9) und vertikales Reels-Format."
                  }
                />
                {sellerExperience ? (
                  <div style={{ marginBottom: 20 }}>
                    <Banner tone="warning">
                      <p style={{ margin: 0, lineHeight: 1.55 }}>
                        <strong>Gutes Creative wird zusätzlich ausgespielt:</strong> Wenn deine Videos überzeugen, können wir sie neben dem Shop
                        auch in bezahlten <strong>Instagram-, Facebook-, TikTok- und Snapchat</strong>-Kampagnen (Reels / Stories) einsetzen.
                        Plane deshalb dein <strong>Tagesbudget etwas großzügiger</strong> — so stehen Reichweite und Frequenz im Verhältnis zur Werbewirkung.
                      </p>
                    </Banner>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <Text tone="subdued" as="p" variant="bodySm">
                      URLs werden in den Kampagneneinstellungen gespeichert; Ausspielung extern über Admin-Prozesse.
                    </Text>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <CampaignVideoSlot
                      title="Shop-Highlight · 16 : 9"
                      badge="Im Shop prominent"
                      roleLine="Dieses Format wird im Marktplatz groß und bildzentriert ausgespielt — maximale Aufmerksamkeit für deine Kampagne."
                      specsLine="Empfehlung: 1920 × 1080 px oder höher · MP4 (H.264) · max. 120 MB"
                      aspectMode="169"
                      url={form.seller_video_shop_url}
                      uploading={videoUploadSlot === "shop"}
                      onSelectFile={(f) => uploadCampaignVideo("shop", f)}
                      onClear={() => setField("seller_video_shop_url", "")}
                    />
                  </div>
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <CampaignVideoSlot
                      title="Reels / Stories · 9 : 16"
                      badge="Instagram · FB · TikTok · Snapchat"
                      roleLine="Vertikales Video für bezahlte Werbung bei Instagram, Facebook, TikTok und Snapchat (Reels / Stories)."
                      specsLine="Empfehlung: 1080 × 1920 px · MP4 (H.264) · max. 120 MB"
                      aspectMode="916"
                      url={form.seller_video_reels_url}
                      uploading={videoUploadSlot === "reels"}
                      onSelectFile={(f) => uploadCampaignVideo("reels", f)}
                      onClear={() => setField("seller_video_reels_url", "")}
                    />
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={3}
                  title="Budget & Laufzeit"
                  subtitle={
                    sellerExperience
                      ? "Dein Tagesbudget steuert die Intensität der Promotion im Shop. Wir nutzen es zusätzlich für die professionelle Ausspielung außerhalb — ohne dass du Kanäle einrichten musst."
                      : "Tagesbudget und Zeitfenster."
                  }
                />
                <BlockStack gap="400">
                  <TextField
                    label="Tagesbudget (€) *"
                    type="number"
                    min="1"
                    step="0.5"
                    value={form.budget_daily_cents}
                    onChange={(v) => setField("budget_daily_cents", v)}
                    helpText={
                      sellerExperience
                        ? "Empfehlung: konsistentes Budget über mehrere Tage. Wenn du mit starkem Video zusätzlich außerhalb des Shops ausgespielt werden möchtest (Schritt 2), lieber etwas großzügiger planen."
                        : "z.B. 5 für 5 €/Tag."
                    }
                    autoComplete="off"
                  />
                  <InlineStack gap="400" wrap={false}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField label="Start" type="datetime-local" value={form.start_at} onChange={(v) => setField("start_at", v)} autoComplete="off" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField label="Ende (optional)" type="datetime-local" value={form.end_at} onChange={(v) => setField("end_at", v)} autoComplete="off" />
                    </div>
                  </InlineStack>
                  {isSuperuser && (
                    <Select label="Gebotsstrategie (technisch)" options={BID_OPTIONS} value={form.bid_strategy} onChange={(v) => setField("bid_strategy", v)} />
                  )}
                </BlockStack>
              </div>

              {/* Admin: platforms */}
              {isSuperuser && (
                <div
                  style={{
                    borderRadius: shell.cardRadius,
                    border: shell.border,
                    background: "#fffbeb",
                    boxShadow: shell.cardShadow,
                    padding: "26px 26px 28px",
                  }}
                >
                  <StepHeader step="★" title="Externe Ausspielung (Admin)" subtitle="Plattform-Zuweisung nur für Team mit verbundenen Konten." />
                  <BlockStack gap="300">
                    <Text tone="subdued" as="p" variant="bodySm">
                      Budget {form.budget_daily_cents ? `${form.budget_daily_cents} €/Tag` : "—"} auf {form.ad_platforms.length || "keine"} Kanäle.
                    </Text>
                    <div style={{ border: "1px solid #fcd34d", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                      {PLATFORM_OPTIONS.map((p) => {
                        const checked = form.ad_platforms.includes(p.value);
                        const isConnected = connectedPlatforms.includes(p.value);
                        return (
                          <label
                            key={p.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "10px 14px",
                              cursor: "pointer",
                              background: checked ? "#fffbeb" : "transparent",
                              borderBottom: "1px solid #fef3c7",
                            }}
                          >
                            <CustomCheckbox checked={checked} onChange={() => togglePlatform(p.value)} size={18} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{p.label}</span>
                              {!isConnected && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>Nicht verbunden</span>}
                              {isConnected && <span style={{ fontSize: 11, color: "#22c55e", marginLeft: 8 }}>Verbunden</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </BlockStack>
                </div>
              )}

              {/* Step 4 */}
              <div
                style={{
                  borderRadius: shell.cardRadius,
                  border: shell.border,
                  background: "#fff",
                  boxShadow: shell.cardShadow,
                  padding: "26px 26px 28px",
                }}
              >
                <StepHeader
                  step={4}
                  title="Produkte im Fokus"
                  subtitle={
                    sellerExperience
                      ? "Wähle, welche Listings von dieser Promotion profitieren — oder alle deine aktiven Artikel."
                      : "Targeting wie im Backend."
                  }
                />
                <Select label="Zielauswahl" options={TARGET_OPTIONS} value={form.target_type} onChange={(v) => setField("target_type", v)} />

                {form.target_type === "products" && (
                  <BlockStack gap="300">
                    <div style={{ marginTop: 12 }}>
                      <TextField
                        label=""
                        labelHidden
                        placeholder="Produkte suchen …"
                        value={productSearch}
                        onChange={setProductSearch}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => setProductSearch("")}
                      />
                    </div>
                    <div
                      style={{
                        maxHeight: 380,
                        overflowY: "auto",
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        background: "#fafafa",
                      }}
                    >
                      {filteredProducts.map((p) => {
                        const checked = form.product_ids.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "11px 14px",
                              cursor: "pointer",
                              background: checked ? "#eef2ff" : "#fff",
                              borderBottom: "1px solid #f1f5f9",
                              transition: "background 0.12s",
                            }}
                          >
                            <CustomCheckbox checked={checked} onChange={() => toggleProduct(p.id)} size={18} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: checked ? 650 : 500, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.title || p.id}
                              </div>
                              {p.ean && <div style={{ fontSize: 11, color: "#64748b" }}>EAN {p.ean}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </BlockStack>
                )}

                {form.target_type === "groups" && (
                  <BlockStack gap="200">
                    {groups.length === 0 ? (
                      <Banner tone="info">Noch keine Produktgruppen.</Banner>
                    ) : (
                      <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                        {groups.map((g) => {
                          const checked = form.group_ids.includes(g.id);
                          return (
                            <label
                              key={g.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "12px 14px",
                                cursor: "pointer",
                                background: checked ? "#eef2ff" : "#fff",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <CustomCheckbox checked={checked} onChange={() => toggleGroup(g.id)} size={18} />
                              <div>
                                <div style={{ fontSize: 13, fontWeight: checked ? 650 : 500 }}>{g.name}</div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>{(g.product_ids || []).length} Produkte</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </BlockStack>
                )}

                {form.target_type === "all" && (
                  <div style={{ marginTop: 12 }}>
                    <Banner tone="success">
                      Alle deine aktiven Angebote werden für diese Promotion berücksichtigt — ideal für Markenauftritte und Sortiments-Kampagnen.
                    </Banner>
                  </div>
                )}
              </div>

              <InlineStack gap="300">
                <Button variant="primary" size="large" onClick={save} loading={saving}>
                  Speichern
                </Button>
                <Button onClick={() => router.push("/marketing/campaigns")}>Abbrechen</Button>
              </InlineStack>
            </BlockStack>
            </div>

            {/* Preview column */}
            <aside style={{ flex: "0 1 320px", width: "100%", maxWidth: 360, position: "sticky", top: 24, alignSelf: "flex-start" }}>
              <BlockStack gap="400">
                <ShopPreviewMock
                  name={form.name}
                  budgetEuro={form.budget_daily_cents}
                  goalLabel={sellerExperience ? goalLabel : "Promotion"}
                  targetType={form.target_type}
                  productCount={form.product_ids.length}
                  highlightVideoUrl={form.seller_video_shop_url}
                />
                {sellerExperience && (
                  <div
                    style={{
                      borderRadius: shell.cardRadius,
                      padding: 18,
                      border: shell.border,
                      background: "linear-gradient(145deg, #ffffff, #f8fafc)",
                      boxShadow: shell.cardShadow,
                    }}
                  >
                    <Text as="h3" variant="headingSm">
                      Kurzüberblick
                    </Text>
                    <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
                      <li>Sponsored-Hervorhebung im Shop</li>
                      <li>16:9-Video als Shop-Highlight möglich</li>
                      <li>Starke Creatives können zusätzlich bei Social-Reels eingesetzt werden</li>
                      <li>Algorithmischer Ranking-Boost im Marktplatz</li>
                    </ul>
                  </div>
                )}
              </BlockStack>
            </aside>
          </div>

        </div>
      </div>
    </Page>
  );
}
