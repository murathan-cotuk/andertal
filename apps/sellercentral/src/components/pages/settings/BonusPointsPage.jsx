"use client";

import React, { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Banner, BlockStack, Card, Divider, InlineStack, List, Text,
} from "@shopify/polaris";
import { lt } from "@/lib/locale-text";

function GuideSection({ title, children }) {
  return (
    <BlockStack gap="150">
      <Text as="h3" variant="headingSm">{title}</Text>
      {children}
    </BlockStack>
  );
}

function StatTile({ label, value }) {
  return (
    <div style={{
      flex: "1 1 200px",
      padding: "16px 18px",
      background: "#f8fafc",
      border: "1px solid #e5e7eb",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function BonusPointsPage() {
  const locale = useLocale();
  const router = useRouter();
  const [isSuperuser, setIsSuperuser] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) router.replace("/settings/general");
  }, [router]);

  if (!isSuperuser) return null;

  const title = lt(locale, "Bonus points", "Bonus puan", "Points de fidélité", "Puntos de bonificación", "Punti bonus", "Bonus-Punkte");
  const subtitle = lt(
    locale,
    "How the platform-wide loyalty points program works. This is an informational overview — the rates below are fixed in the backend and not editable here.",
    "Platform genelindeki sadakat puanı programının nasıl işlediği. Bu sayfa yalnızca bilgi amaçlıdır — aşağıdaki oranlar backend'de sabittir, buradan değiştirilemez.",
    "Comment fonctionne le programme de points de fidélité à l'échelle de la plateforme. Ceci est un aperçu informatif — les taux ci-dessous sont fixés côté serveur et non modifiables ici.",
    "Cómo funciona el programa de puntos de fidelidad de toda la plataforma. Esto es solo informativo — las tasas siguientes están fijadas en el backend y no son editables aquí.",
    "Come funziona il programma punti fedeltà a livello di piattaforma. Questa è una panoramica informativa — le percentuali sottostanti sono fisse nel backend e non modificabili qui.",
    "Wie das plattformweite Bonuspunkte-Programm funktioniert. Dies ist eine reine Informationsseite — die Werte unten sind im Backend fest codiert und hier nicht änderbar.",
  );

  const signupLabel = lt(locale, "Signup bonus", "Kayıt bonusu", "Bonus d'inscription", "Bono de registro", "Bonus di registrazione", "Registrierungsbonus");
  const earnLabel = lt(locale, "Earned per order", "Sipariş başına kazanılan", "Gagné par commande", "Ganado por pedido", "Guadagnato per ordine", "Verdient pro Bestellung");
  const redeemLabel = lt(locale, "Redemption rate", "Kullanım oranı", "Taux de conversion", "Tasa de canje", "Tasso di conversione", "Einlöse-Kurs");

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{title}</Text>
          <Text as="p" tone="subdued">{subtitle}</Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            {lt(locale, "Current rates", "Güncel oranlar", "Taux actuels", "Tasas actuales", "Tassi attuali", "Aktuelle Werte")}
          </Text>
          <InlineStack gap="300" wrap>
            <StatTile label={signupLabel} value={lt(locale, "100 points", "100 puan", "100 points", "100 puntos", "100 punti", "100 Punkte")} />
            <StatTile label={earnLabel} value={lt(locale, "1 point / €1 paid", "1€ = 1 puan", "1 point / 1 € payé", "1 punto / 1 € pagado", "1 punto / 1 € pagato", "1 Punkt / 1 € bezahlt")} />
            <StatTile label={redeemLabel} value={lt(locale, "50 points = €1 off", "50 puan = 1€ indirim", "50 points = 1 € de réduction", "50 puntos = 1 € de descuento", "50 punti = 1 € di sconto", "50 Punkte = 1 € Rabatt")} />
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            {lt(locale, "How it works", "Nasıl işliyor", "Fonctionnement", "Cómo funciona", "Come funziona", "So funktioniert es")}
          </Text>

          <GuideSection title={lt(locale, "Earning points", "Puan kazanma", "Gagner des points", "Ganar puntos", "Guadagnare punti", "Punkte sammeln")}>
            <List type="bullet">
              <List.Item>
                {lt(
                  locale,
                  "New customers get 100 points automatically when they register an account.",
                  "Yeni müşteriler hesap oluşturduklarında otomatik olarak 100 puan kazanır.",
                  "Les nouveaux clients reçoivent automatiquement 100 points à la création de leur compte.",
                  "Los nuevos clientes reciben automáticamente 100 puntos al crear su cuenta.",
                  "I nuovi clienti ricevono automaticamente 100 punti alla creazione dell'account.",
                  "Neue Kunden erhalten bei der Registrierung automatisch 100 Punkte.",
                )}
              </List.Item>
              <List.Item>
                {lt(
                  locale,
                  "Customers earn 1 point for every €1 paid (rounded up) when an order is completed.",
                  "Bir sipariş tamamlandığında, ödenen her 1€ için 1 puan kazanılır (yukarı yuvarlanır).",
                  "Les clients gagnent 1 point par euro payé (arrondi au supérieur) lorsqu'une commande est finalisée.",
                  "Los clientes ganan 1 punto por cada 1 € pagado (redondeado hacia arriba) al completar un pedido.",
                  "I clienti guadagnano 1 punto per ogni € 1 pagato (arrotondato per eccesso) al completamento dell'ordine.",
                  "Kunden erhalten pro bezahltem Euro 1 Punkt (aufgerundet), sobald eine Bestellung abgeschlossen ist.",
                )}
              </List.Item>
            </List>
          </GuideSection>

          <Divider />

          <GuideSection title={lt(locale, "Redeeming points", "Puan kullanma", "Utiliser les points", "Canjear puntos", "Utilizzare i punti", "Punkte einlösen")}>
            <List type="bullet">
              <List.Item>
                {lt(
                  locale,
                  "Customers can redeem points in the cart / checkout for a discount: 50 points = €1 off.",
                  "Müşteriler sepette/ödeme sırasında puanlarını indirime çevirebilir: 50 puan = 1€ indirim.",
                  "Les clients peuvent échanger leurs points dans le panier/paiement contre une réduction : 50 points = 1 € de réduction.",
                  "Los clientes pueden canjear puntos en el carrito/pago por un descuento: 50 puntos = 1 € de descuento.",
                  "I clienti possono utilizzare i punti nel carrello/checkout per uno sconto: 50 punti = 1 € di sconto.",
                  "Kunden können Punkte im Warenkorb/Checkout gegen einen Rabatt einlösen: 50 Punkte = 1 € Rabatt.",
                )}
              </List.Item>
              <List.Item>
                {lt(
                  locale,
                  "The discount is funded by the platform, not deducted from the seller's payout.",
                  "İndirim platform tarafından karşılanır, satıcının ödemesinden kesilmez.",
                  "La réduction est financée par la plateforme, pas déduite du versement du vendeur.",
                  "El descuento lo financia la plataforma, no se deduce del pago al vendedor.",
                  "Lo sconto è finanziato dalla piattaforma, non viene detratto dal pagamento del venditore.",
                  "Der Rabatt wird von der Plattform getragen, nicht vom Auszahlungsbetrag des Verkäufers abgezogen.",
                )}
              </List.Item>
            </List>
          </GuideSection>

          <Divider />

          <GuideSection title={lt(locale, "Cancellations & returns", "İptal ve iadeler", "Annulations et retours", "Cancelaciones y devoluciones", "Cancellazioni e resi", "Stornos & Retouren")}>
            <List type="bullet">
              <List.Item>
                {lt(
                  locale,
                  "If an order is cancelled or refunded, any points earned or redeemed on it are automatically reversed.",
                  "Bir sipariş iptal edilir veya iade edilirse, o siparişte kazanılan veya kullanılan puanlar otomatik olarak geri alınır.",
                  "Si une commande est annulée ou remboursée, les points gagnés ou utilisés sur celle-ci sont automatiquement annulés.",
                  "Si un pedido se cancela o se reembolsa, los puntos ganados o canjeados en él se revierten automáticamente.",
                  "Se un ordine viene annullato o rimborsato, i punti guadagnati o utilizzati su di esso vengono automaticamente annullati.",
                  "Wird eine Bestellung storniert oder erstattet, werden dabei verdiente oder eingelöste Punkte automatisch rückgängig gemacht.",
                )}
              </List.Item>
            </List>
          </GuideSection>
        </BlockStack>
      </Card>

      <Banner tone="info">
        <Text as="p" variant="bodySm">
          {lt(
            locale,
            "To view or manually adjust a specific customer's point balance and history, open their profile under Customers.",
            "Belirli bir müşterinin puan bakiyesini veya geçmişini görmek/manuel düzenlemek için Müşteriler altındaki profilini aç.",
            "Pour consulter ou ajuster manuellement le solde de points d'un client, ouvrez son profil sous Clients.",
            "Para ver o ajustar manualmente el saldo de puntos de un cliente, abre su perfil en Clientes.",
            "Per visualizzare o modificare manualmente il saldo punti di un cliente, apri il suo profilo in Clienti.",
            "Um den Punktestand eines bestimmten Kunden einzusehen oder manuell anzupassen, öffne sein Profil unter Kunden.",
          )}
        </Text>
      </Banner>
    </BlockStack>
  );
}
