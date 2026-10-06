"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Banner, BlockStack, Button, Checkbox, InlineStack, Select, Spinner, Text, TextField } from "@shopify/polaris";
import { useLt } from "@/lib/use-locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/**
 * Seller's own Stripe payout account (Custom, recipient agreement, transfers only). The seller
 * accepts Stripe's agreement HERE — the backend records the request's real IP + time; everything
 * else Stripe requires is collected by Stripe's hosted onboarding. Status shown is Stripe's own.
 */
const RECIPIENT_AGREEMENT_URL = "https://stripe.com/legal/connect-account/recipient";

export default function SellerPayoutAccountSection() {
  const lt = useLt();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [entityType, setEntityType] = useState("");
  const [legalName, setLegalName] = useState("");
  const [dob, setDob] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [taxId, setTaxId] = useState("");
  const [taxCountry, setTaxCountry] = useState("");
  const [regNo, setRegNo] = useState("");
  const [regCountry, setRegCountry] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await getMedusaAdminClient().getPayoutAccount();
      setData(r);
      setEntityType(r?.account?.legal_entity_type || "");
      setLegalName(r?.account?.legal_name || "");
      setDob(r?.account?.date_of_birth ? String(r.account.date_of_birth).slice(0, 10) : "");
      setTaxId(r?.account?.tax_id || "");
      setTaxCountry(r?.account?.tax_id_country || "");
      setRegNo(r?.account?.business_registration_number || "");
      setRegCountry(r?.account?.business_registration_country || "");
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const acc = data?.account || {};
  const readiness = data?.readiness || {};
  const due = [...(acc.stripe_requirements?.currently_due || []), ...(acc.stripe_requirements?.past_due || [])];

  const createAccount = async () => {
    setBusy(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      await client.updateLegalProfile({ legal_entity_type: entityType, legal_name: legalName || null, date_of_birth: entityType === "individual" ? (dob || null) : undefined });
      await client.createPayoutAccount({ accept_stripe_tos: true });
      await load();
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };
  // DAC7 / KYC data points (PStTG): TIN + issuing country, register number for companies.
  const saveLegal = async () => {
    setBusy(true); setErr(""); setSavedMsg("");
    try {
      await getMedusaAdminClient().updateLegalProfile({
        legal_entity_type: entityType || undefined,
        legal_name: legalName || null,
        date_of_birth: entityType === "individual" ? (dob || null) : undefined,
        tax_id: taxId || null,
        tax_id_country: taxCountry || null,
        business_registration_number: regNo || null,
        business_registration_country: regCountry || null,
      });
      // Existing Stripe account: push the updated identity to Stripe (no terms acceptance here).
      if (data?.account?.stripe_custom_account_id) await getMedusaAdminClient().createPayoutAccount({}).catch(() => {});
      setSavedMsg(lt("Saved.", "Kaydedildi.", "Enregistré.", "Guardado.", "Salvato.", "Gespeichert."));
      await load();
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const openOnboarding = async () => {
    setBusy(true); setErr("");
    try {
      const r = await getMedusaAdminClient().getPayoutOnboardingLink();
      if (r?.url) window.location.href = r.url;
    } catch (e) {
      setErr(e?.message || "Error");
      setBusy(false);
    }
  };

  if (loading) return <InlineStack align="center"><Spinner size="small" /></InlineStack>;

  const statusText = readiness.ready
    ? lt("Ready for payouts", "Ödemeye hazır", "Prêt pour les versements", "Listo para pagos", "Pronto per i pagamenti", "Bereit für Auszahlungen")
    : lt("Not ready", "Hazır değil", "Pas prêt", "No listo", "Non pronto", "Nicht bereit") + (readiness.reason ? ` (${readiness.reason})` : "");

  const legalFields = (
    <BlockStack gap="200">
      <Text variant="headingSm">{lt("Tax & register data (DAC7)", "Vergi ve sicil bilgileri (DAC7)", "Données fiscales et registre (DAC7)", "Datos fiscales y registro (DAC7)", "Dati fiscali e registro (DAC7)", "Steuer- und Registerdaten (DAC7)")}</Text>
      <InlineStack gap="200" wrap>
        <div style={{ flex: "1 1 200px" }}>
          <TextField label={lt("Tax ID (Steuer-ID / Steuernummer / TIN)", "Vergi numarası (TIN)", "Numéro fiscal (TIN)", "Número fiscal (TIN)", "Codice fiscale (TIN)", "Steuer-ID / Steuernummer (TIN)")} value={taxId} onChange={setTaxId} autoComplete="off" />
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <TextField label={lt("TIN country", "TIN ülkesi", "Pays TIN", "País TIN", "Paese TIN", "TIN-Land")} value={taxCountry} onChange={(v) => setTaxCountry(v.toUpperCase().slice(0, 2))} placeholder="DE" autoComplete="off" />
        </div>
      </InlineStack>
      {entityType !== "individual" && (
        <InlineStack gap="200" wrap>
          <div style={{ flex: "1 1 200px" }}>
            <TextField label={lt("Commercial register no.", "Ticaret sicil no.", "N° registre du commerce", "N.º registro mercantil", "N. registro imprese", "Handelsregisternummer")} value={regNo} onChange={setRegNo} placeholder="HRB 12345" autoComplete="off" />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <TextField label={lt("Register country", "Sicil ülkesi", "Pays du registre", "País del registro", "Paese registro", "Registerland")} value={regCountry} onChange={(v) => setRegCountry(v.toUpperCase().slice(0, 2))} placeholder="DE" autoComplete="off" />
          </div>
        </InlineStack>
      )}
      {savedMsg && <Text tone="success">{savedMsg}</Text>}
      <InlineStack>
        <Button onClick={saveLegal} loading={busy}>{lt("Save tax data", "Vergi bilgilerini kaydet", "Enregistrer", "Guardar", "Salva", "Steuerdaten speichern")}</Button>
      </InlineStack>
    </BlockStack>
  );

  return (
    <BlockStack gap="300">
      <Text variant="headingMd">{lt("Stripe payout account", "Stripe ödeme hesabı", "Compte de versement Stripe", "Cuenta de pagos Stripe", "Conto di pagamento Stripe", "Stripe-Auszahlungskonto")}</Text>
      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}
      {acc.stripe_custom_account_id ? (
        <BlockStack gap="200">
          <Text>{lt("Status", "Durum", "Statut", "Estado", "Stato", "Status")}: <strong>{statusText}</strong></Text>
          {acc.stripe_external_account_last4 && (
            <Text tone="subdued">
              {lt("Bank account at Stripe", "Stripe’taki banka hesabı", "Compte bancaire chez Stripe", "Cuenta bancaria en Stripe", "Conto bancario su Stripe", "Bankkonto bei Stripe")}: •••• {acc.stripe_external_account_last4}
              {" — "}{lt("Stripe status", "Stripe durumu", "Statut Stripe", "Estado Stripe", "Stato Stripe", "Stripe-Status")}: {acc.stripe_external_account_status || "—"}
            </Text>
          )}
          {acc.bank_holder_matches_legal_entity === false && (
            <Banner tone="warning">{lt("The account holder does not match your legal name — payouts may be held for review.", "Hesap sahibi yasal adınızla eşleşmiyor — ödemeler incelemeye alınabilir.", "Le titulaire ne correspond pas à votre raison sociale — les versements peuvent être retenus.", "El titular no coincide con su nombre legal — los pagos pueden retenerse.", "L’intestatario non corrisponde alla ragione sociale — i pagamenti possono essere trattenuti.", "Kontoinhaber stimmt nicht mit dem rechtlichen Namen überein — Auszahlungen können zur Prüfung zurückgehalten werden.")}</Banner>
          )}
          {readiness.reason === "service_agreement_not_recipient" && (
            <Banner tone="warning">{lt("This account was created with the old process and must be set up again. Please contact support.", "Bu hesap eski süreçle açıldı ve yeniden kurulmalı. Lütfen destekle iletişime geçin.", "Ce compte a été créé avec l’ancien processus et doit être reconfiguré. Contactez le support.", "Esta cuenta se creó con el proceso antiguo y debe configurarse de nuevo. Contacte con soporte.", "Questo conto è stato creato con la vecchia procedura e va riconfigurato. Contatta il supporto.", "Dieses Konto wurde mit dem alten Verfahren angelegt und muss neu eingerichtet werden. Bitte Support kontaktieren.")}</Banner>
          )}
          {(due.length > 0 || !readiness.ready) && readiness.reason !== "service_agreement_not_recipient" && (
            <InlineStack>
              <Button onClick={openOnboarding} loading={busy}>
                {lt("Complete verification with Stripe", "Doğrulamayı Stripe’ta tamamla", "Terminer la vérification avec Stripe", "Completar verificación con Stripe", "Completa la verifica con Stripe", "Verifizierung bei Stripe abschließen")}
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      ) : (
        <BlockStack gap="200">
          <Select
            label={lt("Legal form", "Yasal yapı", "Forme juridique", "Forma jurídica", "Forma giuridica", "Rechtsform")}
            options={[
              { label: "—", value: "" },
              { label: lt("Individual / sole trader", "Şahıs / şahıs şirketi", "Personne physique / entrepreneur individuel", "Persona física / autónomo", "Persona fisica / ditta individuale", "Einzelperson / Einzelunternehmen"), value: "individual" },
              { label: lt("Company", "Şirket", "Société", "Empresa", "Società", "Gesellschaft (GmbH, UG, …)"), value: "company" },
            ]}
            value={entityType}
            onChange={setEntityType}
          />
          <TextField label={lt("Legal name (as registered)", "Yasal ad (tescilli)", "Nom légal (enregistré)", "Nombre legal (registrado)", "Nome legale (registrato)", "Rechtlicher Name (wie eingetragen)")} value={legalName} onChange={setLegalName} autoComplete="off" />
          {entityType === "individual" && (
            <TextField type="date" label={lt("Date of birth", "Doğum tarihi", "Date de naissance", "Fecha de nacimiento", "Data di nascita", "Geburtsdatum")} value={dob} onChange={setDob} autoComplete="off" />
          )}
          <Checkbox
            checked={accepted}
            onChange={setAccepted}
            label={<span>{lt("I accept the ", "Şunu kabul ediyorum: ", "J’accepte le ", "Acepto el ", "Accetto il ", "Ich akzeptiere die ")}<a href={RECIPIENT_AGREEMENT_URL} target="_blank" rel="noreferrer">Stripe Connected Account Agreement (Recipient)</a>.</span>}
          />
          <InlineStack>
            <Button variant="primary" onClick={createAccount} loading={busy} disabled={!accepted || !entityType}>
              {lt("Create payout account", "Ödeme hesabı oluştur", "Créer le compte de versement", "Crear cuenta de pagos", "Crea conto di pagamento", "Auszahlungskonto anlegen")}
            </Button>
          </InlineStack>
        </BlockStack>
      )}
      {legalFields}
    </BlockStack>
  );
}
