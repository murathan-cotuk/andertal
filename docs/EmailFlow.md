SellerCentral projemizde flow kismi var ancak profesyonel bir marketplace email flow sistemi kurmanı/eklemeni istiyorum.

Ama basit bir notification sistemi değil. Amazon Seller Central / Etsy / Airbnb / Upwork seviyesinde event-driven bir communication architecture istiyorum.

Görev:
SellerCentral admin panelindeki “Flow” menüsünü tamamen geliştir ve aşağıdaki email flow template kategorilerini oluştur.

Teknik beklenti:

* Modüler architecture
* Reusable email templates
* Event-driven structure
* Queue-ready infrastructure
* Multi-language support hazır olsun
* Future-proof scalable yapı kur
* Template editor component sistemi kur
* Status tracking olsun
* Flow activation/deactivation sistemi olsun
* Flow analytics alanı olsun
* Trigger bazlı çalışma sistemi olsun

Flow menüsünde aşağıdaki kategorileri oluştur:

1. AUTH / ACCOUNT FLOWS

* Welcome email
* Email verification
* Password reset
* Password changed
* New login detected
* Suspicious login
* 2FA enabled
* Seller verification approved/rejected
* KYC rejected
* Subscription activated/canceled

2. BUYER ONBOARDING FLOWS

* Welcome onboarding
* First order incentive
* Popular categories
* Wishlist encouragement
* First purchase reminder

3. SELLER ONBOARDING FLOWS

* Seller welcome
* Dashboard guide
* First product reminder
* SEO optimization suggestions
* Store completion reminder
* First sale celebration

4. TRANSACTIONAL FLOWS
   Buyer side:

* Order confirmation
* Payment received
* Order processing
* Order shipped
* Tracking available
* Delivered
* Refund completed

Seller side:

* New order received
* Shipping deadline warning
* Buyer message received
* Return request opened

5. CART ABANDONMENT FLOWS

* 1 hour reminder
* 24 hour scarcity email
* 48 hour coupon email

6. WISHLIST FLOWS

* Price drop alert
* Back in stock
* Similar product recommendations

7. REVIEW FLOWS

* Review request
* Review thank you
* New seller review
* Negative review escalation

8. MESSAGE / CHAT FLOWS

* New message notification
* Reply reminder
* Conversation inactive reminder

9. PAYMENT & SUBSCRIPTION FLOWS

* Trial started
* Trial ending
* Payment failed
* Invoice generated
* Subscription canceled
* Win-back campaign

10. DISPUTE & SUPPORT FLOWS

* Ticket created
* Ticket updated
* Dispute opened
* Evidence requested
* Resolution completed

11. TRUST & SAFETY FLOWS

* Seller suspended
* Policy violation
* Fraud alert
* Chargeback notification

12. MARKETING AUTOMATION FLOWS

* Personalized recommendations
* Seasonal campaigns
* Re-engagement campaigns
* Recently viewed products

13. ADMIN FLOWS

* New seller application
* Fraud suspicion
* High-value order alert
* Refund spike alert

İSTEDİĞİM SİSTEM:

Her flow için:

* trigger
* condition
* delay
* email subject
* preview text
* template body
* CTA
* status
* analytics
* A/B test support
* localization support

alanları olsun.

UI beklentisi:

* Modern SaaS dashboard
* Clean enterprise design
* Flow cards
* Status badges
* Trigger visualization
* Analytics widgets
* Search/filter system
* Drag & drop friendly structure
* Dark mode support

Teknik yapı:

* Next.js App Router
* Reusable component architecture
* Server actions veya API route compatible
* Typesafe structure
* Future BullMQ integration compatible
* Future Resend/Postmark integration compatible

Ek olarak:

* Notification center mantığıyla düşün
* Email / Push / In-App future support düşünülerek architecture kur
* Template system reusable olsun
* Layout system modüler olsun

ÖNEMLİ:
Hardcoded spaghetti yapı istemiyorum.
Production-level scalable architecture istiyorum.

Kodları temiz, maintainable ve senior-level yaz.


Şimdi SellerCentral marketplace projesindeki notification/email infrastructure sistemini enterprise seviyeye taşımanı istiyorum.

Aşağıdaki tüm sistemleri production-grade architecture mantığında kur.

Amaç:
Amazon Seller Central, Shopify, Stripe, Airbnb, Etsy gibi event-driven notification ecosystem oluşturmak.

KRİTİK:

* Hardcoded logic istemiyorum
* Event-driven architecture istiyorum
* Scalable structure istiyorum
* Future microservice migration compatible olsun
* Queue-based processing compatible olsun
* Multi-channel notification system düşünülerek geliştir
* Senior-level architecture kur

==================================================

1. FULL EMAIL EVENT MAP SYSTEM
   ==================================================

Tüm notification sistemi event bazlı çalışsın.

Örnek:

* user.created
* user.email_verified
* seller.approved
* order.created
* order.shipped
* order.delivered
* order.refund_completed
* cart.abandoned
* review.created
* message.received
* payment.failed
* subscription.canceled
* dispute.opened
* admin.fraud_detected

Her event:

* typed structure kullansın
* payload schema içersin
* metadata desteklesin
* retry support olsun
* delay support olsun
* analytics support olsun

Kur:

* event registry
* event dispatcher
* event listeners
* event handlers
* event tracking system

==================================================
2. DATABASE SCHEMA
==================

Notification/email system için scalable schema oluştur.

İstediğim tablolar:

* notification_events
* notification_logs
* email_templates
* email_template_versions
* email_flows
* flow_executions
* user_notification_preferences
* notification_channels
* notification_queue
* notification_analytics
* notification_ab_tests

Tüm ilişkileri düzgün kur.

Şunları desteklesin:

* localization
* template versioning
* A/B testing
* retry system
* analytics
* scheduling
* soft delete
* status tracking

Prisma schema veya SQL structure oluştur.

==================================================
3. NOTIFICATION ARCHITECTURE
============================

Şu yapıyı kur:

EVENT
↓
QUEUE
↓
NOTIFICATION ENGINE
↓
CHANNEL ROUTER
├── EMAIL
├── PUSH
├── SMS
└── IN-APP

Kur:

* provider abstraction
* notification adapter pattern
* channel resolver
* template renderer
* variable injector
* retry handler
* rate limiter
* analytics tracker

İstediğim:

* clean architecture
* SOLID principles
* reusable services
* domain-driven structure

==================================================
4. BULLMQ SETUP
===============

BullMQ infrastructure kur.

İstediğim:

* queue setup
* workers
* retry strategy
* delayed jobs
* priority jobs
* dead letter queue
* monitoring setup
* concurrency handling

Queue’lar:

* email queue
* push queue
* sms queue
* analytics queue
* retry queue

Redis-ready setup olsun.

==================================================
5. NEXT.JS NOTIFICATION SYSTEM
==============================

Next.js App Router compatible notification system geliştir.

Kur:

* notification service layer
* server actions integration
* API route handlers
* notification hooks
* real-time updates
* websocket/SSE ready structure

Admin dashboard:

* notification center
* flow management
* analytics page
* template editor
* live preview system
* activity logs

==================================================
6. RESEND TEMPLATE STRUCTURE
============================

Resend compatible email template system oluştur.

İstediğim:

* React Email structure
* reusable email layouts
* dynamic variables
* CTA components
* localization support
* theme system
* modular blocks

Kur:

* base layouts
* header/footer system
* product blocks
* order blocks
* review blocks
* coupon blocks
* seller blocks

==================================================
7. EMAIL TEMPLATE HIERARCHY
===========================

Template architecture oluştur.

İstediğim yapı:

Base Layout
├── Marketplace Layout
│     ├── Buyer Templates
│     ├── Seller Templates
│     ├── Admin Templates
│     └── Marketing Templates

Template inheritance mantığı kur.

Destek:

* partials
* reusable sections
* conditional rendering
* localization
* theme variations

==================================================
8. MULTI-LANGUAGE EMAIL SYSTEM
==============================

Tam localization-ready sistem kur.

Destek:

* en
* de
* tr
* future locales

Kur:

* translation architecture
* localized subjects
* localized preview texts
* fallback locale system
* currency/date localization

İstediğim:

* ICU message format compatible structure
* scalable translation management

==================================================
9. AI-TRIGGERED NOTIFICATION LOGIC
==================================

AI-powered recommendation/automation infrastructure tasarla.

Örnekler:

* low conversion seller warning
* abandoned cart intelligence
* personalized recommendations
* suspicious activity detection
* product optimization suggestions
* inactive user recovery campaigns

Kur:

* AI trigger engine
* recommendation scoring
* behavioral analysis structure
* rule engine
* future ML integration compatible structure

==================================================
10. FOLDER STRUCTURE
====================

Full scalable folder architecture oluştur.

İstediğim:

* enterprise-level organization
* modular domain structure
* future microservice compatibility
* reusable packages mantığı

==================================================
11. CODE QUALITY
================

Tüm sistem:

* TypeScript-first
* typesafe
* clean code
* reusable
* maintainable
* testable
* scalable

olsun.

Kod üretirken:

* gerçek production mantığıyla ilerle
* pseudo-code istemiyorum
* gerçek architecture kur
* senior engineer gibi düşün
* future unicorn-scale düşün

Amacımız:
“Basit email sistemi” değil,
tam anlamıyla enterprise marketplace communication infrastructure kurmak.

---

## Implementiert: Flow-Ausführungsprotokoll (API)

Backend: `apps/medusa-backend/server.js` (Admin Hub). Tabelle: `store_flow_execution_logs`.

Authentifizierung: Seller-JWT (`Authorization: Bearer …`), wie andere `/admin-hub/v1/*`-Routen.

### GET `/admin-hub/v1/flow-execution-logs`

Listet Logzeilen (neueste zuerst).

**Query (optional)**

| Parameter    | Beschreibung |
|-------------|---------------|
| `limit`     | 1–200, Standard 50 |
| `offset`    | Pagination |
| `status`    | `pending` \| `sent` \| `skipped` \| `failed` |
| `trigger_key` | exakter Trigger (lowercase/normalisiert serverseitig) |
| `flow_id`   | UUID des Flows |

**Antwort**

```json
{
  "logs": [ /* Zeilen mit u.a. trigger_key, flow_id, flow_name, step_order, recipient_email, status, attempts, error_message, sent_at, created_at */ ],
  "count": 25,
  "total": 120,
  "limit": 25,
  "offset": 0
}
```

**Sichtbarkeit**

* **Superuser:** alle Zeilen (optional gefiltert).
* **normaler Seller:** nur Zeilen, bei denen `order_id` gesetzt ist und die Bestellung zu `seller_id` des eingeloggten Kontos gehört (`EXISTS` über `store_orders`). Einträge ohne Bestellbezug (z. B. Newsletter-only) sind für Seller nicht sichtbar.

### GET `/admin-hub/v1/flow-execution-logs/:id`

Eine Zeile inkl. `idempotency_key` und vollem `metadata`. Gleiche Zugriffsregel wie oben (Seller nur bei eigener Bestellung; sonst 404).

---

**SellerCentral:** Marketing → Automationen („E-Mail-Flow Aktivität“) nutzt dieselben Endpoints; Beschreibungstext unterscheidet Superuser vs. Seller.

### GET `/admin-hub/v1/flow-execution-logs/stats`

Aggregierte Kennzahlen für ein Zeitfenster (Standard letzte 30 Tage). Query: `days` (1–90). Gleiche Seller-/Superuser-Sichtbarkeit wie die Liste.

Antwort u. a.: `total_in_window`, `by_status[]`, `by_trigger[]`, `by_mail_provider[]` (aus `metadata.mail_provider` bei `sent`).

### GET `/admin-hub/v1/flows/:id/snapshots` (Superuser)

Versionierte Snapshots des Flows bei jedem Speichern mit `steps`. Query: `limit`, `full=1` (inkl. JSON-Payloads).

Tabelle: `admin_hub_flow_snapshots`.

### Vorlagen-Versionierung / A/B-Betreff

* Beim Flow-Speichern (mit Schritten) wird ein Snapshot mit fortlaufender `version_num` geschrieben.
* Pro Sprach-Tab kann optional **Betreff B** (`subject_b` in `email_i18n`) gesetzt werden. Live-Versand wählt deterministisch A oder B (50/50 pro Idempotency-Key); gleicher HTML-Text. Deaktivieren: `FLOW_AB_SUBJECT_SPLIT=0`.

### Versand & Limits

* **SMTP** (Standard): Nodemailer wie bisher.
* **Resend:** `FLOW_MAIL_PROVIDER=resend` und `RESEND_API_KEY` gesetzt; Absender weiter über SMTP-Senderprofil / From.
* **Rate limit (In-Memory):** `FLOW_EMAIL_MAX_PER_MINUTE` (Standard 180, `0` = aus), pro Scope (`seller_id`-artig bzw. `customer_events`).

### Kanal / Metadaten

Ausführungslogs tragen `metadata.channel: 'email'`; bei Versand ggf. `mail_provider`, `ab_variant`, `message_id` (Resend).
