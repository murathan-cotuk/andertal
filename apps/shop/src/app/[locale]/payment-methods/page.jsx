"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthGuard, getToken, useCustomerAuth as useAuth } from "@andertal/lib";
import { useRouter } from "@/i18n/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import ShopHeader from "@/components/ShopHeader";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { useLocale, useTranslations } from "next-intl";

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

function CardIcon() {
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="24" rx="4" fill="#1a1a2e" />
      <rect x="0" y="7" width="32" height="5" fill="#e6dfd4" opacity="0.3" />
      <rect x="4" y="15" width="10" height="3" rx="1" fill="#fbbf24" />
    </svg>
  );
}

function BrandLogo({ brand }) {
  const b = (brand || "").toLowerCase();
  const labels = { visa: "VISA", mastercard: "MC", amex: "AMEX", discover: "DISC", jcb: "JCB" };
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#5e574e", background: "#f3eee6", padding: "2px 6px", borderRadius: 3 }}>
      {labels[b] || brand?.toUpperCase() || "CARD"}
    </span>
  );
}

function SavedCard({ pm, onDelete, deleting }) {
  const t = useTranslations("paymentPage");
  const card = pm.card || {};
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", boxShadow: "0 0 0 1px rgba(29, 27, 24, 0.06)", borderRadius: 14, background: "#fff" }}>
      <CardIcon />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrandLogo brand={card.brand} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1b18" }}>
            •••• •••• •••• {card.last4 || "????"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#a39a8d", marginTop: 3 }}>
          {t("expires", { date: `${String(card.exp_month).padStart(2, "0")}/${card.exp_year}` })}
        </div>
      </div>
      <button
        onClick={() => onDelete(pm.id)}
        disabled={deleting === pm.id}
        style={{ background: "none", border: "1px solid #fecaca", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
      >
        {deleting === pm.id ? "…" : t("remove")}
      </button>
    </div>
  );
}

function AddCardForm({ onSuccess, onCancel }) {
  const t = useTranslations("paymentPage");
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    setErr("");
    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (error) {
      setErr(error.message || t("saveError"));
      setSaving(false);
      return;
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(29, 27, 24, 0.06)", borderRadius: 14, padding: "20px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#3a352f", marginBottom: 14 }}>{t("addTitle")}</div>
      <PaymentElement />
      {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 10 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="submit"
          disabled={saving || !stripe}
          style={{ flex: 1, padding: "9px 0", background: "var(--shop-accent, #ee8a12)", color: "#fff", border: "1px solid #e6dfd4", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 0 0 1px rgba(29,27,24,0.08)" }}
        >
          {saving ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "9px 16px", border: "1px solid #efe8dd", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "#fff" }}
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

export default function PaymentMethodsPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const t = useTranslations("paymentPage");
  const locale = useLocale();
  const { logout } = useAuth();
  const router = useRouter();

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const fetchMethods = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      const data = await client.request("/store/payment-methods", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.__error) throw new Error(data.message || t("error"));
      setPaymentMethods(data?.payment_methods || []);
    } catch (e) {
      setErr(e?.message || t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  const handleDelete = async (pmId) => {
    setDeleting(pmId);
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      await client.request(`/store/payment-methods/${pmId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
    } catch (e) {
      setErr(e?.message || t("removeError"));
    } finally {
      setDeleting(null);
    }
  };

  const handleShowAdd = async () => {
    setSetupLoading(true);
    setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      const data = await client.request("/store/payment-methods/setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (data?.__error) throw new Error(data.message || t("error"));
      setClientSecret(data.client_secret);
      setShowAddForm(true);
    } catch (e) {
      setErr(e?.message || t("error"));
    } finally {
      setSetupLoading(false);
    }
  };

  const handleAddSuccess = () => {
    setShowAddForm(false);
    setClientSecret(null);
    fetchMethods();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#faf7f2" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title={t("title")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {loading && <GlobalPageLoader />}
              {err && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
                  {err}
                </div>
              )}
              {!loading && !showAddForm && (
                <>
                  {paymentMethods.length === 0 && (
                    <div style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(29, 27, 24, 0.06)", borderRadius: 18, padding: "40px 24px", textAlign: "center", color: "#a39a8d", fontSize: 14 }}>
                      {t("empty")}
                    </div>
                  )}
                  {paymentMethods.map((pm) => (
                    <SavedCard key={pm.id} pm={pm} onDelete={handleDelete} deleting={deleting} />
                  ))}
                  <button
                    onClick={handleShowAdd}
                    disabled={setupLoading}
                    style={{ alignSelf: "flex-start", padding: "9px 18px", background: "var(--shop-accent, #ee8a12)", color: "#fff", border: "1px solid #e6dfd4", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 0 0 1px rgba(29,27,24,0.08)", marginTop: 4 }}
                  >
                    {setupLoading ? "…" : t("add")}
                  </button>
                </>
              )}
              {showAddForm && clientSecret && stripePromise && (
                <Elements stripe={stripePromise} options={{ clientSecret, locale, appearance: { theme: "stripe" } }}>
                  <AddCardForm onSuccess={handleAddSuccess} onCancel={() => { setShowAddForm(false); setClientSecret(null); }} />
                </Elements>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
