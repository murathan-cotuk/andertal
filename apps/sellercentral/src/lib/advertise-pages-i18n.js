import { lt } from "@/lib/locale-text";

const t = (locale, en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

export function getAdvertisePageCopy(locale) {
  return {
    title: t(locale, "Advertise", "Reklam", "Publicité", "Publicidad", "Pubblicità", "Werbung"),
    heading: t(locale, "Connect Your Advertising Accounts", "Reklam Hesaplarınızı Bağlayın", "Connectez vos comptes publicitaires", "Conecta tus cuentas publicitarias", "Collega i tuoi account pubblicitari", "Verbinden Sie Ihre Werbekonten"),
    subtitle: t(locale, "Link your advertising accounts to manage campaigns and track performance from one place", "Kampanyaları yönetmek ve performansı tek yerden izlemek için reklam hesaplarınızı bağlayın", "Liez vos comptes publicitaires pour gérer les campagnes et suivre les performances depuis un seul endroit", "Vincula tus cuentas publicitarias para gestionar campañas y seguir el rendimiento desde un solo lugar", "Collega i tuoi account pubblicitari per gestire campagne e monitorare le performance da un unico posto", "Verknüpfen Sie Ihre Werbekonten, um Kampagnen zu verwalten und die Leistung zentral zu verfolgen"),
    connectAccount: t(locale, "Connect Account", "Hesabı Bağla", "Connecter le compte", "Conectar cuenta", "Collega account", "Konto verbinden"),
    googleDesc: t(locale, "Reach customers through Google Search and Display Network", "Google Arama ve Görüntülü Reklam Ağı üzerinden müşterilere ulaşın", "Atteignez vos clients via Google Search et le Réseau Display", "Llega a clientes a través de Google Search y la Red de Display", "Raggiungi clienti tramite Google Search e Display Network", "Erreichen Sie Kunden über Google Search und das Display-Netzwerk"),
    metaDesc: t(locale, "Advertise on Facebook and Instagram to reach your target audience", "Hedef kitlenize ulaşmak için Facebook ve Instagram'da reklam verin", "Faites de la publicité sur Facebook et Instagram pour atteindre votre audience cible", "Anúnciate en Facebook e Instagram para llegar a tu audiencia objetivo", "Fai pubblicità su Facebook e Instagram per raggiungere il tuo pubblico target", "Werben Sie auf Facebook und Instagram, um Ihre Zielgruppe zu erreichen"),
    tiktokDesc: t(locale, "Create engaging video ads on TikTok", "TikTok'ta etkileşimli video reklamlar oluşturun", "Créez des annonces vidéo engageantes sur TikTok", "Crea anuncios de video atractivos en TikTok", "Crea video annunci coinvolgenti su TikTok", "Erstellen Sie ansprechende Videoanzeigen auf TikTok"),
    pinterestDesc: t(locale, "Promote your products on Pinterest", "Ürünlerinizi Pinterest'te tanıtın", "Faites la promotion de vos produits sur Pinterest", "Promociona tus productos en Pinterest", "Promuovi i tuoi prodotti su Pinterest", "Bewerben Sie Ihre Produkte auf Pinterest"),
  };
}

export function getAdsPlatformCopy(locale, platform) {
  const base = {
    connect: t(locale, "Connect Account", "Hesabı Bağla", "Connecter le compte", "Conectar cuenta", "Collega account", "Konto verbinden"),
    disconnect: t(locale, "Disconnect", "Bağlantıyı kes", "Déconnecter", "Desconectar", "Disconnetti", "Trennen"),
    connectedOk: t(locale, "Account connected successfully", "Hesap başarıyla bağlandı", "Compte connecté avec succès", "Cuenta conectada correctamente", "Account collegato con successo", "Konto erfolgreich verbunden"),
  };

  const names = {
    google: {
      title: "Google Ads",
      integration: t(locale, "Google Ads Integration", "Google Ads Entegrasyonu", "Intégration Google Ads", "Integración de Google Ads", "Integrazione Google Ads", "Google Ads Integration"),
      account: t(locale, "Google Ads Account", "Google Ads Hesabı", "Compte Google Ads", "Cuenta de Google Ads", "Account Google Ads", "Google Ads Konto"),
      connected: t(locale, "Your Google Ads account is connected", "Google Ads hesabınız bağlı", "Votre compte Google Ads est connecté", "Tu cuenta de Google Ads está conectada", "Il tuo account Google Ads è collegato", "Ihr Google Ads Konto ist verbunden"),
      connectText: t(locale, "Connect your Google Ads account to manage campaigns", "Kampanyaları yönetmek için Google Ads hesabınızı bağlayın", "Connectez votre compte Google Ads pour gérer les campagnes", "Conecta tu cuenta de Google Ads para gestionar campañas", "Collega il tuo account Google Ads per gestire le campagne", "Verbinden Sie Ihr Google Ads Konto, um Kampagnen zu verwalten"),
      keyLabel: "Google Ads API Key",
      keyPlaceholder: t(locale, "Enter your Google Ads API key", "Google Ads API anahtarınızı girin", "Saisissez votre clé API Google Ads", "Introduce tu clave API de Google Ads", "Inserisci la tua chiave API Google Ads", "Geben Sie Ihren Google Ads API-Schlüssel ein"),
    },
    meta: {
      title: "Meta Ads",
      integration: t(locale, "Meta (Facebook/Instagram) Ads Integration", "Meta (Facebook/Instagram) Ads Entegrasyonu", "Intégration Meta (Facebook/Instagram) Ads", "Integración de Meta (Facebook/Instagram) Ads", "Integrazione Meta (Facebook/Instagram) Ads", "Meta (Facebook/Instagram) Ads Integration"),
      account: t(locale, "Meta Ads Account", "Meta Ads Hesabı", "Compte Meta Ads", "Cuenta de Meta Ads", "Account Meta Ads", "Meta Ads Konto"),
      connected: t(locale, "Your Meta Ads account is connected", "Meta Ads hesabınız bağlı", "Votre compte Meta Ads est connecté", "Tu cuenta de Meta Ads está conectada", "Il tuo account Meta Ads è collegato", "Ihr Meta Ads Konto ist verbunden"),
      connectText: t(locale, "Connect your Meta Ads account to manage campaigns", "Kampanyaları yönetmek için Meta Ads hesabınızı bağlayın", "Connectez votre compte Meta Ads pour gérer les campagnes", "Conecta tu cuenta de Meta Ads para gestionar campañas", "Collega il tuo account Meta Ads per gestire le campagne", "Verbinden Sie Ihr Meta Ads Konto, um Kampagnen zu verwalten"),
      keyLabel: "Meta Ads API Key",
      keyPlaceholder: t(locale, "Enter your Meta Ads API key", "Meta Ads API anahtarınızı girin", "Saisissez votre clé API Meta Ads", "Introduce tu clave API de Meta Ads", "Inserisci la tua chiave API Meta Ads", "Geben Sie Ihren Meta Ads API-Schlüssel ein"),
    },
    tiktok: {
      title: "TikTok Ads",
      integration: t(locale, "TikTok Ads Integration", "TikTok Ads Entegrasyonu", "Intégration TikTok Ads", "Integración de TikTok Ads", "Integrazione TikTok Ads", "TikTok Ads Integration"),
      account: t(locale, "TikTok Ads Account", "TikTok Ads Hesabı", "Compte TikTok Ads", "Cuenta de TikTok Ads", "Account TikTok Ads", "TikTok Ads Konto"),
      connected: t(locale, "Your TikTok Ads account is connected", "TikTok Ads hesabınız bağlı", "Votre compte TikTok Ads est connecté", "Tu cuenta de TikTok Ads está conectada", "Il tuo account TikTok Ads è collegato", "Ihr TikTok Ads Konto ist verbunden"),
      connectText: t(locale, "Connect your TikTok Ads account to manage campaigns", "Kampanyaları yönetmek için TikTok Ads hesabınızı bağlayın", "Connectez votre compte TikTok Ads pour gérer les campagnes", "Conecta tu cuenta de TikTok Ads para gestionar campañas", "Collega il tuo account TikTok Ads per gestire le campagne", "Verbinden Sie Ihr TikTok Ads Konto, um Kampagnen zu verwalten"),
      keyLabel: "TikTok Ads API Key",
      keyPlaceholder: t(locale, "Enter your TikTok Ads API key", "TikTok Ads API anahtarınızı girin", "Saisissez votre clé API TikTok Ads", "Introduce tu clave API de TikTok Ads", "Inserisci la tua chiave API TikTok Ads", "Geben Sie Ihren TikTok Ads API-Schlüssel ein"),
    },
    pinterest: {
      title: "Pinterest Ads",
      integration: t(locale, "Pinterest Ads Integration", "Pinterest Ads Entegrasyonu", "Intégration Pinterest Ads", "Integración de Pinterest Ads", "Integrazione Pinterest Ads", "Pinterest Ads Integration"),
      account: t(locale, "Pinterest Ads Account", "Pinterest Ads Hesabı", "Compte Pinterest Ads", "Cuenta de Pinterest Ads", "Account Pinterest Ads", "Pinterest Ads Konto"),
      connected: t(locale, "Your Pinterest Ads account is connected", "Pinterest Ads hesabınız bağlı", "Votre compte Pinterest Ads est connecté", "Tu cuenta de Pinterest Ads está conectada", "Il tuo account Pinterest Ads è collegato", "Ihr Pinterest Ads Konto ist verbunden"),
      connectText: t(locale, "Connect your Pinterest Ads account to manage campaigns", "Kampanyaları yönetmek için Pinterest Ads hesabınızı bağlayın", "Connectez votre compte Pinterest Ads pour gérer les campagnes", "Conecta tu cuenta de Pinterest Ads para gestionar campañas", "Collega il tuo account Pinterest Ads per gestire le campagne", "Verbinden Sie Ihr Pinterest Ads Konto, um Kampagnen zu verwalten"),
      keyLabel: "Pinterest Ads API Key",
      keyPlaceholder: t(locale, "Enter your Pinterest Ads API key", "Pinterest Ads API anahtarınızı girin", "Saisissez votre clé API Pinterest Ads", "Introduce tu clave API de Pinterest Ads", "Inserisci la tua chiave API Pinterest Ads", "Geben Sie Ihren Pinterest Ads API-Schlüssel ein"),
    },
  };

  return { ...base, ...(names[platform] || names.google) };
}
