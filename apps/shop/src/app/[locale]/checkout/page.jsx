"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import styled from "styled-components";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { Link } from "@/i18n/navigation";
import { tokens } from "@/design-system/tokens";
import PayNowButton from "@/components/ui/PayNowButton";
import { getToken, useCustomerAuth as useCustomerAuthHook } from "@andertal/lib";
import { getMedusaClient } from "@/lib/medusa-client";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { getShippableCountries } from "@/lib/countries";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";
import { findShippingGroup, resolveShippingQuoteCents } from "@/lib/shipping-price";
import { normalizeIsoCountryCode } from "@/lib/iso-country";
import { CHECKOUT_SHIPPING_COUNTRY_LS, CHECKOUT_SHIPPING_MARKET_COUNTRY_LS } from "@/hooks/useShippingCountryForQuotes";
import BestsellerBadge from "@/components/BestsellerBadge";
import { isBestsellerMetadata } from "@/lib/bestseller";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import CustomCheckbox from "@/components/ui/CustomCheckbox";

const CHECKOUT_SNAPSHOT_KEY = "andertal_checkout_snapshot";

const PageWrap = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${tokens.background.main};
  width: 100%;
  max-width: 100%;
  overflow-x: clip;
  box-sizing: border-box;
`;

const Main = styled.main`
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: clip;
  padding: 24px 24px 64px;

  @media (max-width: 768px) {
    padding: 16px max(12px, env(safe-area-inset-left)) max(56px, calc(48px + env(safe-area-inset-bottom)))
      max(12px, env(safe-area-inset-right));
  }
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 32px;

  @media (max-width: 768px) {
    font-size: 1.375rem;
    margin-bottom: 20px;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 360px) 1fr;
  gap: 32px;
  align-items: flex-start;
  min-width: 0;
  width: 100%;

  & > * {
    min-width: 0;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 24px;
  }
`;

const FormCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: clip;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: ${(p) => p.$cols || "1fr"};
  gap: 16px;
  margin-bottom: 16px;
  min-width: 0;

  @media (max-width: 640px) {
    grid-template-columns: 1fr !important;
  }
`;

const FieldWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
`;

const Input = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid ${(p) => (p.$error ? "#ef4444" : "#d1d5db")};
  border-radius: 8px;
  font-size: 0.9375rem;
  font-family: inherit;
  color: #111827;
  outline: none;
  background: #fff;
  transition: border-color 0.15s;
  &:focus { border-color: ${tokens.primary.DEFAULT}; }
`;

const ErrorMsg = styled.span`
  font-size: 0.75rem;
  color: #ef4444;
`;

const SummaryCard = styled.div`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  position: sticky;
  top: 64px;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  overflow-x: clip;

  @media (max-width: 768px) {
    position: relative;
    top: auto;
    padding: 16px;
  }
`;

const SummaryItem = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
`;

const SummaryThumb = styled.div`
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #f3f4f6;
  img { width: 100%; height: 100%; object-fit: contain; background: #fff; display: block; }
`;

const SummaryItemDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const SummaryItemTitle = styled.div`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;

  @media (max-width: 768px) {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
  }
`;

const SummaryItemQty = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
`;

const SummaryItemPrice = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  flex-shrink: 0;
`;

const SummaryItemLink = styled(Link)`
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: flex-start;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  &:hover ${SummaryItemTitle} {
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 16px 0;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  font-size: 0.9375rem;
  color: #4b5563;
  margin-bottom: 8px;
  min-width: 0;

  & > span:first-child {
    min-width: 0;
    flex: 1;
    padding-right: 4px;
  }
  & > span:last-child {
    flex-shrink: 0;
    text-align: right;
  }
`;

const SummaryTotal = styled(SummaryRow)`
  font-weight: 700;
  font-size: 1.0625rem;
  color: #111827;
  margin-top: 4px;
`;

/** Stripe iframe + iç grid mobilde taşmasın */
const StripePaymentWrap = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: clip;
`;

const PayMethodPickerGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
`;

const PayMethodPickerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
`;

const PayMethodCard = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: 2px solid ${(p) => (p.$active ? tokens.primary.DEFAULT : "#e5e7eb")};
  border-radius: 10px;
  background: ${(p) => (p.$active ? `${tokens.primary.DEFAULT}0d` : "#fff")};
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: ${(p) => (p.$active ? "600" : "500")};
  color: #111827;
  transition: border-color 0.15s, background 0.15s;
  min-width: 110px;
  &:hover { border-color: ${tokens.primary.DEFAULT}; }
`;

const PayMethodListRow = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid ${(p) => (p.$active ? tokens.primary.DEFAULT : "#e5e7eb")};
  border-radius: 10px;
  background: ${(p) => (p.$active ? `${tokens.primary.DEFAULT}0d` : "#fff")};
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: ${(p) => (p.$active ? "600" : "500")};
  color: #111827;
  width: 100%;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: ${tokens.primary.DEFAULT}; }
`;

const RadioDot = styled.span`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid ${(p) => (p.$active ? tokens.primary.DEFAULT : "#9ca3af")};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &::after {
    content: '';
    display: ${(p) => (p.$active ? "block" : "none")};
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${tokens.primary.DEFAULT};
  }
`;

const checkoutSubmitWrapButtonCss = `
  button {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    white-space: normal !important;
    flex-wrap: wrap;
    height: auto !important;
    min-height: 52px;
    padding: 12px 14px !important;
    line-height: 1.25;
    gap: 8px;
  }

  button > span:first-of-type {
    min-width: 0;
    flex: 1 1 auto;
    text-align: center;
    word-break: break-word;
  }

  button > div:last-of-type {
    flex-shrink: 0;
  }
`;

const CheckoutSubmitWrapFooter = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-top: 20px;
  ${checkoutSubmitWrapButtonCss}
`;

const PayBtn = styled.button`
  width: 100%;
  padding: 14px 20px;
  background: ${tokens.primary.DEFAULT};
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 20px;
  transition: background 0.15s;
  &:hover:not(:disabled) { background: ${tokens.primary.hover}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ErrorBox = styled.div`
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.875rem;
  margin-top: 16px;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: #6b7280;
  text-decoration: none;
  margin-bottom: 24px;
  &:hover { color: #374151; }
`;

function useField(initial = "") {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  return { value, touched, onChange: (e) => setValue(e.target.value), onBlur: () => setTouched(true), reset: () => { setValue(initial); setTouched(false); } };
}

const PAY_METHOD_META = {
  card:       { labelKey: "methodCard",    icon: "💳" },
  paypal:     { labelKey: "methodPaypal",  icon: "🅿" },
  klarna:     { labelKey: "methodKlarna",  icon: "K"  },
  sepa_debit: { labelKey: "methodSepa",    icon: "🏦" },
  link:       { labelKey: "methodLink",    icon: "🔗" },
  ideal:      { labelKey: "methodIdeal",   icon: "iD" },
  bancontact: { labelKey: "methodBancontact", icon: "B" },
  eps:        { labelKey: "methodEps",     icon: "€"  },
  p24:        { labelKey: "methodP24",     icon: "P"  },
  giropay:    { labelKey: "methodGiropay", icon: "G"  },
  sofort:     { labelKey: "methodSofort",  icon: "S"  },
};

function PaymentMethodPicker({ methods, selected, onSelect, layout }) {
  const t = useTranslations("checkout");
  if (!methods || methods.length <= 1) return null;
  const getLabel = (m) => {
    const key = PAY_METHOD_META[m]?.labelKey;
    try { return key ? t(key) : m; } catch { return m; }
  };
  const getIcon = (m) => PAY_METHOD_META[m]?.icon || "💳";
  if (layout === "list") {
    return (
      <PayMethodPickerList>
        {methods.map((m) => (
          <PayMethodListRow key={m} type="button" $active={selected === m} onClick={() => onSelect(m)}>
            <RadioDot $active={selected === m} />
            <span style={{ fontSize: "1.1rem" }}>{getIcon(m)}</span>
            <span>{getLabel(m)}</span>
          </PayMethodListRow>
        ))}
      </PayMethodPickerList>
    );
  }
  return (
    <PayMethodPickerGrid>
      {methods.map((m) => (
        <PayMethodCard key={m} type="button" $active={selected === m} onClick={() => onSelect(m)}>
          <span style={{ fontSize: "1.25rem" }}>{getIcon(m)}</span>
          <span>{getLabel(m)}</span>
        </PayMethodCard>
      ))}
    </PayMethodPickerGrid>
  );
}

function CheckoutFormField({
  label,
  field,
  type = "text",
  placeholder,
  fullWidth,
  validate,
  autoComplete,
}) {
  const t = useTranslations("checkout");
  const required = (f) => f.touched && !f.value.trim();
  const isRequired = !fullWidth ? required(field) : field.touched && !field.value.trim();
  const isInvalid = validate ? field.touched && !validate(field.value) : isRequired;
  return (
    <FieldWrap style={fullWidth ? { gridColumn: "1/-1" } : {}}>
      <Label>{label}</Label>
      <Input
        type={type}
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        placeholder={placeholder}
        $error={isInvalid}
        autoComplete={autoComplete ?? "on"}
      />
      {isInvalid && (
        <ErrorMsg>{validate && !required(field) ? t("invalidEmail") : t("requiredField")}</ErrorMsg>
      )}
    </FieldWrap>
  );
}

function applyToField(field, value) {
  field.onChange({ target: { value: value ?? "" } });
}

function CheckoutForm({ clientSecret, cartId, items, subtotalCents, amountToPayCents, shippingCents, onCountryChange, defaultCountry, shippableCountries, paymentIntentRefreshing = false, paymentMethodTypes = ["card"], paymentMethodLayout = "grid" }) {
  const shipList = useMemo(() => shippableCountries || [], [shippableCountries]);
  const pickShipCountry = (raw) => {
    const u = String(raw || "DE").toUpperCase();
    if (!shipList.length) return u;
    return shipList.some((c) => c.code === u) ? u : shipList[0].code;
  };
  /** Latest Versand-land from parent (summary); avoids async customer fetch overwriting GB with default DE */
  const defaultCountryRef = useRef(defaultCountry);
  defaultCountryRef.current = defaultCountry;
  const shipListRef = useRef(shipList);
  shipListRef.current = shipList;
  const t = useTranslations("checkout");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "de";
  const { setCart } = useCart();
  const { user } = useCustomerAuthHook();
  const returnRunRef = useRef(false);
  const [paymentElementReady, setPaymentElementReady] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [shipAddrId, setShipAddrId] = useState("");
  const [billAddrId, setBillAddrId] = useState("");
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  const email = useField("");
  const firstName = useField("");
  const lastName = useField("");
  const phone = useField("");
  const address = useField("");
  const address2 = useField("");
  const city = useField("");
  const postalCode = useField("");
  const country = useField(defaultCountry || "DE");

  useEffect(() => {
    if (!defaultCountry) return;
    applyToField(country, defaultCountry);
  }, [defaultCountry]);

  useEffect(() => {
    if (!shipList.length) return;
    const codes = new Set(shipList.map((c) => c.code));
    if (!codes.has(billingCountry.value)) applyToField(billingCountry, shipList[0].code);
  }, [shipList]);

  /** Unchecked = Rechnung wie Lieferadresse; checked = separate Rechnungsadresse erfassen */
  const [billingSeparateFromShipping, setBillingSeparateFromShipping] = useState(false);
  const billingSameAsShipping = !billingSeparateFromShipping;
  const billingAddress = useField("");
  const billingAddress2 = useField("");
  const billingCity = useField("");
  const billingPostalCode = useField("");
  const billingCountry = useField("DE");

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const payCentsDisplay = amountToPayCents != null ? amountToPayCents : subtotalCents;

  useEffect(() => {
    if (!user?.id) {
      setSavedAddresses([]);
      setShipAddrId("");
      setBillAddrId("");
      return;
    }
    const token = getToken("customer");
    if (!token) return;
    (async () => {
      const client = getMedusaClient();
      const me = await client.getCustomer(token);
      const addrs = me?.customer?.addresses || [];
      setSavedAddresses(addrs);
      const c = me?.customer;
      if (c?.email) applyToField(email, c.email);
      if (c?.first_name) applyToField(firstName, c.first_name);
      if (c?.last_name) applyToField(lastName, c.last_name);
      if (c?.phone) applyToField(phone, c.phone);
      // Save customer info to cart so it shows in abandoned checkouts
      if (cartId && (c?.email || c?.first_name || c?.last_name)) {
        const patch = {};
        if (c?.email) patch.email = c.email;
        if (c?.first_name) patch.first_name = c.first_name;
        if (c?.last_name) patch.last_name = c.last_name;
        client.patchStoreCart(cartId, patch).catch(() => {});
      }
      const list = shipListRef.current;
      const pickNow = (raw) => {
        const u = String(raw || "DE").toUpperCase();
        if (!list.length) return u;
        return list.some((c) => c.code === u) ? u : list[0].code;
      };
      const wantC = pickNow(defaultCountryRef.current);
      const def = addrs.find((a) => a.is_default_shipping) || addrs[0];
      if (def?.id) {
        const defC = pickNow(def.country);
        if (list.length > 0 && defC !== wantC) {
          setShipAddrId("");
        } else {
          setShipAddrId(def.id);
          applyToField(address, def.address_line1 || "");
          applyToField(address2, def.address_line2 || "");
          applyToField(city, def.city || "");
          applyToField(postalCode, def.zip_code || "");
          applyToField(country, defC);
          onCountryChange?.(defC);
        }
      }
      const defB = addrs.find((a) => a.is_default_billing) || def;
      if (defB?.id) setBillAddrId(defB.id);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!stripe || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const redirectStatus = sp.get("redirect_status");
    if (!redirectStatus) return;

    const checkoutPath = `/${locale}/checkout`;

    if (redirectStatus === "failed") {
      setError(t("paymentError"));
      router.replace(checkoutPath);
      return;
    }

    if (redirectStatus !== "succeeded") return;

    const secret = sp.get("payment_intent_client_secret");
    const piId = sp.get("payment_intent");
    if (!secret || !piId) return;
    if (sessionStorage.getItem(`andertal_pi_done_${piId}`) === "1") {
      router.replace(checkoutPath);
      return;
    }
    if (returnRunRef.current) return;
    returnRunRef.current = true;

    (async () => {
      const { paymentIntent, error: retrieveErr } = await stripe.retrievePaymentIntent(secret);
      if (retrieveErr || paymentIntent?.status !== "succeeded") {
        returnRunRef.current = false;
        setError(retrieveErr?.message || t("paymentError"));
        router.replace(checkoutPath);
        return;
      }

      let snapshot;
      try {
        const raw = sessionStorage.getItem(CHECKOUT_SNAPSHOT_KEY);
        if (!raw) {
          returnRunRef.current = false;
          setError(t("paymentError"));
          router.replace(checkoutPath);
          return;
        }
        snapshot = JSON.parse(raw);
      } catch {
        returnRunRef.current = false;
        setError(t("paymentError"));
        router.replace(checkoutPath);
        return;
      }

      if (snapshot.cartId !== cartId) {
        returnRunRef.current = false;
        router.replace(checkoutPath);
        return;
      }

      try {
        const custTok = typeof window !== "undefined" ? getToken("customer") : null;
        const orderHeaders = { "Content-Type": "application/json" };
        if (custTok) orderHeaders.Authorization = `Bearer ${custTok}`;
        const res = await fetch("/api/store-orders", {
          method: "POST",
          headers: orderHeaders,
          body: JSON.stringify({
            cart_id: cartId,
            payment_intent_id: paymentIntent.id,
            shipping_cents: shippingCents ?? 0,
            email: snapshot.email,
            first_name: snapshot.first_name,
            last_name: snapshot.last_name,
            phone: snapshot.phone,
            address_line1: snapshot.address_line1,
            address_line2: snapshot.address_line2,
            city: snapshot.city,
            postal_code: snapshot.postal_code,
            country: snapshot.country,
            billing_same_as_shipping: snapshot.billing_same_as_shipping,
            billing_address_line1: snapshot.billing_address_line1,
            billing_address_line2: snapshot.billing_address_line2,
            billing_city: snapshot.billing_city,
            billing_postal_code: snapshot.billing_postal_code,
            billing_country: snapshot.billing_country,
          }),
        });
        const data = await res.json();
        const orderId = data?.order?.id;
        if (orderId) {
          if (custTok && snapshot.save_new_address && !snapshot.ship_addr_id && snapshot.address_line1) {
            try {
              const client = getMedusaClient();
              await client.createCustomerAddress(custTok, {
                address_line1: snapshot.address_line1,
                address_line2: snapshot.address_line2 || null,
                zip_code: snapshot.postal_code || null,
                city: snapshot.city || null,
                country: snapshot.country || "DE",
                is_default_shipping: snapshot.addr_count === 0,
                is_default_billing: snapshot.addr_count === 0,
              });
            } catch (_) {}
          }
          sessionStorage.setItem(`andertal_pi_done_${piId}`, "1");
          try {
            sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
          } catch (_) {}
          try {
            window.localStorage.removeItem("andertal_cart_id");
          } catch (_) {}
          setCart(null);
          router.replace(`/${locale}/order/${orderId}`);
        } else {
          returnRunRef.current = false;
          setError(data?.message || t("paymentError"));
          router.replace(checkoutPath);
        }
      } catch (err) {
        returnRunRef.current = false;
        setError(err?.message || t("paymentError"));
        router.replace(checkoutPath);
      }
    })();
  }, [stripe, cartId, locale, router, setCart, t]);

  useEffect(() => {
    setPaymentElementReady(false);
  }, [clientSecret]);

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const required = (field) => field.touched && !field.value.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    // Mark all as touched for validation display
    [email, firstName, lastName, address, city, postalCode, country].forEach((f) => f.onBlur());

    if (!email.value.trim() || !validateEmail(email.value) || !firstName.value.trim() || !lastName.value.trim() || !address.value.trim() || !city.value.trim() || !postalCode.value.trim()) {
      return;
    }

    // Save contact info to cart so abandoned cart recovery has customer data
    getMedusaClient().patchStoreCart(cartId, {
      email: email.value.trim(),
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
      phone: phone.value.trim() || undefined,
    }).catch(() => {});

    if (!paymentElementReady) {
      setError(t("paymentNotReady"));
      return;
    }

    setProcessing(true);
    setError(null);

    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : "";

    try {
      sessionStorage.setItem(
        CHECKOUT_SNAPSHOT_KEY,
        JSON.stringify({
          cartId,
          email: email.value.trim(),
          first_name: firstName.value.trim(),
          last_name: lastName.value.trim(),
          phone: phone.value.trim(),
          address_line1: address.value.trim(),
          address_line2: address2.value.trim(),
          city: city.value.trim(),
          postal_code: postalCode.value.trim(),
          country: country.value.trim(),
          billing_same_as_shipping: billingSameAsShipping,
          billing_address_line1: billingSameAsShipping ? undefined : billingAddress.value.trim(),
          billing_address_line2: billingSameAsShipping ? undefined : billingAddress2.value.trim(),
          billing_city: billingSameAsShipping ? undefined : billingCity.value.trim(),
          billing_postal_code: billingSameAsShipping ? undefined : billingPostalCode.value.trim(),
          billing_country: billingSameAsShipping ? undefined : billingCountry.value.trim(),
          save_new_address: saveNewAddress,
          ship_addr_id: shipAddrId || "",
          addr_count: savedAddresses.length,
        }),
      );
    } catch (_) {}

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || t("paymentError"));
      setProcessing(false);
      return;
    }

    let stripeError;
    let paymentIntent;
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      stripeError = result.error;
      paymentIntent = result.paymentIntent;
    } catch (err) {
      setError(err?.message || t("paymentError"));
      setProcessing(false);
      return;
    }

    if (stripeError) {
      setError(stripeError.message || t("paymentError"));
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      try {
        const custTok = typeof window !== "undefined" ? getToken("customer") : null;
        const orderHeaders = { "Content-Type": "application/json" };
        if (custTok) orderHeaders.Authorization = `Bearer ${custTok}`;
        const res = await fetch("/api/store-orders", {
          method: "POST",
          headers: orderHeaders,
          body: JSON.stringify({
            cart_id: cartId,
            payment_intent_id: paymentIntent.id,
            shipping_cents: shippingCents ?? 0,
            email: email.value.trim(),
            first_name: firstName.value.trim(),
            last_name: lastName.value.trim(),
            phone: phone.value.trim(),
            address_line1: address.value.trim(),
            address_line2: address2.value.trim(),
            city: city.value.trim(),
            postal_code: postalCode.value.trim(),
            country: country.value.trim(),
            billing_same_as_shipping: billingSameAsShipping,
            billing_address_line1: billingSameAsShipping ? undefined : billingAddress.value.trim(),
            billing_address_line2: billingSameAsShipping ? undefined : billingAddress2.value.trim(),
            billing_city: billingSameAsShipping ? undefined : billingCity.value.trim(),
            billing_postal_code: billingSameAsShipping ? undefined : billingPostalCode.value.trim(),
            billing_country: billingSameAsShipping ? undefined : billingCountry.value.trim(),
          }),
        });
        const data = await res.json();
        const orderId = data?.order?.id;
        if (!res.ok || !orderId) {
          setError(data?.message || t("paymentError"));
        } else {
          if (custTok && saveNewAddress && !shipAddrId && address.value.trim()) {
            try {
              const client = getMedusaClient();
              await client.createCustomerAddress(custTok, {
                address_line1: address.value.trim(),
                address_line2: address2.value.trim() || null,
                zip_code: postalCode.value.trim() || null,
                city: city.value.trim() || null,
                country: country.value.trim() || "DE",
                is_default_shipping: savedAddresses.length === 0,
                is_default_billing: savedAddresses.length === 0,
              });
            } catch (_) {}
          }
          try {
            sessionStorage.removeItem(CHECKOUT_SNAPSHOT_KEY);
          } catch (_) {}
          if (typeof window !== "undefined") {
            try { window.localStorage.removeItem("andertal_cart_id"); } catch (_) {}
          }
          setCart(null);
          router.push(`/${locale}/order/${orderId}`);
        }
      } catch (err) {
        setError(err?.message || t("paymentError"));
      }
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormCard style={{ marginBottom: 24 }}>
        <SectionTitle>{t("contactInfo")}</SectionTitle>
        <FieldGrid>
          <CheckoutFormField
            label={t("email")}
            field={{
              ...email,
              onBlur: (e) => {
                email.onBlur(e);
                const v = (e?.target?.value || email.value || "").trim();
                if (v && validateEmail(v)) {
                  getMedusaClient().patchStoreCart(cartId, { email: v }).catch(() => {});
                }
              },
            }}
            type="email"
            validate={validateEmail}
            autoComplete="email"
          />
          <CheckoutFormField label={t("phone")} field={phone} type="tel" autoComplete="tel" />
        </FieldGrid>
        <FieldGrid $cols="1fr 1fr">
          <CheckoutFormField
            label={t("firstName")}
            field={{
              ...firstName,
              onBlur: (e) => {
                firstName.onBlur(e);
                const v = (e?.target?.value || firstName.value || "").trim();
                if (v) getMedusaClient().patchStoreCart(cartId, { first_name: v }).catch(() => {});
              },
            }}
            autoComplete="given-name"
          />
          <CheckoutFormField
            label={t("lastName")}
            field={{
              ...lastName,
              onBlur: (e) => {
                lastName.onBlur(e);
                const v = (e?.target?.value || lastName.value || "").trim();
                if (v) getMedusaClient().patchStoreCart(cartId, { last_name: v }).catch(() => {});
              },
            }}
            autoComplete="family-name"
          />
        </FieldGrid>
      </FormCard>

      <FormCard style={{ marginBottom: 24 }}>
        <SectionTitle>{t("shippingAddress")}</SectionTitle>
        {savedAddresses.length > 0 && (
          <FieldWrap style={{ marginBottom: 16 }}>
            <Label>Gespeicherte Adresse wählen</Label>
            <select
              value={shipAddrId}
              onChange={(e) => {
                const id = e.target.value;
                setShipAddrId(id);
                const a = savedAddresses.find((x) => x.id === id);
                if (a) {
                  applyToField(address, a.address_line1 || "");
                  applyToField(address2, a.address_line2 || "");
                  applyToField(city, a.city || "");
                  applyToField(postalCode, a.zip_code || "");
                  const sc = pickShipCountry(a.country);
                  applyToField(country, sc);
                  onCountryChange?.(sc);
                }
              }}
              style={{
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.9375rem",
                fontFamily: "inherit",
                color: "#111827",
                background: "#fff",
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <option value="">Neue Adresse eingeben …</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {[a.label, a.address_line1, a.zip_code, a.city].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </FieldWrap>
        )}
        <FieldGrid>
          <CheckoutFormField label={t("address")} field={address} fullWidth autoComplete="street-address" />
          <CheckoutFormField label={t("address2")} field={address2} fullWidth autoComplete="address-line2" />
        </FieldGrid>
        <FieldGrid $cols="1fr 1fr">
          <CheckoutFormField label={t("postalCode")} field={postalCode} autoComplete="postal-code" />
          <CheckoutFormField label={t("city")} field={city} autoComplete="address-level2" />
        </FieldGrid>
        <FieldGrid>
          <FieldWrap>
            <Label>{t("country")}</Label>
            {shipList.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
                {t("noShippableCountries")}
              </p>
            ) : (
              <select
                value={shipList.some((c) => c.code === country.value) ? country.value : shipList[0].code}
                onChange={(e) => {
                  const v = e.target.value;
                  country.onChange({ target: { value: v } });
                  onCountryChange?.(v);
                }}
                autoComplete="country"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: "0.9375rem",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: "#fff",
                }}
              >
                {shipList.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            )}
          </FieldWrap>
        </FieldGrid>

        {/* Separate billing address — unchecked: bill to shipping */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <CustomCheckbox
            id="billing-separate"
            checked={billingSeparateFromShipping}
            onChange={(e) => setBillingSeparateFromShipping(e.target.checked)}
            size={18}
          />
          <label htmlFor="billing-separate" style={{ fontSize: "0.875rem", color: "#374151", cursor: "pointer", userSelect: "none" }}>
            {t("billingSeparateFromShipping")}
          </label>
        </div>
      </FormCard>

      {billingSeparateFromShipping && (
        <FormCard style={{ marginBottom: 24 }}>
          <SectionTitle>{t("billingAddress")}</SectionTitle>
          {savedAddresses.length > 0 && (
            <FieldWrap style={{ marginBottom: 16 }}>
              <Label>Rechnungsadresse aus Konto</Label>
              <select
                value={billAddrId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBillAddrId(id);
                  const a = savedAddresses.find((x) => x.id === id);
                  if (a) {
                    applyToField(billingAddress, a.address_line1 || "");
                    applyToField(billingAddress2, a.address_line2 || "");
                    applyToField(billingCity, a.city || "");
                    applyToField(billingPostalCode, a.zip_code || "");
                    applyToField(billingCountry, pickShipCountry(a.country));
                  }
                }}
                style={{
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: "0.9375rem",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: "#fff",
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Andere Rechnungsadresse eingeben …</option>
                {savedAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {[a.label, a.address_line1, a.zip_code, a.city].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </FieldWrap>
          )}
          <FieldGrid>
            <CheckoutFormField label={t("address")} field={billingAddress} fullWidth autoComplete="billing street-address" />
            <CheckoutFormField label={t("address2")} field={billingAddress2} fullWidth autoComplete="billing address-line2" />
          </FieldGrid>
          <FieldGrid $cols="1fr 1fr">
            <CheckoutFormField label={t("postalCode")} field={billingPostalCode} autoComplete="billing postal-code" />
            <CheckoutFormField label={t("city")} field={billingCity} autoComplete="billing address-level2" />
          </FieldGrid>
          <FieldGrid>
            <FieldWrap>
              <Label>{t("country")}</Label>
              {shipList.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>{t("noShippableCountries")}</p>
              ) : (
                <select
                  value={shipList.some((c) => c.code === billingCountry.value) ? billingCountry.value : shipList[0].code}
                  onChange={(e) => billingCountry.onChange({ target: { value: e.target.value } })}
                  autoComplete="billing country"
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: "0.9375rem",
                    fontFamily: "inherit",
                    color: "#111827",
                    background: "#fff",
                  }}
                >
                  {shipList.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              )}
            </FieldWrap>
          </FieldGrid>
        </FormCard>
      )}

      {user?.id && !shipAddrId && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "0.875rem",
              color: "#374151",
              cursor: "pointer",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <CustomCheckbox
              checked={saveNewAddress}
              onChange={(e) => setSaveNewAddress(e.target.checked)}
              size={18}
            />
            {t("saveAddress")}
          </label>
        </div>
      )}

      <FormCard>
        <SectionTitle>{t("payment")}</SectionTitle>
        <StripePaymentWrap>
          <PaymentElement
            options={{
              layout: paymentMethodLayout === "list"
                ? { type: "accordion", defaultCollapsed: false, radios: true, spacedAccordionItems: false }
                : "tabs",
            }}
            onReady={() => setPaymentElementReady(true)}
            onLoadError={() => {
              setPaymentElementReady(false);
              setError(t("paymentError"));
            }}
          />
        </StripePaymentWrap>
        {error && <ErrorBox>{error}</ErrorBox>}
        <CheckoutSubmitWrapFooter>
          <PayNowButton
            type="submit"
            disabled={!stripe || !elements || !paymentElementReady || processing || paymentIntentRefreshing}
          >
            {processing ? t("processing") : paymentIntentRefreshing ? t("processing") : `${t("placeOrder")} – ${formatPriceCents(payCentsDisplay)} €`}
          </PayNowButton>
        </CheckoutSubmitWrapFooter>
      </FormCard>
    </form>
  );
}

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const { cart, subtotalCents, setCart, clearBonusPoints, bonusDiscountCents, shippingGroups } = useCart();
  const items = cart?.items || [];

  const prefix = useMarketPrefix();
  const marketCountryCode = (prefix?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const [shippingCountry, setShippingCountry] = useState(marketCountryCode);

  const shippableCountries = useMemo(() => getShippableCountries(shippingGroups, locale), [shippingGroups, locale]);

  useEffect(() => {
    if (!shippableCountries.length) return;
    const codes = new Set(shippableCountries.map((c) => c.code));
    setShippingCountry((prev) => {
      if (codes.has(prev)) return prev;
      return shippableCountries[0].code;
    });
  }, [shippableCountries]);

  useEffect(() => {
    try {
      const iso = normalizeIsoCountryCode(shippingCountry);
      if (iso) {
        localStorage.setItem(CHECKOUT_SHIPPING_COUNTRY_LS, iso);
        localStorage.setItem(CHECKOUT_SHIPPING_MARKET_COUNTRY_LS, marketCountryCode);
      }
    } catch (_) {}
  }, [shippingCountry, marketCountryCode]);

  const [allThresholds, setAllThresholds] = useState(null);
  useEffect(() => {
    fetch("/api/store-seller-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.free_shipping_thresholds && typeof d.free_shipping_thresholds === "object") {
          setAllThresholds(d.free_shipping_thresholds);
        } else if (d?.free_shipping_threshold_cents != null) {
          setAllThresholds({ DE: d.free_shipping_threshold_cents });
        }
      })
      .catch(() => {});
  }, []);

  const envThreshold =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS
      ? Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS)
      : null;
  const freeShippingThreshold = resolveFreeShippingThresholdCents(allThresholds, shippingCountry, envThreshold);
  const effectiveSubtotal = subtotalCents - bonusDiscountCents;

  let shippingCents = null;
  for (const item of items) {
    const groupId = item.shipping_group_id || item.metadata?.shipping_group_id || item.variant?.product?.metadata?.shipping_group_id || item.product?.metadata?.shipping_group_id;
    if (!groupId) continue;
    const group = findShippingGroup(shippingGroups, groupId);
    if (!group?.prices || typeof group.prices !== "object") continue;
    const p = resolveShippingQuoteCents(group.prices, shippingCountry);
    if (p == null) continue;
    if (shippingCents === null || p > shippingCents) shippingCents = p;
  }
  const isFreeShipping = freeShippingThreshold != null && effectiveSubtotal >= freeShippingThreshold;
  const shippingLabel = isFreeShipping
    ? t("freeShipping")
    : shippingCents != null
      ? `${formatPriceCents(shippingCents)} €`
      : t("shippingPending");

  const [clientSecret, setClientSecret] = useState(null);
  const [loadingPI, setLoadingPI] = useState(false);
  const [piError, setPiError] = useState(null);
  const [payCents, setPayCents] = useState(null);
  const [bonusDraft, setBonusDraft] = useState("");
  const [bonusErr, setBonusErr] = useState("");
  const [balancePoints, setBalancePoints] = useState(null);
  const [bonusApplying, setBonusApplying] = useState(false);
  const [couponDraft, setCouponDraft] = useState("");
  const [couponErr, setCouponErr] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [piRefreshKey, setPiRefreshKey] = useState(0);
  const [customerToken, setCustomerToken] = useState(null);
  /** Cancel previous unpaid PI when bonus/Versand triggers a new PaymentIntent (fewer orphaned „incomplete“ in Stripe). */
  const lastPaymentIntentIdRef = useRef(null);

  const [stripePromiseState, setStripePromiseState] = useState(null);
  const [stripePkLoading, setStripePkLoading] = useState(true);
  const [paymentMethodTypes, setPaymentMethodTypes] = useState(["card"]);
  const [paymentMethodLayout, setPaymentMethodLayout] = useState("grid");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-public-payment-config")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const pk = (d?.stripe_publishable_key || "").trim();
        const pmTypes = Array.isArray(d?.payment_method_types) && d.payment_method_types.length
          ? d.payment_method_types.map((x) => String(x || "").toLowerCase()).filter(Boolean)
          : ["card"];
        setPaymentMethodTypes(pmTypes);
        setPaymentMethodLayout(d?.payment_method_layout === "list" ? "list" : "grid");
        if (pk) setStripePromiseState(loadStripe(pk));
        setStripePkLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPaymentMethodTypes(["card"]);
          setStripePkLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCustomerToken(getToken("customer"));
  }, []);

  useEffect(() => {
    lastPaymentIntentIdRef.current = null;
  }, [cart?.id]);

  useEffect(() => {
    const pts = cart?.bonus_points_reserved ?? 0;
    setBonusDraft(String(pts || ""));
  }, [cart?.bonus_points_reserved]);
  useEffect(() => {
    setCouponDraft(String(cart?.coupon_code || ""));
  }, [cart?.coupon_code]);

  useEffect(() => {
    if (!customerToken) {
      setBalancePoints(null);
      return;
    }
    const client = getMedusaClient();
    client.getCustomer(customerToken).then((r) => {
      setBalancePoints(r?.customer?.bonus_points ?? 0);
    });
  }, [customerToken, cart?.id]);

  const applyBonusRedemption = async () => {
    setBonusErr("");
    if (!cart?.id) return;
    const tok = getToken("customer");
    if (!tok) {
      setBonusErr(t("bonusLogin"));
      return;
    }
    setBonusApplying(true);
    try {
      const raw = String(bonusDraft || "").replace(/\D/g, "");
      const pts = Math.max(0, parseInt(raw, 10) || 0);
      const client = getMedusaClient();
      const out = await client.patchStoreCart(cart.id, { bonus_points_reserved: pts }, tok);
      if (out?.__error) {
        setBonusErr(out.message || t("bonusError"));
        return;
      }
      // Update only bonus_points_reserved — don't replace whole cart (items would be lost)
      const newPts = out.bonus_points_reserved ?? out.cart?.bonus_points_reserved ?? pts;
      setCart((prev) => (prev ? { ...prev, bonus_points_reserved: newPts } : prev));
      setBonusDraft(String(newPts));
      // Force a fresh PaymentIntent whenever bonus changes.
      setClientSecret(null);
      setPayCents(null);
      setPiRefreshKey((k) => k + 1);
      // Fetch updated balance in background
      client.getCustomer(tok).then((r2) => {
        setBalancePoints(r2?.customer?.bonus_points ?? 0);
      }).catch(() => {});
    } catch (e) {
      setBonusErr(e?.message || t("bonusError"));
    } finally {
      setBonusApplying(false);
    }
  };

  const removeBonusRedemption = async () => {
    setBonusErr("");
    setBonusApplying(true);
    try {
      const tok = getToken("customer");
      await clearBonusPoints(tok);
      setBonusDraft("");
      setClientSecret(null);
      setPayCents(null);
      setPiRefreshKey((k) => k + 1);
    } catch (_) {}
    finally {
      setBonusApplying(false);
    }
  };

  const applyCouponCode = async () => {
    setCouponErr("");
    if (!cart?.id) return;
    setCouponApplying(true);
    try {
      const code = String(couponDraft || "").trim();
      const client = getMedusaClient();
      const out = await client.patchStoreCart(cart.id, { coupon_code: code });
      if (out?.__error) {
        setCouponErr(out.message || "Coupon konnte nicht angewendet werden.");
        return;
      }
      const newCode = out?.coupon_code ?? out?.cart?.coupon_code ?? code;
      const newDiscount = out?.coupon_discount_cents ?? out?.cart?.coupon_discount_cents ?? 0;
      setCart((prev) => (prev ? { ...prev, coupon_code: newCode || null, coupon_discount_cents: Number(newDiscount || 0) } : prev));
      setCouponDraft(String(newCode || ""));
      setClientSecret(null);
      setPayCents(null);
      setPiRefreshKey((k) => k + 1);
    } catch (e) {
      setCouponErr(e?.message || "Coupon konnte nicht angewendet werden.");
    } finally {
      setCouponApplying(false);
    }
  };

  const removeCouponCode = async () => {
    setCouponErr("");
    if (!cart?.id) return;
    setCouponApplying(true);
    try {
      const client = getMedusaClient();
      const out = await client.patchStoreCart(cart.id, { coupon_code: "" });
      if (out?.__error) {
        setCouponErr(out.message || "Coupon konnte nicht entfernt werden.");
        return;
      }
      setCart((prev) => (prev ? { ...prev, coupon_code: null, coupon_discount_cents: 0 } : prev));
      setCouponDraft("");
      setClientSecret(null);
      setPayCents(null);
      setPiRefreshKey((k) => k + 1);
    } catch (e) {
      setCouponErr(e?.message || "Coupon konnte nicht entfernt werden.");
    } finally {
      setCouponApplying(false);
    }
  };

  useEffect(() => {
    if (!cart?.id || items.length === 0 || !stripePromiseState) return;

    const effectiveShippingCents = isFreeShipping ? 0 : (shippingCents ?? 0);

    if (typeof window !== "undefined") {
      const returnedSecret = new URLSearchParams(window.location.search).get(
        "payment_intent_client_secret",
      );
      if (returnedSecret) {
        setClientSecret(returnedSecret);
        setPiError(null);
        setLoadingPI(false);
        const couponDisc = Number(cart?.coupon_discount_cents || 0);
        setPayCents(Math.max(0, subtotalCents - bonusDiscountCents - couponDisc + effectiveShippingCents));
        return;
      }
    }

    setLoadingPI(true);
    setPiError(null);
    setClientSecret(null);
    setPayCents(null);
    const custTok = getToken("customer");
    const paymentIntentHeaders = { "Content-Type": "application/json" };
    if (custTok) paymentIntentHeaders.Authorization = `Bearer ${custTok}`;
    const cancelId = lastPaymentIntentIdRef.current;
    fetch("/api/store-payment-intent", {
      method: "POST",
      headers: paymentIntentHeaders,
      body: JSON.stringify({
        cart_id: cart.id,
        shipping_cents: effectiveShippingCents,
        ...(cancelId ? { cancel_payment_intent_id: cancelId } : {}),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.client_secret) {
          setClientSecret(data.client_secret);
          if (data.payment_intent_id) lastPaymentIntentIdRef.current = data.payment_intent_id;
          setPayCents(typeof data.amount_cents === "number" ? data.amount_cents : subtotalCents - bonusDiscountCents - Number(cart?.coupon_discount_cents || 0) + effectiveShippingCents);
        } else {
          setPiError(data?.message || t("configError"));
          setPayCents(null);
        }
      })
      .catch(() => {
        setPiError(t("configError"));
        setPayCents(null);
      })
      .finally(() => setLoadingPI(false));
  }, [cart?.id, subtotalCents, bonusDiscountCents, cart?.coupon_discount_cents, shippingCents, isFreeShipping, shippingCountry, t, items.length, piRefreshKey, stripePromiseState]);

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <BackLink href="/cart">
          <i className="fas fa-arrow-left" style={{ fontSize: 13 }} /> {t("backToCart")}
        </BackLink>
        <Title>{t("title")}</Title>

        {stripePkLoading && items.length > 0 ? (
          <GlobalPageLoader label={t("processing")} />
        ) : !stripePromiseState ? (
          <ErrorBox style={{ maxWidth: 540 }}>{t("configError")}</ErrorBox>
        ) : items.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: "1rem" }}>
            <Link href="/cart" style={{ color: tokens.primary.DEFAULT }}>{t("backToCart")}</Link>
          </div>
        ) : (
          <Layout>
            <SummaryCard>
              <SectionTitle>{t("orderSummary")}</SectionTitle>
              {items.map((item) => {
                const productHref = item.product_handle ? `/produkt/${item.product_handle}` : null;
                const lineTitle = getLocalizedCartLineTitle(item, locale);
                const row = (
                  <>
                    <SummaryThumb>
                      {item.thumbnail ? (
                        <img src={resolveImageUrl(item.thumbnail)} alt={lineTitle} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                      )}
                    </SummaryThumb>
                    <SummaryItemDetails>
                      <SummaryItemTitle>
                        <span>{lineTitle}</span>
                        {isBestsellerMetadata(item?.product_metadata || {}) && <BestsellerBadge />}
                      </SummaryItemTitle>
                      <SummaryItemQty>× {item.quantity}</SummaryItemQty>
                    </SummaryItemDetails>
                    <SummaryItemPrice>
                      {formatPriceCents((item.unit_price_cents || 0) * (item.quantity || 1))} €
                    </SummaryItemPrice>
                  </>
                );
                return productHref ? (
                  <SummaryItemLink key={item.id} href={productHref} title={lineTitle}>
                    {row}
                  </SummaryItemLink>
                ) : (
                  <SummaryItem key={item.id}>{row}</SummaryItem>
                );
              })}
              <Divider />
              <div style={{ marginBottom: 16 }}>
                <Label as="div" style={{ marginBottom: 8, display: "block" }}>{t("bonusTitle")}</Label>
                {customerToken ? (
                  <>
                    {balancePoints != null && (
                      <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0 0 8px" }}>
                        {t("bonusBalance", { points: Math.max(0, balancePoints - (cart?.bonus_points_reserved ?? 0)) })}
                        {(cart?.bonus_points_reserved ?? 0) > 0 && (
                          <span style={{ color: "#16a34a", marginLeft: 6, fontWeight: 600 }}>
                            (−{cart.bonus_points_reserved} reserviert)
                          </span>
                        )}
                      </p>
                    )}
                    <p style={{ fontSize: "0.7rem", color: "#9ca3af", margin: "0 0 8px", lineHeight: 1.4 }}>{t("bonusHint")}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Bonuspunkte einlösen"
                        value={bonusDraft}
                        onChange={(e) => setBonusDraft(e.target.value)}
                        placeholder={t("bonusPlaceholder")}
                        style={{
                          flex: "1 1 120px",
                          minWidth: 100,
                          padding: "8px 10px",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                          fontSize: "0.875rem",
                        }}
                      />
                      <button
                        type="button"
                        onClick={applyBonusRedemption}
                        disabled={bonusApplying}
                        style={{
                          padding: "8px 14px",
                          background: tokens.primary.DEFAULT,
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          cursor: bonusApplying ? "wait" : "pointer",
                          opacity: bonusApplying ? 0.7 : 1,
                        }}
                      >
                        {t("bonusApply")}
                      </button>
                    </div>
                    {bonusErr ? <p style={{ fontSize: "0.75rem", color: "#b91c1c", margin: "8px 0 0" }}>{bonusErr}</p> : null}
                  </>
                ) : (
                  <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: 0 }}>{t("bonusLogin")}</p>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label as="div" style={{ marginBottom: 8, display: "block" }}>Coupon code</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    aria-label="Coupon-Code"
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value)}
                    placeholder="z. B. SAVE10"
                    style={{
                      flex: "1 1 140px",
                      minWidth: 120,
                      padding: "8px 10px",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      fontSize: "0.875rem",
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyCouponCode}
                    disabled={couponApplying}
                    style={{
                      padding: "8px 14px",
                      background: tokens.primary.DEFAULT,
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: couponApplying ? "wait" : "pointer",
                      opacity: couponApplying ? 0.7 : 1,
                    }}
                  >
                    Anwenden
                  </button>
                  {(cart?.coupon_code || "").trim() && (
                    <button
                      type="button"
                      onClick={removeCouponCode}
                      disabled={couponApplying}
                      style={{
                        padding: "8px 14px",
                        background: "#fff",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: couponApplying ? "wait" : "pointer",
                        opacity: couponApplying ? 0.7 : 1,
                      }}
                    >
                      Entfernen
                    </button>
                  )}
                </div>
                {couponErr ? <p style={{ fontSize: "0.75rem", color: "#b91c1c", margin: "8px 0 0" }}>{couponErr}</p> : null}
              </div>
              <Divider />
              <SummaryRow>
                <span>{t("subtotal")}</span>
                <span>{formatPriceCents(subtotalCents)} €</span>
              </SummaryRow>
              {bonusDiscountCents > 0 && (
                <SummaryRow style={{ color: "#16a34a" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t("bonusDiscount")}
                    <button
                      type="button"
                      onClick={removeBonusRedemption}
                      disabled={bonusApplying}
                      title="Bonusrabatt entfernen"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: bonusApplying ? "wait" : "pointer",
                        color: "#6b7280",
                        padding: "0 2px",
                        fontSize: 14,
                        lineHeight: 1,
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        opacity: bonusApplying ? 0.5 : 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                  <span>−{formatPriceCents(bonusDiscountCents)} €</span>
                </SummaryRow>
              )}
              {Number(cart?.coupon_discount_cents || 0) > 0 && (
                <SummaryRow style={{ color: "#16a34a" }}>
                  <span>Coupon-Rabatt {(cart?.coupon_code || "").trim() ? `(${cart.coupon_code})` : ""}</span>
                  <span>−{formatPriceCents(Number(cart?.coupon_discount_cents || 0))} €</span>
                </SummaryRow>
              )}
              <SummaryRow>
                <span>{t("shipping")}</span>
                <span style={{ color: isFreeShipping ? "#16a34a" : undefined }}>{shippingLabel}</span>
              </SummaryRow>
              <SummaryTotal>
                <span>{t("total")}</span>
                <span>{formatPriceCents(payCents != null ? payCents : subtotalCents)} €</span>
              </SummaryTotal>
            </SummaryCard>

            <div>
              {piError && <ErrorBox style={{ marginBottom: 24 }}>{piError}</ErrorBox>}
              {loadingPI && <GlobalPageLoader label={t("processing")} />}
              {clientSecret && stripePromiseState && (
                <Elements
                  key={`${cart.id}-${clientSecret}`}
                  stripe={stripePromiseState}
                  options={{
                    clientSecret,
                    locale,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: tokens.primary.DEFAULT,
                        fontFamily: tokens.fontFamily.sans,
                        borderRadius: "8px",
                      },
                    },
                  }}
                >
                  <CheckoutForm
                    clientSecret={clientSecret}
                    cartId={cart.id}
                    items={items}
                    subtotalCents={subtotalCents}
                    amountToPayCents={payCents}
                    shippingCents={isFreeShipping ? 0 : (shippingCents ?? 0)}
                    onCountryChange={setShippingCountry}
                    defaultCountry={shippingCountry}
                    shippableCountries={shippableCountries}
                    paymentIntentRefreshing={loadingPI}
                    paymentMethodTypes={paymentMethodTypes}
                    paymentMethodLayout={paymentMethodLayout}
                  />
                </Elements>
              )}
            </div>
          </Layout>
        )}
      </Main>
      <Footer />
    </PageWrap>
  );
}
