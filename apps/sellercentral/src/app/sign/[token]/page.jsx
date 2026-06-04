"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://api.andertal.com").replace(/\/$/, "");

const CONTRACT_SECTIONS = {
  de: [
    { heading: "Präambel", body: "Diese Vereinbarung regelt die Rechtsbeziehung zwischen dem Betreiber der Plattform Andertal (nachfolgend „Plattform") und dem registrierten Verkäufer (nachfolgend „Verkäufer"). Mit Abschluss der Verifizierung erklärt sich der Verkäufer mit allen nachfolgenden Bedingungen einverstanden." },
    { heading: "§ 1 – Vertragsgegenstand", body: "Die Plattform stellt dem Verkäufer eine technische Infrastruktur zum Anbieten, Verwalten und Verkaufen von Waren gegenüber Endverbrauchern zur Verfügung. Der Verkäufer tritt als eigenverantwortlicher Händler im eigenen Namen und auf eigene Rechnung auf." },
    { heading: "§ 2 – Pflichten des Verkäufers", body: "Der Verkäufer verpflichtet sich:\n• Ausschließlich legale Waren anzubieten und geltende Vorschriften einzuhalten.\n• Vollständige und korrekte Geschäftsdaten bereitzustellen und aktuell zu halten.\n• Bestellungen innerhalb der angegebenen Lieferfristen zu erfüllen.\n• Gesetzliche Gewährleistungsrechte und 14-tägiges Widerrufsrecht zu beachten.\n• Keine Preisabsprachen oder unlauteren Wettbewerb zu betreiben." },
    { heading: "§ 3 – Datenschutz (DSGVO)", body: "Der Verkäufer verarbeitet personenbezogene Daten von Endkunden ausschließlich zur Vertragserfüllung. Eine Weitergabe an Dritte ohne Rechtsgrundlage ist untersagt. Betroffenenanfragen sind innerhalb von 30 Tagen zu beantworten." },
    { heading: "§ 4 – Provisionen und Zahlungsbedingungen", body: "Die Plattform erhebt eine Transaktionsgebühr gemäß der zum Zeitpunkt des Verkaufs gültigen Preisliste. Auszahlungen erfolgen nach Auftragsabschluss und Ablauf der Rückgabefrist. Bei Verzug werden Verzugszinsen gemäß § 288 BGB fällig." },
    { heading: "§ 5 – Ranking und Sichtbarkeit", body: "Gemäß EU-Verordnung 2019/1150 informiert die Plattform über die wesentlichen Ranking-Parameter: Produktqualität, Kundenbewertungen, Bestellabwicklungsrate, Preisgestaltung und Konto-Compliance." },
    { heading: "§ 6 – Kontosperrung und Kündigung", body: "Die Plattform kann das Konto bei schwerwiegenden Verstößen sperren oder kündigen. Dem Verkäufer wird, sofern möglich, eine Frist zur Stellungnahme eingeräumt. Der Verkäufer kann jederzeit mit 30 Tagen Frist kündigen." },
    { heading: "§ 7 – Haftungsbeschränkung", body: "Die Plattform haftet nicht für Schäden durch fehlerhafte Produktangaben des Verkäufers, Lieferverzögerungen oder Produktmängel. Die Haftung für mittelbare Schäden ist – außer bei Vorsatz – ausgeschlossen." },
    { heading: "§ 8 – Streitbeilegung", body: "Streitigkeiten werden zunächst intern über support@andertal.com behandelt. Als externe Stelle steht das EU-ODR-Portal (https://ec.europa.eu/consumers/odr/) zur Verfügung. Es gilt deutsches Recht, Gerichtsstand Berlin." },
    { heading: "§ 9 – Schlussbestimmungen", body: "Änderungen werden mindestens 15 Tage vor Inkrafttreten per E-Mail mitgeteilt. Sollten einzelne Bestimmungen unwirksam sein, bleiben die übrigen wirksam. Letzte Aktualisierung: April 2026." },
  ],
  tr: [
    { heading: "Önsöz", body: "Bu sözleşme, Andertal platformunun işletmecisi (\"Platform\") ile kayıtlı satıcı (\"Satıcı\") arasındaki hukuki ilişkiyi düzenler." },
    { heading: "Madde 1 – Konu", body: "Platform, Satıcıya ürün sunma, yönetme ve satma amacıyla teknik altyapı sağlar. Satıcı bağımsız bir tacir olarak hareket eder." },
    { heading: "Madde 2 – Satıcı Yükümlülükleri", body: "Satıcı;\n• Yalnızca yasal ürünler sunmayı,\n• Doğru ticari bilgiler sağlamayı,\n• Siparişleri zamanında yerine getirmeyi,\n• Yasal garanti ve cayma haklarına uymayı,\n• Haksız rekabetten kaçınmayı taahhüt eder." },
    { heading: "Madde 3 – Kişisel Veriler (KVKK/GDPR)", body: "Satıcı, müşteri verilerini yalnızca sözleşmenin ifası için işler. Hukuki dayanak olmaksızın veri aktarımı yasaktır. Veri sahibi talepleri 30 gün içinde yanıtlanmalıdır." },
    { heading: "Madde 4 – Komisyon ve Ödeme", body: "Platform, geçerli fiyat listesine göre işlem ücreti alır. Ödemeler sipariş tamamlanıp iade süresi dolduktan sonra yapılır." },
    { heading: "Madde 5 – Sıralama", body: "P2B Tüzüğü kapsamında Platform sıralama parametrelerini şeffaf biçimde açıklar: ürün kalitesi, değerlendirmeler, teslimat oranı ve hesap uyumluluğu." },
    { heading: "Madde 6 – Askıya Alma ve Fesih", body: "Platform ağır ihlallerde hesabı askıya alabilir. Satıcı 30 gün önceden bildirerek feshedebilir." },
    { heading: "Madde 7 – Sorumluluk", body: "Platform, Satıcı kaynaklı zararlardan sorumlu değildir. Dolaylı zararlar için sorumluluk sınırlıdır." },
    { heading: "Madde 8 – Uyuşmazlık", body: "Uyuşmazlıklar önce support@andertal.com üzerinden çözülür. Yetkili mahkeme Berlin'dir." },
    { heading: "Madde 9 – Son Hükümler", body: "Değişiklikler en az 15 gün önce bildirilir. Son güncelleme: Nisan 2026." },
  ],
  en: [
    { heading: "Preamble", body: "This Agreement governs the legal relationship between the operator of the Andertal platform (\"Platform\") and the registered seller (\"Seller\")." },
    { heading: "Article 1 – Subject Matter", body: "The Platform provides the Seller with technical infrastructure to list, manage, and sell goods to end consumers. The Seller acts as an independent trader." },
    { heading: "Article 2 – Seller Obligations", body: "The Seller undertakes to:\n• Offer only lawful goods and comply with applicable regulations.\n• Provide complete and accurate business information.\n• Fulfill orders within stated delivery times.\n• Respect warranty rights and grant a 14-day right of withdrawal.\n• Refrain from price-fixing or unfair competition." },
    { heading: "Article 3 – Data Protection (GDPR)", body: "The Seller processes customer personal data solely for contract performance. Transfer to third parties without legal basis is prohibited. Data subject requests must be answered within 30 days." },
    { heading: "Article 4 – Fees and Payment", body: "The Platform charges a transaction fee per the price list valid at the time of sale. Payouts are made after order completion and the return period expires." },
    { heading: "Article 5 – Ranking", body: "Pursuant to EU Regulation 2019/1150, the Platform discloses ranking parameters: product quality, reviews, fulfillment rate, pricing, and account compliance." },
    { heading: "Article 6 – Suspension and Termination", body: "The Platform may suspend accounts for serious violations. The Seller may terminate with 30 days' notice." },
    { heading: "Article 7 – Limitation of Liability", body: "The Platform is not liable for damages caused by the Seller. Indirect damages are excluded except in cases of intent or gross negligence." },
    { heading: "Article 8 – Dispute Resolution", body: "Disputes are first addressed via support@andertal.com. EU ODR platform is available. German law applies; jurisdiction is Berlin." },
    { heading: "Article 9 – Final Provisions", body: "Changes are communicated at least 15 days before taking effect. Last updated: April 2026." },
  ],
};

const LABELS = {
  de: {
    title: "Verkäufer-Vereinbarung unterzeichnen",
    loading: "Lade Vereinbarung...",
    expired: "Dieser Link ist abgelaufen oder ungültig.",
    alreadySigned: "Diese Vereinbarung wurde bereits unterzeichnet.",
    seller: "Verkäufer",
    company: "Unternehmen",
    clearBtn: "Löschen",
    signBtn: "Jetzt unterzeichnen",
    submitting: "Wird übermittelt...",
    successTitle: "Vereinbarung erfolgreich unterzeichnet!",
    successBody: "Deine Unterschrift wurde gespeichert und ein PDF wurde erstellt.",
    errorSubmit: "Fehler beim Senden der Unterschrift.",
    drawHint: "Zeichne deine Unterschrift im Feld unten:",
    emptySignature: "Bitte zeichne zuerst eine Unterschrift.",
  },
  tr: {
    title: "Satıcı Sözleşmesini İmzala",
    loading: "Sözleşme yükleniyor...",
    expired: "Bu bağlantı süresi dolmuş veya geçersiz.",
    alreadySigned: "Bu sözleşme zaten imzalandı.",
    seller: "Satıcı",
    company: "Şirket",
    clearBtn: "Temizle",
    signBtn: "İmzala",
    submitting: "Gönderiliyor...",
    successTitle: "Sözleşme başarıyla imzalandı!",
    successBody: "İmzanız kaydedildi ve PDF oluşturuldu.",
    errorSubmit: "İmza gönderilirken hata oluştu.",
    drawHint: "Aşağıdaki alana imzanızı çizin:",
    emptySignature: "Lütfen önce imzanızı çizin.",
  },
  en: {
    title: "Sign Seller Agreement",
    loading: "Loading agreement...",
    expired: "This link has expired or is invalid.",
    alreadySigned: "This agreement has already been signed.",
    seller: "Seller",
    company: "Company",
    clearBtn: "Clear",
    signBtn: "Sign now",
    submitting: "Submitting...",
    successTitle: "Agreement signed successfully!",
    successBody: "Your signature has been saved and a PDF has been generated.",
    errorSubmit: "Error submitting signature.",
    drawHint: "Draw your signature in the box below:",
    emptySignature: "Please draw your signature first.",
  },
};

export default function SignPage() {
  const params = useParams();
  const token = params?.token || "";

  const [sessionInfo, setSessionInfo] = useState(null);
  const [pageState, setPageState] = useState("loading"); // loading | ready | expired | already_signed | success | error
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const locale = sessionInfo?.locale || "de";
  const t = LABELS[locale] || LABELS.en;
  const sections = CONTRACT_SECTIONS[locale] || CONTRACT_SECTIONS.en;

  useEffect(() => {
    if (!token) { setPageState("expired"); return; }
    fetch(`${BACKEND_URL}/public/sign/${token}`)
      .then((r) => {
        if (r.status === 410) { setPageState("already_signed"); return null; }
        if (!r.ok) { setPageState("expired"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setSessionInfo(data);
        setPageState("ready");
      })
      .catch(() => setPageState("expired"));
  }, [token]);

  // Canvas drawing helpers
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    lastPos.current = pos;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = (e) => {
    e?.preventDefault();
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return !data.some((v, i) => i % 4 === 3 && v > 0);
  };

  const handleSubmit = async () => {
    setSubmitError("");
    if (isCanvasEmpty()) { setSubmitError(t.emptySignature); return; }
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL("image/png");
    setSubmitting(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/public/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_data: signatureData }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.message || t.errorSubmit);
      }
      setPageState("success");
    } catch (e) {
      setSubmitError(e?.message || t.errorSubmit);
    } finally {
      setSubmitting(false);
    }
  };

  const containerStyle = {
    maxWidth: 480,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#111",
  };

  if (pageState === "loading") {
    return (
      <div style={containerStyle}>
        <p style={{ color: "#666", textAlign: "center", marginTop: 80 }}>{t.loading}</p>
      </div>
    );
  }

  if (pageState === "expired") {
    return (
      <div style={containerStyle}>
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 16, marginTop: 40, textAlign: "center" }}>
          <p style={{ color: "#b91c1c", fontWeight: 600 }}>{t.expired}</p>
        </div>
      </div>
    );
  }

  if (pageState === "already_signed") {
    return (
      <div style={containerStyle}>
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginTop: 40, textAlign: "center" }}>
          <p style={{ color: "#15803d", fontWeight: 600 }}>✓ {t.alreadySigned}</p>
        </div>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div style={containerStyle}>
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 20, marginTop: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <p style={{ color: "#15803d", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{t.successTitle}</p>
          <p style={{ color: "#374151", fontSize: 14 }}>{t.successBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{t.title}</h1>
      {sessionInfo?.seller_name && (
        <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
          {t.seller}: <strong>{sessionInfo.seller_name}</strong>
          {sessionInfo.company_name && <> · {t.company}: <strong>{sessionInfo.company_name}</strong></>}
        </p>
      )}
      <div style={{ height: 1, background: "#e5e7eb", margin: "12px 0 16px" }} />

      {/* Contract sections */}
      <div style={{ maxHeight: "45vh", overflowY: "auto", marginBottom: 20, paddingRight: 4 }}>
        {sections.map((sec, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{sec.heading}</p>
            <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, whiteSpace: "pre-line" }}>{sec.body}</p>
          </div>
        ))}
      </div>

      {/* Signature canvas */}
      <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t.drawHint}</p>
      <div style={{ border: "2px solid #374151", borderRadius: 8, background: "#fff", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={448}
          height={160}
          style={{ display: "block", width: "100%", borderRadius: 6, cursor: "crosshair" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, marginBottom: 16 }}>
        <button
          type="button"
          onClick={clearCanvas}
          style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 12px", fontSize: 13, cursor: "pointer", color: "#374151" }}
        >
          {t.clearBtn}
        </button>
      </div>

      {submitError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#b91c1c" }}>
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: "100%",
          background: submitting ? "#6b7280" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "14px",
          fontSize: 16,
          fontWeight: 700,
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? t.submitting : t.signBtn}
      </button>
    </div>
  );
}
