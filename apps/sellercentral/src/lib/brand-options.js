/**
 * Brand <Select> options for product / variant pages (docs/BRAND.md):
 *   1. "My brands" — the seller's own brand entries first (pending / superseded shown, disabled)
 *   2. "Other brands" — everyone else's active brands, one entry per brand name
 *      - an unregistered ("own", unverified) brand can be used freely
 *      - a brand REGISTERED by another seller (trademark / reseller authorization approved) is
 *        disabled unless this seller holds its own approved registration/authorization for the
 *        same name (then their own entry in group 1 is the one to use). The backend publish gate
 *        enforces the same rule (admin-products.js validateBrandForPublish).
 * Superusers see every brand without restrictions.
 */

export function isRegisteredBrand(b) {
  const lvl = String(b?.verification_level || "");
  const type = String(b?.brand_type || "");
  return lvl === "verified" || lvl === "reseller"
    || ((type === "own_registered" || type === "authorized_reseller") && (b?.status || "active") === "active");
}

const norm = (s) => String(s || "").trim().toLowerCase();

export function buildBrandOptions({ brands, sellerId, isSuperuser, currentId, t }) {
  const list = Array.isArray(brands) ? brands : [];
  const me = String(sellerId || "").trim();
  const cmp = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  const none = { label: t("— None —", "— Yok —", "— Aucune —", "— Ninguna —", "— Nessuna —", "— Keine —"), value: "" };

  const statusSuffix = (b) => {
    if (b.status === "superseded") return ` (${t("superseded by registered brand", "tescilli marka tarafından geçersiz kılındı", "remplacé par une marque déposée", "reemplazado por marca registrada", "sostituito da brand registrato", "durch registrierte Marke ersetzt")})`;
    if ((b.status || "active") !== "active") return ` (${t("pending authorization", "onay bekliyor", "autorisation en attente", "autorización pendiente", "autorizzazione in attesa", "Autorisierung ausstehend")})`;
    if (isRegisteredBrand(b)) return ` ✓ ${t("registered", "tescilli", "déposée", "registrada", "registrato", "registriert")}`;
    return "";
  };

  if (isSuperuser || !me) {
    const all = list
      .filter((b) => (b.status || "active") === "active" || b.id === currentId)
      .sort(cmp)
      .map((b) => ({ label: `${b.name}${statusSuffix(b)}`, value: b.id }));
    return { options: [none, ...all], hasLockedRegistered: false };
  }

  const mine = list.filter((b) => String(b.seller_id || "") === me).sort(cmp);
  const myActiveNames = new Set(mine.filter((b) => (b.status || "active") === "active").map((b) => norm(b.name)));
  const myAuthorizedNames = new Set(mine.filter((b) => (b.status || "active") === "active" && isRegisteredBrand(b)).map((b) => norm(b.name)));

  // Other sellers' entries: one per name, the registered entry wins over unverified claims.
  const byName = new Map();
  for (const b of list) {
    if (String(b.seller_id || "") === me) continue;
    if ((b.status || "active") !== "active" && b.id !== currentId) continue;
    const key = norm(b.name);
    if (myActiveNames.has(key) && b.id !== currentId) continue; // own entry covers this name
    const prev = byName.get(key);
    if (!prev || (isRegisteredBrand(b) && !isRegisteredBrand(prev)) || b.id === currentId) byName.set(key, b);
  }
  let hasLockedRegistered = false;
  const others = [...byName.values()].sort(cmp).map((b) => {
    const lockedRegistered = isRegisteredBrand(b) && !myAuthorizedNames.has(norm(b.name));
    if (lockedRegistered) hasLockedRegistered = true;
    return {
      label: lockedRegistered
        ? `${b.name} (${t("registered — authorization required", "tescilli — yetki gerekli", "déposée — autorisation requise", "registrada — se requiere autorización", "registrato — autorizzazione necessaria", "registriert — Berechtigung nötig")})`
        : `${b.name}${statusSuffix(b)}`,
      value: b.id,
      disabled: lockedRegistered && b.id !== currentId,
    };
  });

  const options = [none];
  if (mine.length) {
    options.push({
      title: t("My brands", "Markalarım", "Mes marques", "Mis marcas", "I miei brand", "Meine Marken"),
      options: mine.map((b) => ({
        label: `${b.name}${statusSuffix(b)}`,
        value: b.id,
        disabled: (b.status || "active") !== "active" && b.id !== currentId,
      })),
    });
  }
  if (others.length) {
    options.push({ title: t("Other brands", "Diğer markalar", "Autres marques", "Otras marcas", "Altri brand", "Weitere Marken"), options: others });
  }

  // Always surface the currently assigned brand — even if it was filtered out of the
  // selectable lists — so a locked Select never renders blank after save.
  const cur = String(currentId || "").trim();
  if (cur) {
    const flatten = (opts) => opts.flatMap((o) => (o && Array.isArray(o.options) ? o.options : [o]));
    const known = new Set(flatten(options).map((o) => String(o?.value || "")));
    if (!known.has(cur)) {
      const row = list.find((b) => String(b.id) === cur);
      options.push({
        label: row ? `${row.name}${statusSuffix(row)}` : cur,
        value: cur,
      });
    }
  }

  return { options, hasLockedRegistered };
}
