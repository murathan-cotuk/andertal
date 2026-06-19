import { lt } from "@/lib/locale-text";

export function approvalStatusLabel(locale, s) {
  const v = String(s || "registered").toLowerCase();
  const map = {
    registered: lt(locale, "Registered", "Kayıtlı", "Inscrit", "Registrado", "Registrato", "Registriert"),
    documents_submitted: lt(locale, "Docs submitted", "Evrak gönderildi", "Docs soumis", "Docs enviados", "Documenti inviati", "Docs eingereicht"),
    pending_approval: lt(locale, "Pending", "Bekliyor", "En attente", "Pendiente", "In attesa", "Wartet"),
    pending: lt(locale, "Pending", "Bekliyor", "En attente", "Pendiente", "In attesa", "Wartet"),
    approved: lt(locale, "Approved", "Onaylandı", "Approuvé", "Aprobado", "Approvato", "Genehmigt"),
    active: lt(locale, "Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv"),
    rejected: lt(locale, "Rejected", "Reddedildi", "Rejeté", "Rechazado", "Rifiutato", "Abgelehnt"),
    suspended: lt(locale, "Suspended", "Askıya alındı", "Suspendu", "Suspendido", "Sospeso", "Gesperrt"),
  };
  return map[v] || v;
}

export function getPermissionsList(locale, superuser = false) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  if (superuser) {
    return [
      { group: t("General", "Genel", "Général", "General", "Generale", "Genel"), items: [
        { key: "/dashboard", label: "Dashboard" },
        { key: "/inbox", label: t("Inbox / Messages", "Gelen kutusu / Mesajlar", "Boîte de réception", "Bandeja / Mensajes", "Posta in arrivo", "Posteingang / Nachrichten") },
      ]},
      { group: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"), items: [
        { key: "/orders", label: t("Orders (view)", "Siparişler (görüntüleme)", "Commandes (vue)", "Pedidos (vista)", "Ordini (vista)", "Bestellungen (Ansicht)") },
        { key: "/orders/returns", label: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Retouren") },
        { key: "/orders/abandoned-checkouts", label: t("Abandoned checkouts", "Terk edilen ödemeler", "Paniers abandonnés", "Checkouts abandonados", "Checkout abbandonati", "Abgebrochene Checkouts") },
      ]},
      { group: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"), items: [
        { key: "/products", label: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte") },
        { key: "/products/inventory", label: t("Inventory", "Envanter", "Inventaire", "Inventario", "Inventario", "Inventar") },
        { key: "/products/collections", label: t("Collections", "Koleksiyonlar", "Collections", "Colecciones", "Collezioni", "Kollektionen") },
        { key: "/products/gift-cards", label: t("Gift cards", "Hediye kartları", "Cartes cadeaux", "Tarjetas regalo", "Gift card", "Geschenkkarten") },
      ]},
      { group: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Kunden"), items: [
        { key: "/customers", label: t("Customer list", "Müşteri listesi", "Liste clients", "Lista de clientes", "Lista clienti", "Kundenliste") },
        { key: "/customers/reviews", label: t("Reviews", "Yorumlar", "Avis", "Reseñas", "Recensioni", "Bewertungen") },
      ]},
      { group: t("Marketing & Discounts", "Pazarlama & İndirimler", "Marketing & Remises", "Marketing y descuentos", "Marketing e sconti", "Marketing & Rabatte"), items: [
        { key: "/marketing", label: t("Marketing", "Pazarlama", "Marketing", "Marketing", "Marketing", "Marketing") },
        { key: "/discounts", label: t("Discounts", "İndirimler", "Remises", "Descuentos", "Sconti", "Rabatte") },
      ]},
      { group: "Content", items: [
        { key: "/content/media", label: t("Media", "Medya", "Médias", "Medios", "Media", "Medien") },
        { key: "/content/menus", label: t("Menus", "Menüler", "Menus", "Menús", "Menu", "Menüs") },
        { key: "/content/categories", label: t("Categories", "Kategoriler", "Catégories", "Categorías", "Categorie", "Kategorien") },
        { key: "/content/landing-page", label: t("Landing page", "Landing page", "Page d'accueil", "Landing page", "Landing page", "Landing Page") },
        { key: "/content/styles", label: t("Styles", "Stiller", "Styles", "Estilos", "Stili", "Styles") },
        { key: "/content/pages", label: t("Pages", "Sayfalar", "Pages", "Páginas", "Pagine", "Seiten") },
        { key: "/content/blog-posts", label: t("Blog posts", "Blog yazıları", "Articles de blog", "Entradas de blog", "Post del blog", "Blog-Beiträge") },
        { key: "/content/brands", label: t("Brands", "Markalar", "Marques", "Marcas", "Marchi", "Marken") },
        { key: "/content/metaobjects", label: t("Metaobjects", "Metaobjeler", "Métaobjets", "Metaobjetos", "Metaoggetti", "Metaobjekte") },
      ]},
      { group: "Analytics", items: [
        { key: "/analytics/reports", label: t("Reports", "Raporlar", "Rapports", "Informes", "Report", "Berichte") },
        { key: "/analytics/ranking", label: t("Ranking", "Sıralama", "Classement", "Ranking", "Ranking", "Ranking") },
        { key: "/analytics/transactions", label: t("Transactions", "İşlemler", "Transactions", "Transacciones", "Transazioni", "Transaktionen") },
        { key: "/analytics/live-view", label: t("Live view", "Canlı görünüm", "Vue en direct", "Vista en vivo", "Vista live", "Live-Ansicht") },
      ]},
      { group: t("Settings", "Ayarlar", "Paramètres", "Ajustes", "Impostazioni", "Einstellungen"), items: [
        { key: "/settings", label: t("Settings (general)", "Ayarlar (genel)", "Paramètres (général)", "Ajustes (general)", "Impostazioni (generale)", "Einstellungen (allgemein)") },
        { key: "/settings/payments", label: t("Payments & IBAN", "Ödemeler & IBAN", "Paiements & IBAN", "Pagos e IBAN", "Pagamenti e IBAN", "Zahlungen & IBAN") },
        { key: "/settings/users-permissions", label: t("Users & permissions", "Kullanıcılar & izinler", "Utilisateurs & droits", "Usuarios y permisos", "Utenti e permessi", "Benutzer & Rechte") },
      ]},
    ];
  }
  return [
    { group: t("General", "Genel", "Général", "General", "Generale", "Genel"), items: [
      { key: "/dashboard", label: "Dashboard" },
      { key: "/inbox", label: t("Messages", "Mesajlar", "Messages", "Mensajes", "Messaggi", "Nachrichten") },
    ]},
    { group: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"), items: [
      { key: "/orders", label: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen") },
      { key: "/orders/returns", label: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Retouren") },
    ]},
    { group: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"), items: [
      { key: "/products", label: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte") },
      { key: "/products/inventory", label: t("Inventory", "Envanter", "Inventaire", "Inventario", "Inventario", "Inventar") },
      { key: "/products/gift-cards", label: t("Gift cards", "Hediye kartları", "Cartes cadeaux", "Tarjetas regalo", "Gift card", "Geschenkkarten") },
    ]},
    { group: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Kunden"), items: [
      { key: "/customers", label: t("Customer list", "Müşteri listesi", "Liste clients", "Lista de clientes", "Lista clienti", "Kundenliste") },
      { key: "/customers/reviews", label: t("Reviews", "Yorumlar", "Avis", "Reseñas", "Recensioni", "Bewertungen") },
    ]},
    { group: t("Marketing & Discounts", "Pazarlama & İndirimler", "Marketing & Remises", "Marketing y descuentos", "Marketing e sconti", "Marketing & Rabatte"), items: [
      { key: "/marketing", label: t("Marketing", "Pazarlama", "Marketing", "Marketing", "Marketing", "Marketing") },
      { key: "/discounts", label: t("Discounts", "İndirimler", "Remises", "Descuentos", "Sconti", "Rabatte") },
    ]},
    { group: "Content", items: [
      { key: "/content/media", label: t("Media", "Medya", "Médias", "Medios", "Media", "Medien") },
      { key: "/content/brands", label: t("Brands", "Markalar", "Marques", "Marcas", "Marchi", "Marken") },
      { key: "/content/metaobjects", label: t("Metaobjects", "Metaobjeler", "Métaobjets", "Metaobjetos", "Metaoggetti", "Metaobjekte") },
    ]},
    { group: "Analytics", items: [
      { key: "/analytics/reports", label: t("Reports", "Raporlar", "Rapports", "Informes", "Report", "Berichte") },
      { key: "/analytics/ranking", label: t("Ranking", "Sıralama", "Classement", "Ranking", "Ranking", "Ranking") },
      { key: "/analytics/transactions", label: t("Transactions", "İşlemler", "Transactions", "Transacciones", "Transazioni", "Transaktionen") },
    ]},
    { group: t("Settings", "Ayarlar", "Paramètres", "Ajustes", "Impostazioni", "Einstellungen"), items: [
      { key: "/settings", label: t("Settings", "Ayarlar", "Paramètres", "Ajustes", "Impostazioni", "Einstellungen") },
      { key: "/settings/payments", label: t("Payments & IBAN", "Ödemeler & IBAN", "Paiements & IBAN", "Pagos e IBAN", "Pagamenti e IBAN", "Zahlungen & IBAN") },
      { key: "/settings/users-permissions", label: t("Users & permissions", "Kullanıcılar & izinler", "Utilisateurs & droits", "Usuarios y permisos", "Utenti e permessi", "Benutzer & Rechte") },
    ]},
  ];
}

export const DEFAULT_SELLER_PERMS = [
  "/dashboard", "/inbox", "/orders", "/orders/returns", "/products", "/products/inventory",
  "/products/gift-cards", "/customers", "/customers/reviews", "/marketing", "/discounts",
  "/content/media", "/content/brands", "/content/metaobjects",
  "/analytics/reports", "/analytics/ranking", "/analytics/transactions", "/settings", "/settings/payments",
];

export function getUsersCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    pageTitleSuper: t("Users & Permissions", "Kullanıcılar & İzinler", "Utilisateurs & Permissions", "Usuarios y permisos", "Utenti e permessi", "Benutzer & Berechtigungen"),
    pageTitleSeller: t("Users & Permissions", "Kullanıcılar & İzinler", "Utilisateurs & droits", "Usuarios y permisos", "Utenti e permessi", "Benutzer & Rechte"),
    newUser: t("New user", "Yeni kullanıcı", "Nouvel utilisateur", "Nuevo usuario", "Nuovo utente", "Neuer Benutzer"),
    inviteUser: t("Invite user", "Kullanıcı davet et", "Inviter un utilisateur", "Invitar usuario", "Invita utente", "Benutzer einladen"),
    searchPlaceholder: t("Search (email, store name…)", "Ara (e-posta, mağaza adı…)", "Rechercher (e-mail, boutique…)", "Buscar (correo, tienda…)", "Cerca (email, negozio…)", "Suchen (E-Mail, Store-Name…)"),
    filterAll: t("All", "Tümü", "Tous", "Todos", "Tutti", "Alle"),
    filterSeller: "Seller",
    filterSuperuser: "Superuser",
    filterKyb: t("KYB pending", "KYB bekleyen", "KYB en attente", "KYB pendiente", "KYB in attesa", "KYB Ausstehend"),
    sortDateDesc: t("Date ↓ (newest)", "Tarih ↓ (en yeni)", "Date ↓ (plus récent)", "Fecha ↓ (más reciente)", "Data ↓ (più recente)", "Datum ↓ (neueste)"),
    sortDateAsc: t("Date ↑ (oldest)", "Tarih ↑ (en eski)", "Date ↑ (plus ancien)", "Fecha ↑ (más antiguo)", "Data ↑ (più vecchio)", "Datum ↑ (älteste)"),
    sortNameAsc: t("Name A → Z", "Ad A → Z", "Nom A → Z", "Nombre A → Z", "Nome A → Z", "Name A → Z"),
    sortNameDesc: t("Name Z → A", "Ad Z → A", "Nom Z → A", "Nombre Z → A", "Nome Z → A", "Name Z → A"),
    sortRole: t("Role (superuser first)", "Rol (superuser önce)", "Rôle (superuser d'abord)", "Rol (superusuario primero)", "Ruolo (superuser prima)", "Rolle (Superuser zuerst)"),
    userCount: (shown, total) => t(`${shown} of ${total} user${total !== 1 ? "s" : ""}`, `${shown} / ${total} kullanıcı`, `${shown} sur ${total} utilisateur(s)`, `${shown} de ${total} usuario(s)`, `${shown} di ${total} utenti`, `${shown} von ${total} Benutzer${total !== 1 ? "n" : ""}`),
    noUsers: t("No users registered yet.", "Henüz kullanıcı kayıtlı değil.", "Aucun utilisateur inscrit.", "Aún no hay usuarios registrados.", "Nessun utente registrato.", "Noch keine Benutzer registriert."),
    noUsersFound: t("No users found.", "Kullanıcı bulunamadı.", "Aucun utilisateur trouvé.", "No se encontraron usuarios.", "Nessun utente trovato.", "Keine Benutzer gefunden."),
    you: t("You", "Siz", "Vous", "Usted", "Tu", "Sie"),
    fullAccess: t("Full access", "Tam erişim", "Accès complet", "Acceso completo", "Accesso completo", "Voller Zugriff"),
    permissionsCount: (n) => t(`${n} permissions`, `${n} izin`, `${n} droits`, `${n} permisos`, `${n} permessi`, `${n} Zugriffsrechte`),
    defaultPermissions: t("Default permissions", "Varsayılan izinler", "Permissions par défaut", "Permisos predeterminados", "Permessi predefiniti", "Standard-Berechtigungen"),
    created: t("Created", "Oluşturuldu", "Créé", "Creado", "Creato", "Erstellt"),
    owner: t("Account owner", "Hesap sahibi", "Propriétaire du compte", "Propietario de cuenta", "Titolare account", "Kontoinhaber"),
    added: t("Added", "Eklendi", "Ajouté", "Añadido", "Aggiunto", "Hinzugefügt"),
    ownerSub: t("Full access · Owner account", "Tam erişim · Sahip hesabı", "Accès complet · Compte propriétaire", "Acceso completo · Cuenta propietaria", "Accesso completo · Account titolare", "Voller Zugriff · Eigentümerkonto"),
    activeUsers: (n) => t(`Active users (${n})`, `Aktif kullanıcılar (${n})`, `Utilisateurs actifs (${n})`, `Usuarios activos (${n})`, `Utenti attivi (${n})`, `Aktive Benutzer (${n})`),
    noSubusers: t("No additional users added yet.", "Henüz ek kullanıcı eklenmedi.", "Aucun utilisateur supplémentaire.", "Aún no se añadieron más usuarios.", "Nessun altro utente aggiunto.", "Noch keine weiteren Benutzer hinzugefügt."),
    permissionsBtn: t("Permissions", "İzinler", "Droits", "Permisos", "Permessi", "Rechte"),
    remove: t("Remove", "Kaldır", "Retirer", "Eliminar", "Rimuovi", "Entfernen"),
    pendingInvites: (n) => t(`Pending invitations (${n})`, `Bekleyen davetler (${n})`, `Invitations en attente (${n})`, `Invitaciones pendientes (${n})`, `Inviti in sospeso (${n})`, `Ausstehende Einladungen (${n})`),
    pending: t("Pending", "Bekliyor", "En attente", "Pendiente", "In attesa", "Ausstehend"),
    expires: t("Expires", "Sona erer", "Expire", "Expira", "Scade", "Läuft ab"),
    cancelInvite: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Stornieren"),
    inviteModalTitle: t("Invite user", "Kullanıcı davet et", "Inviter un utilisateur", "Invitar usuario", "Invita utente", "Benutzer einladen"),
    sendInvite: t("Send invitation", "Davet gönder", "Envoyer l'invitation", "Enviar invitación", "Invia invito", "Einladung senden"),
    firstName: t("First name *", "Ad *", "Prénom *", "Nombre *", "Nome *", "Vorname *"),
    lastName: t("Last name *", "Soyad *", "Nom *", "Apellido *", "Cognome *", "Nachname *"),
    emailRequired: t("Email is required", "E-posta zorunlu", "E-mail obligatoire", "El correo es obligatorio", "Email obbligatoria", "E-Mail ist ein Pflichtfeld"),
    namesRequired: t("First and last name are required", "Ad ve soyad zorunlu", "Prénom et nom obligatoires", "Nombre y apellido obligatorios", "Nome e cognome obbligatori", "Vor- und Nachname sind Pflichtfelder"),
    inviteError: t("Error sending invitation", "Davet gönderme hatası", "Erreur lors de l'envoi", "Error al enviar invitación", "Errore invio invito", "Fehler beim Senden der Einladung"),
    accessRights: t("Access permissions", "Erişim izinleri", "Droits d'accès", "Permisos de acceso", "Permessi di accesso", "Zugriffsrechte"),
    editPermissionsTitle: (name, email) => t(`Edit permissions — ${name} (${email})`, `İzinleri düzenle — ${name} (${email})`, `Modifier les droits — ${name} (${email})`, `Editar permisos — ${name} (${email})`, `Modifica permessi — ${name} (${email})`, `Rechte bearbeiten — ${name} (${email})`),
    editUserTitle: (email) => t(`Edit user — ${email}`, `Kullanıcıyı düzenle — ${email}`, `Modifier l'utilisateur — ${email}`, `Editar usuario — ${email}`, `Modifica utente — ${email}`, `Benutzer bearbeiten — ${email}`),
    createUserTitle: t("Create new user", "Yeni kullanıcı oluştur", "Créer un utilisateur", "Crear nuevo usuario", "Crea nuovo utente", "Neuen Benutzer erstellen"),
    emailPasswordRequired: t("Email and password are required", "E-posta ve şifre zorunlu", "E-mail et mot de passe obligatoires", "Correo y contraseña obligatorios", "Email e password obbligatori", "E-Mail und Passwort sind Pflichtfelder"),
    password: t("Password *", "Şifre *", "Mot de passe *", "Contraseña *", "Password *", "Passwort *"),
    newPassword: t("New password (blank = no change)", "Yeni şifre (boş = değiştirme)", "Nouveau mot de passe (vide = inchangé)", "Nueva contraseña (vacío = sin cambio)", "Nuova password (vuoto = nessuna modifica)", "Neues Passwort (leer = nicht ändern)"),
    passwordHelpEdit: t("Leave blank to keep unchanged", "Değiştirmemek için boş bırakın", "Laisser vide pour ne pas modifier", "Dejar en blanco para no cambiar", "Lasciare vuoto per non modificare", "Leer lassen um nicht zu ändern"),
    passwordHelpNew: t("Min. 8 characters, one letter & one number", "En az 8 karakter, bir harf ve bir rakam", "Min. 8 caractères, une lettre et un chiffre", "Mín. 8 caracteres, una letra y un número", "Min. 8 caratteri, una lettera e un numero", "Min. 8 Zeichen, ein Buchstabe & eine Zahl"),
    superuserLabel: t("Superuser (full access, no restrictions)", "Superuser (tam erişim, kısıtlama yok)", "Superuser (accès complet)", "Superusuario (acceso completo)", "Superuser (accesso completo)", "Superuser (voller Zugriff, keine Beschränkungen)"),
    storeName: t("Shop / store name", "Mağaza adı", "Nom boutique", "Nombre de tienda", "Nome negozio", "Shop-/Store-Name"),
    storeNameHelp: t("Seller's store name (optional)", "Satıcının mağaza adı (isteğe bağlı)", "Nom de boutique du vendeur (optionnel)", "Nombre de tienda del vendedor (opcional)", "Nome negozio del venditore (opzionale)", "Mağaza adı des Verkäufers (optional)"),
    kybTitle: (name) => t(`KYB Review — ${name}`, `KYB İnceleme — ${name}`, `Revue KYB — ${name}`, `Revisión KYB — ${name}`, `Revisione KYB — ${name}`, `KYB Review — ${name}`),
    rejectionReasonRequired: t("Please enter a rejection reason.", "Lütfen red nedeni girin.", "Veuillez saisir un motif de rejet.", "Introduzca un motivo de rechazo.", "Inserire un motivo di rifiuto.", "Bitte geben Sie einen Ablehnungsgrund ein."),
    companyName: t("Company name", "Şirket adı", "Nom de l'entreprise", "Nombre de empresa", "Nome azienda", "Firmenname"),
    authorizedPerson: t("Authorized person", "Yetkili kişi", "Personne autorisée", "Persona autorizada", "Persona autorizzata", "Bevollmächtigte Person"),
    taxId: t("Tax ID", "Vergi no.", "N° fiscal", "NIF", "Codice fiscale", "Steuernummer"),
    vatId: t("VAT ID", "KDV no.", "N° TVA", "IVA", "Partita IVA", "USt-IdNr."),
    street: t("Street", "Sokak", "Rue", "Calle", "Via", "Straße"),
    documents: (n) => t(`Documents (${n})`, `Belgeler (${n})`, `Documents (${n})`, `Documentos (${n})`, `Documenti (${n})`, `Dokumente (${n})`),
    docTradeRegister: t("Trade register", "Ticaret sicili", "Registre du commerce", "Registro mercantil", "Registro imprese", "Handelsregister"),
    docIdPassport: t("ID / Passport", "Kimlik / Pasaport", "Pièce d'identité / Passeport", "DNI / Pasaporte", "Documento / Passaporto", "Ausweis/Reisepass"),
    docTax: t("Tax document", "Vergi belgesi", "Document fiscal", "Documento fiscal", "Documento fiscale", "Steuerdokument"),
    open: t("Open ↗", "Aç ↗", "Ouvrir ↗", "Abrir ↗", "Apri ↗", "Öffnen ↗"),
    rejectionReason: t("Rejection reason", "Red nedeni", "Motif de rejet", "Motivo de rechazo", "Motivo rifiuto", "Ablehnungsgrund"),
    approve: t("Approve", "Onayla", "Approuver", "Aprobar", "Approva", "Genehmigen"),
    reject: t("Reject", "Reddet", "Rejeter", "Rechazar", "Rifiuta", "Ablehnen"),
    confirmReject: t("Confirm rejection", "Reddi onayla", "Confirmer le rejet", "Confirmar rechazo", "Conferma rifiuto", "Ablehnung bestätigen"),
    suspend: t("Suspend", "Askıya al", "Suspendre", "Suspender", "Sospendi", "Sperren"),
    reapprove: t("Re-approve", "Yeniden onayla", "Réapprouver", "Volver a aprobar", "Riapprova", "Wieder genehmigen"),
    cannotDeleteSelf: t("You cannot delete your own account.", "Kendi hesabınızı silemezsiniz.", "Vous ne pouvez pas supprimer votre propre compte.", "No puede eliminar su propia cuenta.", "Non puoi eliminare il tuo account.", "Sie können Ihr eigenes Konto nicht löschen."),
    deleteUserConfirm: (email) => t(`Really delete user "${email}"?`, `"${email}" kullanıcısı gerçekten silinsin mi?`, `Supprimer l'utilisateur « ${email} » ?`, `¿Eliminar realmente al usuario "${email}"?`, `Eliminare davvero l'utente "${email}"?`, `Benutzer "${email}" wirklich löschen?`),
    deleteSubuserConfirm: (name, email) => t(`Really remove user "${name}" (${email})?`, `"${name}" (${email}) gerçekten kaldırılsın mı?`, `Retirer « ${name} » (${email}) ?`, `¿Eliminar realmente a "${name}" (${email})?`, `Rimuovere davvero "${name}" (${email})?`, `Benutzer "${name}" (${email}) wirklich entfernen?`),
    cancelInviteConfirm: (email) => t(`Really cancel invitation for "${email}"?`, `"${email}" daveti gerçekten iptal edilsin mi?`, `Annuler l'invitation pour « ${email} » ?`, `¿Cancelar realmente la invitación para "${email}"?`, `Annullare davvero l'invito per "${email}"?`, `Einladung für "${email}" wirklich stornieren?`),
    loadError: t("Failed to load users", "Kullanıcılar yüklenemedi", "Échec du chargement", "Error al cargar usuarios", "Caricamento utenti fallito", "Fehler beim Laden"),
    deleteError: t("Error deleting", "Silme hatası", "Erreur de suppression", "Error al eliminar", "Errore di eliminazione", "Fehler beim Löschen"),
    genericError: t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler"),
  };
}
