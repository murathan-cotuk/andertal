import { lt } from "@/lib/locale-text";

function t(locale, en, tr, fr, es, it, de) {
  return lt(locale, en, tr, fr, es, it, de);
}

function fallbackByStatus(locale, status) {
  switch (status) {
    case "versendet":
      return t(
        locale,
        "Package was shipped",
        "Paket kargoya verildi",
        "Colis expédié",
        "Paquete enviado",
        "Pacco spedito",
        "Paket wurde versendet",
      );
    case "zugestellt":
      return t(
        locale,
        "Package was delivered",
        "Paket teslim edildi",
        "Colis livré",
        "Paquete entregado",
        "Pacco consegnato",
        "Paket wurde zugestellt",
      );
    case "in_transit":
      return t(
        locale,
        "Package in transit",
        "Paket yolda",
        "Colis en transit",
        "Paquete en tránsito",
        "Pacco in transito",
        "Paket unterwegs",
      );
    case "exception":
      return t(
        locale,
        "Delivery exception",
        "Teslimat istisnası",
        "Anomalie de livraison",
        "Incidencia de entrega",
        "Eccezione di consegna",
        "Zustellungsproblem",
      );
    case "retour":
      return t(
        locale,
        "Return in progress",
        "İade sürecinde",
        "Retour en cours",
        "Devolución en curso",
        "Reso in corso",
        "Retoure läuft",
      );
    default:
      return "";
  }
}

/** Localize system-generated shipment event descriptions stored in German. */
export function localizeShipmentEventDescription(locale, ev) {
  const desc = String(ev?.description || "").trim();
  const loc = String(locale || "de").slice(0, 2).toLowerCase();

  if (!desc) return fallbackByStatus(loc, ev?.status);

  if (/^Paket wurde versendet$/i.test(desc)) {
    return fallbackByStatus(loc, "versendet");
  }
  if (/^Paket wurde zugestellt$/i.test(desc)) {
    return fallbackByStatus(loc, "zugestellt");
  }

  const carrierMatch = desc.match(/^Paket bei (.+?) aufgegeben(?: \((.+?)\))?$/i);
  if (carrierMatch) {
    const carrier = carrierMatch[1];
    const tracking = carrierMatch[2];
    if (tracking) {
      return t(
        loc,
        `Package handed to ${carrier} (${tracking})`,
        `Paket ${carrier} firmasına teslim edildi (${tracking})`,
        `Colis remis à ${carrier} (${tracking})`,
        `Paquete entregado a ${carrier} (${tracking})`,
        `Pacco consegnato a ${carrier} (${tracking})`,
        `Paket bei ${carrier} aufgegeben (${tracking})`,
      );
    }
    return t(
      loc,
      `Package handed to ${carrier}`,
      `Paket ${carrier} firmasına teslim edildi`,
      `Colis remis à ${carrier}`,
      `Paquete entregado a ${carrier}`,
      `Pacco consegnato a ${carrier}`,
      `Paket bei ${carrier} aufgegeben`,
    );
  }

  return desc;
}
