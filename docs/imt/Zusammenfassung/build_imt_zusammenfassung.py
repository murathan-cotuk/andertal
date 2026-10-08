# -*- coding: utf-8 -*-
"""IM-Trading Zusammenfassung:
- Keep products ordered since 2025-01-01
- Order count per Artikelnummer
- Match deepest Andertal (AmazonCategories) leaf: name, slug, id
- Attributes + infer Farbe/Groesse/Material/Mass from name/description when missing
"""
from __future__ import annotations

import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

BASE = Path(__file__).resolve().parent.parent
DOCS = BASE.parent  # docs/
OUT = Path(__file__).resolve().parent / "IMT Zusammenfassung.xlsx"
AMAZON_CATS = DOCS / "AmazonCategories.csv"

ENC = "cp1252"
ENC_ERRORS = "replace"
SEP = ";"
EXCEL_MAX_CELL = 32767

KEY_ATTRS = [
    "Farbe",
    "Größe",
    "Material",
    "Material..",
    "Grundfarbe",
    "WEE_Nummer",
    "WEE_Kategorie",
    "gpsr_manufacturer_name",
    "gpsr_manufacturer_email",
    "gpsr_manufacturer_country",
    "BulletPoints",
]

# DE color tokens (word-boundary match, longest first)
COLORS = sorted(
    [
        "schwarz",
        "weiß",
        "weiss",
        "grau",
        "silber",
        "gold",
        "rot",
        "blau",
        "grün",
        "gruen",
        "gelb",
        "orange",
        "pink",
        "rosa",
        "lila",
        "violett",
        "beige",
        "braun",
        "türkis",
        "tuerkis",
        "cyan",
        "navy",
        "creme",
        "ivory",
        "transparent",
        "klar",
        "bunt",
        "mehrfarbig",
        "anthrazit",
        "khaki",
        "bordeaux",
        "champagne",
        "kupfer",
        "bronze",
        "olive",
        "mint",
        "coral",
        "magenta",
        "petrol",
        "natur",
        "holzoptik",
    ],
    key=len,
    reverse=True,
)

MATERIALS = sorted(
    [
        "polyester",
        "baumwolle",
        "cotton",
        "leder",
        "kunstleder",
        "kunststoff",
        "plastik",
        "silikon",
        "silicone",
        "metall",
        "edelstahl",
        "aluminium",
        "aluminum",
        "holz",
        "glas",
        "nylon",
        "spandex",
        "elastan",
        "viscose",
        "viskose",
        "wolle",
        "filz",
        "flanell",
        "samt",
        "velours",
        "keramik",
        "porzellan",
        "gummi",
        "kautschuk",
        "carbon",
        "karbon",
        "abs",
        "pvc",
        "tpu",
        "pc",
        "mesh",
        "neopren",
        "bambus",
        "kork",
        "stein",
        "marmor",
        "papier",
        "karton",
        "stoff",
        "textil",
        "jeans",
        "denim",
        "leinen",
        "satin",
        "seide",
        "mikrofasern",
        "mikrofaser",
    ],
    key=len,
    reverse=True,
)

# JTL / DE shop category hints → English Amazon path tokens (boost)
CAT_HINTS = {
    "schuhe": ["shoes", "footwear", "slippers", "boots", "sneakers", "sandals", "loafers"],
    "hausschuhe": ["slippers", "house slippers", "slipper"],
    "bekleidung": ["clothing", "apparel", "shirts", "dresses", "pants", "hoodies"],
    "hüllen": ["cases", "covers", "sleeves", "phone cases"],
    "huellen": ["cases", "covers", "sleeves", "phone cases"],
    "handyzubehör": ["cell phone accessories", "phone cases", "chargers"],
    "handyzubehoer": ["cell phone accessories", "phone cases", "chargers"],
    "tablet": ["tablets", "tablet accessories"],
    "pc": ["computers", "laptops", "pc accessories"],
    "laptop": ["laptops", "laptop accessories"],
    "led": ["lighting", "led lights", "light bulbs"],
    "leuchtmittel": ["light bulbs", "led bulbs"],
    "decken": ["blankets", "throws", "bedding"],
    "spielzeug": ["toys", "games", "kids toys"],
    "gläser": ["drinkware", "glassware", "tumblers"],
    "glaeser": ["drinkware", "glassware", "tumblers"],
    "taschen": ["bags", "handbags", "backpacks", "shoulder bags"],
    "rucksack": ["backpacks"],
    "umhängetasche": ["shoulder bags", "handbags", "crossbody"],
    "umhaengetasche": ["shoulder bags", "handbags", "crossbody"],
    "auto": ["automotive", "car accessories", "exterior accessories"],
    "frontscheibe": ["windshield", "car covers", "automotive"],
    "garten": ["garden", "patio", "outdoor"],
    "küche": ["kitchen", "dining", "cookware"],
    "kueche": ["kitchen", "dining", "cookware"],
    "wohnen": ["home", "home decor", "furniture"],
    "elektronische": ["electronics", "computers", "cell phones"],
    "fashion": ["clothing", "shoes", "jewelry", "handbags"],
    "panzerhülle": ["phone cases", "screen protectors", "cases"],
    "panzerhuelle": ["phone cases", "screen protectors", "cases"],
    "disney": ["character toys", "toys"],
    "nähen": ["sewing", "sewing kits", "crafts"],
    "naehen": ["sewing", "sewing kits", "crafts"],
    "heiz": ["heaters", "heating pads", "foot warmers"],
    "fußwärmer": ["foot warmers", "heating pads"],
    "fusswaermer": ["foot warmers", "heating pads"],
    "kinder": ["kids", "boys", "girls", "baby"],
}


def clean_excel_str(val):
    if val is None:
        return ""
    if not isinstance(val, str):
        return val
    s = ILLEGAL_CHARACTERS_RE.sub("", val)
    if len(s) > EXCEL_MAX_CELL:
        s = s[: EXCEL_MAX_CELL - 12] + "...[gekuerzt]"
    return s


def log(msg: str) -> None:
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


def norm(s: str) -> str:
    s = (s or "").lower().replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


STOP = {
    "mit",
    "und",
    "fur",
    "fuer",
    "aus",
    "der",
    "die",
    "das",
    "dem",
    "den",
    "ein",
    "eine",
    "einer",
    "gegen",
    "oder",
    "von",
    "zum",
    "zur",
    "bei",
    "nach",
    "uber",
    "ueber",
    "ohne",
    "auch",
    "sehr",
    "plus",
    "set",
    "teile",
    "stuck",
    "stueck",
    "cm",
    "mm",
    "inkl",
}


def tokens(s: str) -> set[str]:
    return {t for t in norm(s).split() if len(t) >= 3 and t not in STOP}


def strip_html(html: str) -> str:
    if not html:
        return ""
    t = re.sub(r"(?is)<script.*?>.*?</script>", " ", html)
    t = re.sub(r"(?is)<style.*?>.*?</style>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = (
        t.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&uuml;", "ü")
        .replace("&ouml;", "ö")
        .replace("&auml;", "ä")
        .replace("&Uuml;", "Ü")
        .replace("&Ouml;", "Ö")
        .replace("&Auml;", "Ä")
        .replace("&szlig;", "ß")
        .replace("&quot;", '"')
        .replace("&reg;", "")
        .replace("&ndash;", "-")
        .replace("&mdash;", "-")
    )
    return re.sub(r"\s+", " ", t).strip()


# --- data loaders ---


def load_order_counts(path: Path) -> Counter:
    counts: Counter = Counter()
    with path.open("r", encoding=ENC, errors=ENC_ERRORS, newline="") as f:
        reader = csv.DictReader(f, delimiter=SEP)
        for row in reader:
            sku = (row.get("Artikelnummer") or "").strip()
            if sku:
                counts[sku] += 1
    return counts


def load_products(path: Path, ordered: set[str]) -> tuple[list[str], list[dict], int]:
    rows: list[dict] = []
    total = 0
    with path.open("r", encoding=ENC, errors=ENC_ERRORS, newline="") as f:
        reader = csv.DictReader(f, delimiter=SEP)
        fieldnames = list(reader.fieldnames or [])
        # drop empty trailing header names
        fieldnames = [c for c in fieldnames if c]
        for row in reader:
            total += 1
            sku = (row.get("Artikelnummer") or "").strip()
            if sku and sku in ordered:
                rows.append({k: (row.get(k) if row.get(k) is not None else "") for k in fieldnames})
            if total % 50000 == 0:
                log(f"   ... products scanned {total:,}, kept {len(rows):,}")
    return fieldnames, rows, total


def load_attributes(path: Path, keep_skus: set[str]) -> tuple[dict[str, dict[str, str]], list[dict]]:
    by_sku: dict[str, dict[str, str]] = defaultdict(dict)
    long_rows: list[dict] = []
    scanned = 0
    with path.open("r", encoding=ENC, errors=ENC_ERRORS, newline="") as f:
        reader = csv.DictReader(f, delimiter=SEP)
        for row in reader:
            scanned += 1
            sku = (row.get("Artikelnummer") or "").strip()
            if not sku or sku not in keep_skus:
                continue
            name = (row.get("Attributname") or "").strip()
            val = row.get("Attributwert") or ""
            if not name:
                continue
            prev = by_sku[sku].get(name)
            if prev and prev != val:
                by_sku[sku][name] = f"{prev} | {val}"
            else:
                by_sku[sku][name] = val
            long_rows.append(
                {
                    "Artikelnummer": sku,
                    "Attributgruppe": row.get("Attributgruppe") or "",
                    "AttributId": row.get("AttributId") or "",
                    "Attributname": name,
                    "Attributwert": val,
                }
            )
            if scanned % 100000 == 0:
                log(f"   ... attributes scanned {scanned:,}, kept rows {len(long_rows):,}")
    return by_sku, long_rows


def load_andertal_leaves(path: Path) -> tuple[list[dict], dict[str, list[int]]]:
    """Deepest non-empty subcategory per row = leaf candidate + inverted token index."""
    leaves = []
    inv: dict[str, list[int]] = defaultdict(list)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        name_cols = ["Main Category"] + [f"Subcategory {i}" for i in range(1, 9)]
        id_cols = ["Main ID"] + [f"SUB{i} ID" for i in range(1, 9)]
        slug_cols = ["Main Slug", "SUB1 Slug", "SUB2 Slug", "SUB3 Slug", "SUB4-Slug", "SUB5 Slug", "SUB6 Slug", "SUB7 Slug", "SUB8 Slug"]
        for row in reader:
            depth = 0
            for i, col in enumerate(name_cols):
                if (row.get(col) or "").strip():
                    depth = i
            name = (row.get(name_cols[depth]) or "").strip()
            cid = (row.get(id_cols[depth]) or "").strip()
            slug = (row.get(slug_cols[depth]) or "").strip()
            if not name or not cid:
                continue
            path_names = [(row.get(c) or "").strip() for c in name_cols[: depth + 1] if (row.get(c) or "").strip()]
            path_slugs = [(row.get(c) or "").strip() for c in slug_cols[: depth + 1] if (row.get(c) or "").strip()]
            path_str = " > ".join(path_names)
            tok = tokens(path_str + " " + " ".join(path_slugs))
            idx = len(leaves)
            leaves.append(
                {
                    "name": name,
                    "id": cid,
                    "slug": slug,
                    "path": path_str,
                    "depth": depth,
                    "tokens": tok,
                    "name_tokens": tokens(name),
                }
            )
            for t in tok:
                inv[t].append(idx)
    log(f"   Andertal leaf categories: {len(leaves):,}")
    return leaves, inv


def match_category(product: dict, leaves: list[dict], inv: dict[str, list[int]]) -> dict:
    """Best deep leaf by token overlap of name + JTL cats + hints (inverted index)."""
    empty = {
        "Andertal_Kategorie_Name": "",
        "Andertal_Kategorie_Slug": "",
        "Andertal_Kategorie_ID": "",
        "Andertal_Kategorie_Pfad": "",
        "Andertal_Match_Score": 0,
    }
    name = product.get("Artikelname") or ""
    c1 = product.get("Kategorie Ebene 1") or ""
    c2 = product.get("Kategorie Ebene 2") or ""
    wg = product.get("Warengruppe") or ""
    text = f"{name} {c1} {c2} {wg}"
    tok = tokens(text)
    if not tok:
        return empty

    boost = set()
    hint_blob = f"{c1} {c2} {name}"
    n_hint = norm(hint_blob)
    for de, ens in CAT_HINTS.items():
        if de in n_hint:
            for en in ens:
                boost |= tokens(en)

    # compound DE words in product name → EN shoe/slipper etc.
    n_name = norm(name)
    if "hausschuh" in n_name or "pantoffel" in n_name or "slipper" in n_name:
        boost |= tokens("slippers house slippers kids slippers")
    if "schuhe" in n_name or "stiefel" in n_name or "sneaker" in n_name:
        boost |= tokens("shoes sneakers boots footwear")
    if "hulle" in n_name or "huelle" in n_name or "case" in n_name:
        boost |= tokens("phone cases covers")
    if any(x in n_name for x in ("kochtopf", "wasserkessel", "kessel", "pfanne", "topf", "induktion", "suppentopf", "bratpfanne")):
        boost |= tokens("cookware pots pans tea kettles kitchen dining stockpots")
    if "led" in n_name or "leucht" in n_name or "lampe" in n_name:
        boost |= tokens("lighting light bulbs led lights lamps")

    query = tok | boost
    jtl_tok = tokens(f"{c1} {c2}") | boost
    cand_counts: Counter = Counter()
    for t in query:
        for idx in inv.get(t, ()):
            cand_counts[idx] += 1

    if not cand_counts:
        return empty

    name_tok = tokens(name)
    best = None
    best_score = 0.0
    for idx, _ in cand_counts.most_common(120):
        leaf = leaves[idx]
        inter = query & leaf["tokens"]
        if not inter:
            continue
        # Prefer overlap with leaf NAME and JTL-driven boost tokens
        name_hit = len(leaf["name_tokens"] & name_tok)
        boost_hit = len(leaf["tokens"] & boost)
        jtl_hit = len(leaf["tokens"] & jtl_tok)
        score = (
            float(len(inter))
            + name_hit * 3.0
            + boost_hit * 2.5
            + jtl_hit * 1.5
            + leaf["depth"] * 0.2
        )
        # kids product should prefer kids/boys/girls path
        if "kinder" in n_name or "kinder" in norm(c2):
            if {"kids", "boys", "girls", "baby", "children"} & leaf["tokens"]:
                score += 2.0
            if {"womens", "women", "mens", "men"} & leaf["tokens"] and not ({"kids", "boys", "girls", "baby"} & leaf["tokens"]):
                score -= 2.0
        if "hausschuh" in n_name or "pantoffel" in n_name:
            if "slipper" in leaf["tokens"] or "slippers" in leaf["tokens"]:
                score += 5.0
            if "boot" in leaf["tokens"] or "boots" in leaf["tokens"]:
                score -= 4.0
        if any(x in n_name for x in ("kochtopf", "wasserkessel", "kessel", "pfanne", "topf", "induktion", "suppentopf")):
            if {"cookware", "pots", "pans", "kettles", "kitchen", "dining", "stockpots"} & leaf["tokens"]:
                score += 5.0
            if {"garden", "miniature", "furniture", "outdoor"} & leaf["tokens"] and "kitchen" not in leaf["tokens"]:
                score -= 5.0
        if score > best_score:
            best_score = score
            best = leaf

    if not best or best_score < 2.0:
        empty["Andertal_Match_Score"] = round(best_score, 2)
        return empty

    return {
        "Andertal_Kategorie_Name": best["name"],
        "Andertal_Kategorie_Slug": best["slug"],
        "Andertal_Kategorie_ID": best["id"],
        "Andertal_Kategorie_Pfad": best["path"],
        "Andertal_Match_Score": round(best_score, 2),
    }


def find_color(text: str) -> str:
    n = " " + norm(text) + " "
    for c in COLORS:
        if f" {norm(c)} " in n:
            # pretty DE form
            pretty = {
                "weiss": "Weiß",
                "weiß": "Weiß",
                "gruen": "Grün",
                "grün": "Grün",
                "tuerkis": "Türkis",
                "türkis": "Türkis",
                "schwarz": "Schwarz",
                "grau": "Grau",
                "silber": "Silber",
                "gold": "Gold",
                "rot": "Rot",
                "blau": "Blau",
                "gelb": "Gelb",
                "orange": "Orange",
                "pink": "Pink",
                "rosa": "Rosa",
                "lila": "Lila",
                "violett": "Violett",
                "beige": "Beige",
                "braun": "Braun",
                "anthrazit": "Anthrazit",
                "transparent": "Transparent",
                "natur": "Natur",
            }.get(c, c.capitalize())
            return pretty
    return ""


def find_size(text: str) -> str:
    # Größe 33 / Gr. 42 / EU 40
    m = re.search(r"(?i)(?:größe|groesse|gr\.?|size|eu)\s*[:=]?\s*(\d{1,3}(?:[.,]\d)?)", text)
    if m:
        return m.group(1).replace(",", ".")
    # dimensions 260 × 114 cm or 30x30x3 cm
    m = re.search(
        r"(?i)(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(cm|mm|m)?",
        text,
    )
    if m:
        parts = [m.group(1).replace(",", "."), m.group(2).replace(",", ".")]
        if m.group(3):
            parts.append(m.group(3).replace(",", "."))
        unit = (m.group(4) or "cm").lower()
        return " x ".join(parts) + f" {unit}"
    return ""


def find_material(text: str) -> str:
    n = " " + norm(text) + " "
    for mat in MATERIALS:
        if f" {norm(mat)} " in n:
            pretty = {
                "kunststoff": "Kunststoff",
                "baumwolle": "Baumwolle",
                "polyester": "Polyester",
                "leder": "Leder",
                "kunstleder": "Kunstleder",
                "silikon": "Silikon",
                "edelstahl": "Edelstahl",
                "aluminium": "Aluminium",
                "mikrofaser": "Mikrofaser",
                "mikrofasern": "Mikrofaser",
            }.get(mat, mat.capitalize())
            return pretty
    return ""


def infer_attrs(product: dict, existing: dict[str, str]) -> dict:
    """Fill Farbe/Größe/Material/Mass from name+description when missing."""
    name = product.get("Artikelname") or ""
    desc = strip_html(product.get("Beschreibung") or "")
    blob = f"{name} {desc}"
    # also product dimension fields
    b, h, l = product.get("Breite") or "", product.get("Höhe") or "", product.get("Länge") or ""

    farbe = (existing.get("Farbe") or existing.get("Grundfarbe") or "").strip()
    groesse = (existing.get("Größe") or "").strip()
    material = (existing.get("Material") or existing.get("Material..") or "").strip()
    if farbe and farbe.islower():
        farbe = farbe[:1].upper() + farbe[1:]

    farbe_src = "attribut" if farbe else ""
    groesse_src = "attribut" if groesse else ""
    material_src = "attribut" if material else ""
    mass = ""
    mass_src = ""

    if not farbe:
        farbe = find_color(blob)
        if farbe:
            farbe_src = "inferred"
    if not groesse:
        groesse = find_size(name) or find_size(blob)
        if groesse:
            groesse_src = "inferred"
    if not material:
        material = find_material(blob)
        if material:
            material_src = "inferred"

    if b or h or l:
        dims = [x for x in (b, h, l) if str(x).strip()]
        if dims:
            mass = " x ".join(str(x).strip() for x in dims)
            mass_src = "produktfelder"
    if not mass:
        m = find_size(blob)
        # only treat as Maß if looks like dimensions (has x)
        if m and " x " in m:
            mass = m
            mass_src = "inferred"

    return {
        "Farbe": farbe,
        "Farbe_Quelle": farbe_src,
        "Größe": groesse,
        "Größe_Quelle": groesse_src,
        "Material": material,
        "Material_Quelle": material_src,
        "Maß": mass,
        "Maß_Quelle": mass_src,
    }


def format_all_attrs(attrs: dict[str, str]) -> str:
    if not attrs:
        return ""
    return " | ".join(f"{k}={attrs[k]}" for k in sorted(attrs.keys()))


def main() -> int:
    best = BASE / "MC Bestellungen ab 01.01.2025.csv"
    prod = BASE / "MC Alle Produkte Detayli.csv"
    attr = BASE / "MC Alle Attribute.csv"
    for p in (best, prod, attr, AMAZON_CATS):
        if not p.exists():
            log(f"MISSING: {p}")
            return 1

    log("1/5 Bestellungen -> order counts...")
    order_counts = load_order_counts(best)
    ordered = set(order_counts.keys())
    log(f"   ordered SKUs: {len(ordered):,}")
    log(f"   total order lines: {sum(order_counts.values()):,}")

    log("2/5 Produkte (only with orders)...")
    prod_fields, products, total_products = load_products(prod, ordered)
    product_skus = {r["Artikelnummer"].strip() for r in products}
    log(f"   catalog total: {total_products:,} | kept: {len(products):,} | dropped: {total_products - len(products):,}")
    if products:
        log(f"   sample: {products[0].get('Artikelname', '')}")

    log("3/5 Attribute...")
    attr_by_sku, attr_long = load_attributes(attr, product_skus)
    log(f"   attribute rows: {len(attr_long):,} | SKUs with attrs: {len(attr_by_sku):,}")

    log("4/5 Andertal category leaves + match...")
    leaves, cat_inv = load_andertal_leaves(AMAZON_CATS)

    log("5/5 Enrich rows + write xlsx...")
    # Column order: Artikelnummer, then new cols, then rest of product, then attrs
    lead_extra = [
        "Bestellmenge_seit_01_01_2025",
        "Andertal_Kategorie_Name",
        "Andertal_Kategorie_Slug",
        "Andertal_Kategorie_ID",
        "Andertal_Kategorie_Pfad",
        "Andertal_Match_Score",
        "Farbe",
        "Farbe_Quelle",
        "Größe",
        "Größe_Quelle",
        "Material",
        "Material_Quelle",
        "Maß",
        "Maß_Quelle",
        "Alle_Attribute",
    ]
    # avoid duplicating attr columns that already exist in prod_fields
    rest_fields = [c for c in prod_fields if c != "Artikelnummer"]
    # drop old Farbe/Größe/Material from rest if present — we rewrite after AN
    skip_dup = {"Farbe", "Größe", "Material", "Material..", "Grundfarbe"}
    rest_fields = [c for c in rest_fields if c not in skip_dup]
    # keep remaining KEY_ATTRS that aren't in lead
    other_key = [k for k in KEY_ATTRS if k not in ("Farbe", "Größe", "Material", "Material..", "Grundfarbe")]

    wide = []
    matched = 0
    inferred_any = 0
    for i, r in enumerate(products):
        sku = r["Artikelnummer"].strip()
        attrs = dict(attr_by_sku.get(sku, {}))
        cat = match_category(r, leaves, cat_inv)
        if cat["Andertal_Kategorie_ID"]:
            matched += 1
        inferred = infer_attrs(r, attrs)
        if any(inferred[k + "_Quelle"] == "inferred" for k in ("Farbe", "Größe", "Material") if inferred.get(k)):
            inferred_any += 1
        # sync inferred into attrs for Alle_Attribute display
        for k in ("Farbe", "Größe", "Material"):
            if inferred.get(k) and not attrs.get(k):
                attrs[k] = inferred[k]
        if inferred.get("Maß"):
            attrs["Maß"] = inferred["Maß"]

        out = {
            "Artikelnummer": sku,
            "Bestellmenge_seit_01_01_2025": int(order_counts.get(sku, 0)),
            **cat,
            "Farbe": inferred["Farbe"],
            "Farbe_Quelle": inferred["Farbe_Quelle"],
            "Größe": inferred["Größe"],
            "Größe_Quelle": inferred["Größe_Quelle"],
            "Material": inferred["Material"],
            "Material_Quelle": inferred["Material_Quelle"],
            "Maß": inferred["Maß"],
            "Maß_Quelle": inferred["Maß_Quelle"],
            "Alle_Attribute": format_all_attrs(attrs),
        }
        for k in rest_fields:
            out[k] = r.get(k, "")
        for k in other_key:
            out[k] = attrs.get(k, "") if k not in out else out.get(k, "")
            if k in attrs and not out.get(k):
                out[k] = attrs[k]
        wide.append(out)
        if (i + 1) % 5000 == 0:
            log(f"   ... enriched {i + 1:,}/{len(products):,}")

    cols = ["Artikelnummer"] + lead_extra + rest_fields + [k for k in other_key if k not in lead_extra]
    # unique preserve order
    seen = set()
    cols_u = []
    for c in cols:
        if c not in seen:
            seen.add(c)
            cols_u.append(c)

    df_prod = pd.DataFrame(wide)
    for c in cols_u:
        if c not in df_prod.columns:
            df_prod[c] = ""
    df_prod = df_prod[cols_u]
    for col in df_prod.columns:
        if df_prod[col].dtype == object:
            df_prod[col] = df_prod[col].map(clean_excel_str)

    df_attr = pd.DataFrame(attr_long)
    if not df_attr.empty:
        for col in df_attr.columns:
            if df_attr[col].dtype == object:
                df_attr[col] = df_attr[col].map(clean_excel_str)

    df_meta = pd.DataFrame(
        [
            {"Kenntnis": "Ordered SKUs", "Wert": len(ordered)},
            {"Kenntnis": "Order lines seit 01.01.2025", "Wert": sum(order_counts.values())},
            {"Kenntnis": "Katalog Produkte gesamt", "Wert": total_products},
            {"Kenntnis": "Produkte behalten", "Wert": len(products)},
            {"Kenntnis": "Produkte entfernt (keine Bestellung)", "Wert": total_products - len(products)},
            {"Kenntnis": "Mit Andertal-Kategorie Match", "Wert": matched},
            {"Kenntnis": "Mit inferred Farbe/Groesse/Material", "Wert": inferred_any},
            {"Kenntnis": "Attribute-Zeilen", "Wert": len(attr_long)},
            {"Kenntnis": "Kategoriequelle", "Wert": str(AMAZON_CATS.name)},
            {"Kenntnis": "Encoding", "Wert": ENC},
        ]
    )

    if OUT.exists():
        OUT.unlink()

    with pd.ExcelWriter(OUT, engine="openpyxl") as writer:
        df_meta.to_excel(writer, sheet_name="Info", index=False)
        df_prod.to_excel(writer, sheet_name="Produkte", index=False)
        if not df_attr.empty:
            df_attr.to_excel(writer, sheet_name="Attribute", index=False)

    log(f"DONE -> {OUT}")
    log(f"   size: {OUT.stat().st_size / (1024 * 1024):.1f} MB")
    log(f"   Produkte {len(df_prod):,} | Kategorie-Match {matched:,} | inferred {inferred_any:,}")
    # spot-check first row
    if len(df_prod):
        r0 = df_prod.iloc[0]
        log(f"   sample AN={r0['Artikelnummer']} qty={r0['Bestellmenge_seit_01_01_2025']}")
        log(f"   sample name={r0.get('Artikelname', '')}")
        log(f"   sample cat={r0['Andertal_Kategorie_Name']} | {r0['Andertal_Kategorie_Slug']}")
        log(f"   sample Farbe={r0['Farbe']} ({r0['Farbe_Quelle']}) Groesse={r0['Größe']} ({r0['Größe_Quelle']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
