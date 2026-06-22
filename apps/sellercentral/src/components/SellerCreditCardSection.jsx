"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Banner, BlockStack, Button, InlineStack, Spinner, Text } from "@shopify/polaris";
import { useLt } from "@/lib/use-locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";

const BRAND_LABEL = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  unionpay: "UnionPay",
  jcb: "JCB",
  diners: "Diners Club",
};

function CardDisplay({ brand, last4, expMonth, expYear, lt }) {
  const brandLabel = BRAND_LABEL[brand?.toLowerCase()] || (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : lt("Card", "Kart", "Carte", "Tarjeta", "Carta", "Karte"));
  const exp = expMonth && expYear ? `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}` : null;
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
      padding: "12px 16px",
      minWidth: 220,
    }}>
      <div style={{
        width: 40, height: 26,
        background: "#1a1a2e",
        borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
          {(brand || "CARD").toUpperCase().slice(0, 4)}
        </span>
      </div>
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {brandLabel} •••• {last4}
        </Text>
        {exp && (
          <Text as="p" variant="bodySm" tone="subdued">
            {lt("Expires", "Son kullanma", "Expire", "Caduca", "Scade", "Läuft ab")} {exp}
          </Text>
        )}
      </BlockStack>
    </div>
  );
}

export default function SellerCreditCardSection({ title, subtitle, compact = false }) {
  const lt = useLt();
  const client = getMedusaAdminClient();

  const [loading, setLoading] = useState(true);
  const [cardInfo, setCardInfo] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [stripeReady, setStripeReady] = useState(false);
  const [publishableKey, setPublishableKey] = useState(null);

  const cardRef = useRef(null);
  const stripeRef = useRef(null);
  const cardElementRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [cardData, pkData] = await Promise.all([
          client.getSellerCard(),
          client.getStripePublishableKey(),
        ]);
        setCardInfo(cardData);
        setPublishableKey(pkData?.publishable_key || null);
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [client]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Stripe) { setStripeReady(true); return; }
    const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
    if (existing) {
      existing.addEventListener("load", () => setStripeReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => setStripeReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!adding || !stripeReady || !publishableKey || !cardRef.current) return;
    const stripe = window.Stripe(publishableKey);
    const elements = stripe.elements();
    const cardElement = elements.create("card", {
      hidePostalCode: true,
      style: {
        base: {
          fontSize: "14px",
          color: "#202223",
          fontFamily: "inherit",
          "::placeholder": { color: "#6d7175" },
        },
        invalid: { color: "#d72c0d" },
      },
    });
    cardElement.mount(cardRef.current);
    stripeRef.current = stripe;
    cardElementRef.current = cardElement;
    return () => {
      try { cardElement.unmount(); } catch (_) {}
      stripeRef.current = null;
      cardElementRef.current = null;
    };
  }, [adding, stripeReady, publishableKey]);

  const handleSave = useCallback(async () => {
    if (!stripeRef.current || !cardElementRef.current) return;
    setErr(""); setSaving(true);
    try {
      const { client_secret } = await client.createSellerCardSetupIntent();
      const result = await stripeRef.current.confirmCardSetup(client_secret, {
        payment_method: { card: cardElementRef.current },
      });
      if (result.error) {
        setErr(result.error.message || lt("Card error.", "Kart hatası.", "Erreur de carte.", "Error de tarjeta.", "Errore carta.", "Kartenfehler."));
        return;
      }
      const pmId = result.setupIntent?.payment_method;
      if (!pmId) { setErr(lt("No card ID returned.", "Kart kimliği döndürülmedi.", "Aucun ID de carte retourné.", "No se devolvió ID de tarjeta.", "Nessun ID carta restituito.", "Keine Karten-ID zurückgegeben.")); return; }
      const saved = await client.confirmSellerCard(pmId);
      setCardInfo({ has_card: true, last4: saved.last4, brand: saved.brand, exp_month: saved.exp_month, exp_year: saved.exp_year });
      setAdding(false);
      setOk(lt("Card saved successfully.", "Kart başarıyla kaydedildi.", "Carte enregistrée avec succès.", "Tarjeta guardada correctamente.", "Carta salvata con successo.", "Karte erfolgreich gespeichert."));
    } catch (e) {
      setErr(e?.message || lt("Error saving.", "Kaydetme hatası.", "Erreur d'enregistrement.", "Error al guardar.", "Errore di salvataggio.", "Fehler beim Speichern."));
    } finally {
      setSaving(false);
    }
  }, [client, lt]);

  const handleDelete = useCallback(async () => {
    if (!(await confirmDelete(lt("Remove card?", "Kart kaldırılsın mı?", "Supprimer la carte ?", "¿Eliminar tarjeta?", "Rimuovere la carta?", "Karte wirklich entfernen?")))) return;
    setErr(""); setDeleting(true);
    try {
      await client.deleteSellerCard();
      setCardInfo({ has_card: false, last4: null, brand: null, exp_month: null, exp_year: null });
      setOk(lt("Card removed.", "Kart kaldırıldı.", "Carte supprimée.", "Tarjeta eliminada.", "Carta rimossa.", "Karte entfernt."));
    } catch (e) {
      setErr(e?.message || lt("Error removing.", "Kaldırma hatası.", "Erreur de suppression.", "Error al eliminar.", "Errore di rimozione.", "Fehler beim Entfernen."));
    } finally {
      setDeleting(false);
    }
  }, [client, lt]);

  if (loading) return <Spinner size="small" />;

  const displayTitle = title ?? lt("Credit card for fees", "Ücretler için kredi kartı", "Carte bancaire pour les frais", "Tarjeta de crédito para comisiones", "Carta di credito per commissioni", "Kreditkarte für Gebühren");
  const displaySubtitle = subtitle ?? lt(
    "This card is used when your balance is insufficient for platform fees or chargebacks.",
    "Bakiyeniz platform ücretleri veya geri ödemeler için yetersiz olduğunda bu kart kullanılır.",
    "Cette carte est utilisée lorsque votre solde est insuffisant pour les frais ou rétrofacturations.",
    "Esta tarjeta se usa cuando su saldo no cubre comisiones o contracargos.",
    "Questa carta viene usata quando il saldo non copre commissioni o chargeback.",
    "Diese Karte wird verwendet, wenn dein Guthaben für Plattformgebühren oder Rückbuchungen nicht ausreicht.",
  );

  return (
    <BlockStack gap="300">
      {!compact && (
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">{displayTitle}</Text>
            <Text as="p" tone="subdued" variant="bodySm">{displaySubtitle}</Text>
          </BlockStack>
          {!adding && (
            <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">
              {cardInfo?.has_card
                ? lt("Change", "Değiştir", "Modifier", "Cambiar", "Modifica", "Ändern")
                : lt("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen")}
            </Button>
          )}
        </InlineStack>
      )}

      {ok && <Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner>}
      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}

      {!adding && (
        cardInfo?.has_card ? (
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <CardDisplay
              brand={cardInfo.brand}
              last4={cardInfo.last4}
              expMonth={cardInfo.exp_month}
              expYear={cardInfo.exp_year}
              lt={lt}
            />
            {compact && (
              <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">
                {lt("Change", "Değiştir", "Modifier", "Cambiar", "Modifica", "Ändern")}
              </Button>
            )}
            <Button tone="critical" variant="plain" onClick={handleDelete} loading={deleting} size="slim">
              {lt("Remove", "Kaldır", "Supprimer", "Eliminar", "Rimuovi", "Entfernen")}
            </Button>
          </InlineStack>
        ) : (
          <div style={{ background: "#fffbeb", borderRadius: 10, padding: "14px 18px", border: "1px solid #fde68a" }}>
            <InlineStack gap="300" blockAlign="center">
              <span style={{ fontSize: 20 }}>💳</span>
              <BlockStack gap="050">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {lt("No credit card on file", "Kayıtlı kredi kartı yok", "Aucune carte enregistrée", "Sin tarjeta registrada", "Nessuna carta registrata", "Keine Kreditkarte hinterlegt")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lt(
                    "Please add a card so fees and chargebacks can be processed.",
                    "Ücretler ve geri ödemelerin işlenebilmesi için lütfen bir kart ekleyin.",
                    "Veuillez ajouter une carte pour traiter les frais et rétrofacturations.",
                    "Añada una tarjeta para procesar comisiones y contracargos.",
                    "Aggiungi una carta per gestire commissioni e chargeback.",
                    "Bitte füge eine Karte hinzu, damit Gebühren und Rückbuchungen abgewickelt werden können.",
                  )}
                </Text>
              </BlockStack>
              {compact && (
                <Button onClick={() => { setAdding(true); setErr(""); setOk(""); }} size="slim">
                  {lt("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen")}
                </Button>
              )}
            </InlineStack>
          </div>
        )
      )}

      {adding && (
        <BlockStack gap="300">
          {!publishableKey ? (
            <Banner tone="warning">
              {lt(
                "Stripe is not configured yet. Please contact support.",
                "Stripe henüz yapılandırılmadı. Lütfen destek ile iletişime geçin.",
                "Stripe n'est pas encore configuré. Contactez le support.",
                "Stripe aún no está configurado. Contacte con soporte.",
                "Stripe non è ancora configurato. Contatta il supporto.",
                "Stripe ist noch nicht konfiguriert. Bitte wende dich an den Support.",
              )}
            </Banner>
          ) : !stripeReady ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p" variant="bodySm" tone="subdued">
                {lt("Loading Stripe…", "Stripe yükleniyor…", "Chargement de Stripe…", "Cargando Stripe…", "Caricamento Stripe…", "Stripe wird geladen…")}
              </Text>
            </InlineStack>
          ) : (
            <BlockStack gap="300">
              <div>
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                  {lt("Card details", "Kart bilgileri", "Coordonnées de la carte", "Datos de la tarjeta", "Dati carta", "Kartendaten")}
                </Text>
                <div
                  ref={cardRef}
                  style={{
                    marginTop: 6,
                    border: "1px solid #8c9196",
                    borderRadius: 6,
                    padding: "10px 12px",
                    background: "#fff",
                    minHeight: 38,
                  }}
                />
              </div>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  {saving
                    ? lt("Saving…", "Kaydediliyor…", "Enregistrement…", "Guardando…", "Salvataggio…", "Wird gespeichert…")
                    : lt("Save card", "Kartı kaydet", "Enregistrer la carte", "Guardar tarjeta", "Salva carta", "Karte speichern")}
                </Button>
                <Button onClick={() => { setAdding(false); setErr(""); }} disabled={saving}>
                  {lt("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen")}
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}
