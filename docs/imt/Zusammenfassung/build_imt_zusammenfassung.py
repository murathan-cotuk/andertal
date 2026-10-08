# -*- coding: utf-8 -*-
"""IM-Trading Zusammenfassung:
- Keep products ordered since 2025-01-01
- Order count per Artikelnummer
- Match Andertal leaf categories from DB (admin_hub_categories) by exact name/description evidence
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
ROOT = DOCS.parent
OUT = Path(__file__).resolve().parent / "IMT Zusammenfassung.xlsx"
ENV_PATH = ROOT / "apps" / "medusa-backend" / ".env"

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

# Explicit product-type phrases → REAL admin_hub leaf slugs (longest phrase wins).
# Critical: longer phrases first at match time (e.g. magnettelefonhalter > automagnet).
ALIAS_BY_SLUG: dict[str, list[str]] = {
    # phones / car mounts — B-5562 style
    "cell-phone-automobile-cradles": [
        "magnettelefonhalter",
        "auto magnettelefonhalter",
        "autotelefonhalter",
        "kfz telefonhalter",
        "handy autohalterung",
        "handyautohalterung",
        "lueftungsschlitzhalter",
        "luftungsschlitzhalter",
        "luftungsschlitz",
        "telefonhalter fuer luftung",
        "handyhalterung auto",
        "handyhalter auto",
        "auto handyhalter",
    ],
    "cell-phone-bedstand-desk-mounts": [
        "telefonhalter",
        "handyhalterung",
        "handyhalter",
        "smartphonehalter",
        "handy halterung",
        "schreibtisch handyhalter",
        "bett handyhalter",
    ],
    "cell-phone-handlebar-mounts": ["lenkerhalterung", "fahrrad handyhalter"],
    "cell-phone-basic-cases": [
        "handyhuelle",
        "handyhulle",
        "smartphone huelle",
        "smartphone hulle",
        "handytasche",
        "panzerhuelle",
        "panzerhulle",
        "handycover",
        "schutzhuelle",
        "schutzhulle",
        "silikonhuelle",
        "silikonhulle",
        "iphone huelle",
        "iphone hulle",
        "samsung huelle",
        "samsung hulle",
        "handy schutz",
        "handy case",
        "phone case",
        "wallet handyhuelle",
        "wallet handyhulle",
        "wallet fuer samsung",
        "wallet fuer iphone",
        "wallet fuer google",
        "wallet fuer galaxy",
        "smart touch fuer samsung",
        "smart touch fuer galaxy",
        "huelle kompatibel mit iphone",
        "huelle kompatibel mit samsung",
        "huelle kompatibel mit galaxy",
        "huelle kompatibel mit xiaomi",
        "huelle kompatibel mit redmi",
        "huelle kompatibel mit google",
        "huelle fuer iphone",
        "huelle fuer samsung",
        "huelle fuer galaxy",
        "huelle fuer xiaomi",
        "case kompatibel mit iphone",
        "case kompatibel mit samsung",
        "universalhuelle",
        "universalhuelle smartphone",
        "magpeak",
        "magmat huelle",
    ],
    "tablet-cases": [
        "ipad huelle",
        "tablethuelle",
        "tablet huelle",
        "galaxy tab huelle",
        "huelle fuer ipad",
        "huelle fuer galaxy tab",
        "smartcase huelle fuer ipad",
        "smartcase huelle fuer samsung galaxy tab",
        "lenovo tab huelle",
    ],
    "nintendo-switch-cases-storage": [
        "nintendo switch huelle",
        "switch huelle",
        "switch hardpouch",
        "carbonox huelle fuer nintendo",
    ],
    "flip-cell-phone-cases": ["flip huelle", "flip hulle", "klaphuelle", "klaphulle", "bookcase handy", "view case", "huelle mit klappe"],
    "cell-phone-screen-protectors": [
        "displayschutzfolie",
        "panzerfolie",
        "schutzfolie",
        "glasfolie",
        "schutzglas",
        "displayglas",
    ],
    "cell-phone-portable-power-banks": ["powerbank", "power bank", "externer akku"],
    "cell-phone-automobile-chargers": ["kfz ladegeraet", "autoladegeraet", "12v ladegeraet", "kfz ladekabel"],
    "cell-phone-wireless-chargers": ["kabelloses ladegeraet", "wireless charger", "induktionsladegeraet"],
    "cell-phone-wall-chargers": ["netzteil handy", "wandladegeraet", "steckdosenladegeraet", "schnellladegeraet"],
    "cell-phone-tripods": ["handy stativ", "smartphonestativ", "handytripod"],
    # kitchen
    "tea-kettles": ["wasserkessel", "flotenkessel", "floetenkessel", "teekessel", "pfeifkessel"],
    "electric-kettles": ["wasserkocher"],
    "stockpots": ["kochtopf", "suppentopf", "kochtopfe"],
    "chefs-pans": ["bratpfanne", "grillpfanne", "omelettpfanne"],  # NOT bare "pfanne" (für Pfannen trap)
    "saucepans": ["stielkasserolle", "kasserolle"],
    "knife-blocks": ["messerblock", "messerblocke", "messerbloecke"],
    "kitchen-knives-accessories": ["kuechenmesser", "kochenmesser", "kochmesser"],
    "cutting-boards": ["schneidebrett", "hackbrett"],
    "baking-dishes": ["auflaufform", "backform", "borcam"],
    "dinner-plates": ["speiseteller", "dessertteller"],
    "serving-bowls": ["servierschuessel", "glasschuessel", "servierschale"],
    "mixing-bowls": ["ruehrschuessel", "ruehrschale"],
    "colanders": ["passiersieb", "seiher", "kuechensieb"],
    "demitasse-cups": ["espressotasse", "mokkatasse", "demitasse"],
    "novelty-coffee-mugs": ["kaffeetasse", "kaffeebecher"],
    "lunch-boxes": ["lunch box", "lunchbox", "brotbox", "brotdose"],
    "bento-boxes": ["bento box", "bentobox"],
    "portable-closets": ["kleiderschrank faltbar", "faltbarer kleiderschrank", "stoffschrank"],
    "dome-surveillance-cameras": ["innenkamera", "ueberwachungskamera", "wlan kamera", "sicherheitskamera"],
    "webcams": ["webcam", "pc kamera"],
    "boys-pajama-sets": ["pyjama jungen", "schlafanzug jungen", "jungen pyjama", "jungen schlafanzug"],
    "girls-pajama-sets": ["pyjama maedchen", "schlafanzug maedchen", "maedchen pyjama", "madchen schlafanzug"],
    "boys-boxer-shorts": ["boxershorts jungen", "boxershorts kinder", "jungen boxershorts"],
    "mens-boxer-shorts": ["boxershorts herren", "herren boxershorts"],
    "kickballs-playground-balls": ["sprungball", "huepfball", "spielball kinder"],
    # coasters / Untersetzer — NEVER furniture tables
    "tabletop-saucers": [
        "korkuntersetzer",
        "glasuntersetzer",
        "bambus untersetzer",
        "tischuntersetzer",
        "untersetzer fuer glaeser",
        "untersetzer fuer tassen",
        "untersetzer fuer becher",
        "untersetzer set",
        "untersetzer",
        "tischschutz fuer glaeser",
    ],
    "trivets": [
        "topfuntersetzer",
        "pfannenuntersetzer",
        "untersetzer fuer toepfe",
        "untersetzer fuer pfannen",
        "hitzeschutz untersetzer",
    ],
    "bar-coasters": ["bar untersetzer", "getraenkeuntersetzer"],
    "mechanical-vibration-damping-pads": [
        "waschmaschinen untersetzer",
        "vibrationsdaempfer",
        "vibrationsdaempfer untersetzer",
        "antivibrationsuntersetzer",
        "waschmaschine untersetzer",
    ],
    # home / soft
    "hand-bath-towels": ["handtuch", "badetuch", "mikrofaserhandtuch"],
    "kids-throw-blankets": ["kuscheldecke", "fleecedecke", "kinderdecke"],
    "wearable-blankets": ["kuscheldecke mit kapuze", "decke mit kapuze"],
    "bedding-duvet-covers": ["bettbezug", "bettdeckenbezug", "bettwaesche"],
    "throw-pillows": ["dekokissen", "zierkissen", "formkissen"],
    "kids-throw-pillows": ["kinder kissen", "kinderkissen"],
    "kids-plush-toy-pillows": ["plueschkissen", "kuschelkissen"],
    "luggage-scales": ["kofferwaage", "gepackwaage", "gepaeckwaage"],
    "casual-daypack-backpacks": ["schulrucksack", "trekkingrucksack", "daypack", "rucksack kinder"],
    "messenger-bags": ["umhaengetasche", "schultertasche", "crossover tasche"],
    "fashion-waist-packs": ["bauchtasche", "huefttasche", "gurteltasche"],
    "womens-tote-handbags": ["shopper tasche", "canvas tasche"],
    "laptop-sleeves": [
        "notebooktasche",
        "laptoptasche",
        "laptop sleeve",
        "laptophuelle",
        "macbook huelle",
        "laptop huelle",
        "neoprenhuelle",
        "smartshell huelle",
    ],
    "folding-umbrellas": ["regenschirm", "taschenschirm", "knirps"],
    "boys-wallets": ["portemonnaie kinder", "kinder portemonnaie", "geldboerse kinder"],
    "womens-wallets": ["portemonnaie", "geldboerse", "geldborse"],
    "keychains": ["schluesselanhaenger", "taschenanhaenger", "schluesselanhanger"],
    # pets
    "standard-cat-litter-boxes": ["katzenklo", "katzentoilette", "schalentoilette"],
    "cat-litter-scoops": ["katzenschaufel", "streuschaufel"],
    "small-animal-carriers": ["transportbox", "transportboxe", "katzen transportbox", "tiertransport"],
    # bike / auto misc
    "bike-saddles": ["fahrradsattel", "fahrradsitz"],
    "bike-cable-locks": ["fahrradschloss", "kabelschloss", "zahlencode schloss", "elektroller schloss"],
    "automotive-magnets": ["wagenmagnet", "autoaufkleber magnet"],
    # apparel (require audience markers in phrase where gendered)
    "girls-fashion-hoodies-sweatshirts": ["maedchen hoodie", "maedchen kapuzen", "madchen hoodie"],
    "boys-fashion-hoodies-sweatshirts": ["jungen hoodie", "jungen kapuzen", "kinder hoodie"],
    "mens-fashion-hoodies-sweatshirts": ["herren hoodie", "herren kapuzenpullover", "herren sweatjacke"],
    "womens-fashion-hoodies-sweatshirts": ["damen hoodie", "damen kapuzenpullover", "damen sweatjacke"],
    "mens-slippers": ["hausschuhe herren", "pantoffeln herren", "herrenhausschuhe"],
    "womens-slippers": ["hausschuhe damen", "damenhausschuhe", "pantoffeln damen"],
    "boys-slippers": ["hausschuhe jungen", "jungenhausschuhe", "kinderhausschuhe jungen"],
    "girls-slippers": ["hausschuhe maedchen", "hausschuhe madchen", "kinderhausschuhe madchen"],
    "mens-fashion-sneakers": ["herren sneaker", "sneaker herren"],
    "womens-fashion-sneakers": ["damen sneaker", "sneaker damen"],
    "boys-sneakers": ["jungen sneaker", "kinder sneaker"],
    "girls-sneakers": ["maedchen sneaker", "madchen sneaker"],
    "boys-boots": ["jungen stiefel", "kinder stiefel"],
    "girls-boots": ["maedchen stiefel", "madchen stiefel"],
    "boys-sports-recreation-socks": ["kindersocken", "sport socken kinder", "socken kinder"],
    "mens-sports-recreation-socks": ["herren socken", "sportsocken herren"],
    "womens-sports-recreation-socks": ["damen socken", "sportsocken damen"],
    "mens-cold-weather-scarves": ["herren schal", "winterschal herren"],
    "womens-cold-weather-scarves-wraps": ["damen schal", "winterschal damen"],
    "girls-fashion-scarves": ["maedchen schal", "madchen schal", "kinder schal"],
    "mens-skullies-beanies": ["herren muetze", "herren beanie"],
    "womens-skullies-beanies": ["damen muetze", "damen beanie"],
    "boys-novelty-beanies-knit-hats": ["jungen muetze", "kinder muetze"],
    "mens-t-shirts": ["herren t shirt", "herren tshirt"],
    "boys-t-shirts": ["jungen t shirt", "kinder t shirt"],
    "girls-tees": ["maedchen t shirt", "madchen t shirt"],
    "mens-dress-shirts": ["herren hemd", "businesshemd"],
    "boys-pants": ["jungen hose", "kinderhose jungen"],
    "girls-pants-capris": ["maedchen hose", "madchen hose"],
    "mens-jeans": ["herren jeans"],
    "womens-jeans": ["damen jeans"],
    "girls-skirts": ["maedchen rock", "madchen rock", "kinderrock"],
    "boys-cold-weather-gloves": ["jungen handschuhe", "kinder handschuhe"],
    "mens-cold-weather-gloves": ["herren handschuhe"],
    "womens-cold-weather-gloves": ["damen handschuhe"],
    # electronics accessories
    "computer-mice": [
        "computermaus",
        "usb maus",
        "funkmaus",
        "gaming maus",
        "kabellose maus",
        "drahtlose maus",
        "wireless maus",
        "pc maus",
    ],
    "computer-keyboards": [
        "tastatur",
        "keyboard",
        "gaming tastatur",
        "wireless tastatur",
        "wireless keyboard",
        "mechanical keyboard",
    ],
    "computer-keyboard-mouse-combos": ["desktop wireless", "tastatur maus set", "keyboard mouse"],
    "hdmi-cables": ["hdmi kabel"],
    "usb-cables": ["usb kabel", "usb c kabel", "ladekabel", "datenkabel", "type c kabel", "usb a auf usb c"],
    "cat-6-ethernet-cables": ["netzwerkkabel", "lan kabel", "ethernet kabel"],
    "led-strip-lights": ["led streifen", "led strip", "led band", "ledlichtband"],
    "led-bulbs": ["led birne", "gluehbirne", "leuchtmittel", "e27 led", "gu10 led"],
    "desk-lamps": ["schreibtischlampe", "leselampe"],
    "handheld-flashlights": ["taschenlampe", "led taschenlampe"],
    "external-hard-drives": ["externe festplatte", "external ssd"],
    "usb-flash-drives": ["usb stick", "usb speicherstick"],
    "micro-sd-memory-cards": ["microsd", "micro sd", "sd karte", "speicherkarte"],
    "earbud-in-ear-headphones": ["in ear", "ohrhoerer", "earbuds", "kopfhoerer in ear"],
    "over-ear-headphones": ["over ear", "kopfhoerer", "headset"],
    "portable-bluetooth-speakers": ["bluetooth lautsprecher", "bt lautsprecher", "bluetooth speaker"],
    "smartwatches": ["smartwatch", "fitness armband", "fitnesstracker"],
    "streaming-media-players": ["tv stick", "fire tv", "chromecast", "streaming stick", "mi tv stick"],
    "item-finders": ["airtag", "air tag", "tracker anhaenger", "schluesselfinder"],
    "baby-hearing-protection-earmuffs": ["gehoerschutz", "laermschutz kopfhoerer", "baby gehoerschutz"],
    "safety-earmuffs": ["gehoerschutzkapseln", "laermschutz"],
    "karaoke-players": ["karaoke"],
    "toy-building-sets": ["klemmbaustein", "klemmbausteine", "baustein set", "steine set"],
    "toy-interlocking-building-accessories": ["lego kompatibel", "bausteine"],
}

# If match is immediately followed by these, it is only a PREFIX of a longer product type → reject
CONTINUATION_SUFFIXES = (
    "halter",
    "halterung",
    "telefonhalter",
    "handyhalter",
    "huelle",
    "hulle",
    "cover",
    "tasche",
    "kabel",
    "stativ",
    "station",
    "ladegeraet",
    "set",
)

# Never assign category from these alone (features/parts inside a product title)
WEAK_EVIDENCE = {
    "reissverschluss",
    "reissverschlusse",
    "knopf",
    "knopfe",
    "kapuze",
    "tasche",
    "taschen",
    "deckel",
    "griff",
    "kabel",
    "batterie",
    "batterien",
    "adapter",
    "set",
    "design",
    "farbe",
    "groesse",
    "magnet",  # alone too weak — magnettelefonhalter handled by longer alias
    "auto",
    "tisch",  # Tischschutz ≠ Couchtisch
    "tische",
    "glas",
    "glaeser",
    "tasse",
    "tassen",
    "becher",
    "pfanne",
    "pfannen",
    "topf",
    "toepfe",
    "rucksack",  # often only in "für Tasche Rucksack" purpose clause
    "schule",
    "freizeit",
    "reisen",
    "zuhause",
    "astronomie",  # SEO fluff in descriptions
    "couchtisch",
    "couchtische",
}

# Audience markers in category labels / product text (for exact disambiguation only)
AUDIENCE_LEAF = {
    "babyjungen": "baby_boy",
    "babymadchen": "baby_girl",
    "babymädchen": "baby_girl",
    "baby boys": "baby_boy",
    "baby girls": "baby_girl",
    "jungen": "boy",
    "madchen": "girl",
    "mädchen": "girl",
    "boys": "boy",
    "girls": "girl",
    "herren": "men",
    "damen": "women",
    "mens": "men",
    "womens": "women",
    "women": "women",
    "men": "men",
    "kinder": "kids",
    "kids": "kids",
    "baby": "baby",
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
    # German umlauts → digraphs BEFORE NFKD (otherwise ü→u and aliases like gehoerschutz miss)
    for src, dst in (("ä", "ae"), ("ö", "oe"), ("ü", "ue")):
        s = s.replace(src, dst)
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


def load_db_url() -> str:
    if not ENV_PATH.exists():
        raise FileNotFoundError(f"Missing {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL not found in .env")


def compact_norm(s: str) -> str:
    """Lowercase alphanumeric only (no spaces) — for compound DE words like Huettenhausschuhe."""
    return re.sub(r"[^a-z0-9]", "", norm(s))


def stem_variants(label: str) -> list[str]:
    """Normalized phrase variants for exact evidence matching (no guessing)."""
    raw = (label or "").strip()
    if not raw:
        return []
    out: list[str] = []
    # drop audience suffix " für …"
    core = re.split(r"(?i)\s+für\s+", raw, maxsplit=1)[0].strip()
    core = re.split(r"(?i)\s+for\s+", core, maxsplit=1)[0].strip()
    candidates = [raw, core]
    # simple DE plural → singular-ish
    for c in list(candidates):
        n = norm(c)
        if n.endswith("en") and len(n) > 6:
            candidates.append(n[:-2])
        if n.endswith("e") and len(n) > 5:
            candidates.append(n[:-1])
        if n.endswith("er") and len(n) > 6:
            candidates.append(n[:-2])
    seen = set()
    for c in candidates:
        n = norm(c)
        if len(n) < 5 or n in seen:
            continue
        seen.add(n)
        out.append(n)
        # compact form for compounds
        cp = compact_norm(c)
        if len(cp) >= 6 and cp not in seen:
            seen.add(cp)
            out.append(cp)
    return out


def audience_of_text(text_norm: str) -> set[str]:
    found = set()
    blob = f" {text_norm} "
    # longer keys first
    for key in sorted(AUDIENCE_LEAF.keys(), key=len, reverse=True):
        kn = norm(key)
        if f" {kn} " in blob or kn in compact_norm(text_norm):
            found.add(AUDIENCE_LEAF[key])
    # Kinder / kids without gender
    if "kinder" in text_norm or "kinders" in text_norm:
        found.add("kids")
    return found


def audience_of_leaf(label: str, slug: str) -> set[str]:
    return audience_of_text(norm(f"{label} {slug.replace('-', ' ')}"))


def load_andertal_leaves_from_db() -> tuple[list[dict], dict[str, list[int]]]:
    """Load leaf categories from admin_hub_categories (name_de + path). Exact-match index only."""
    try:
        import psycopg2
    except ImportError:
        import subprocess

        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
        import psycopg2

    url = load_db_url()
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute(
        """
        WITH RECURSIVE tree AS (
          SELECT id, parent_id, name, slug,
                 COALESCE(NULLIF(TRIM(metadata #>> '{translations,de,name}'), ''), name) AS label_de,
                 ARRAY[COALESCE(NULLIF(TRIM(metadata #>> '{translations,de,name}'), ''), name)]::text[] AS path_labels,
                 0 AS depth
          FROM admin_hub_categories
          WHERE parent_id IS NULL AND COALESCE(active, true) = true
          UNION ALL
          SELECT c.id, c.parent_id, c.name, c.slug,
                 COALESCE(NULLIF(TRIM(c.metadata #>> '{translations,de,name}'), ''), c.name),
                 t.path_labels || COALESCE(NULLIF(TRIM(c.metadata #>> '{translations,de,name}'), ''), c.name),
                 t.depth + 1
          FROM admin_hub_categories c
          JOIN tree t ON c.parent_id = t.id
          WHERE COALESCE(c.active, true) = true
        )
        SELECT t.id::text, t.slug, t.label_de, t.path_labels, t.depth
        FROM tree t
        WHERE NOT EXISTS (
          SELECT 1 FROM admin_hub_categories ch
          WHERE ch.parent_id = t.id AND COALESCE(ch.active, true) = true
        )
        """
    )
    rows = cur.fetchall()
    conn.close()

    leaves: list[dict] = []
    word_inv: dict[str, list[int]] = defaultdict(list)
    compact_inv: dict[str, list[int]] = defaultdict(list)
    for cid, slug, label_de, path_labels, depth in rows:
        label = (label_de or "").strip()
        if not label or not cid:
            continue
        path_str = " > ".join([p for p in (path_labels or []) if p])
        variants = stem_variants(label)
        if not variants:
            continue
        idx = len(leaves)
        leaves.append(
            {
                "name": label,
                "id": cid,
                "slug": slug or "",
                "path": path_str,
                "depth": int(depth or 0),
                "variants": variants,
                "audience": audience_of_leaf(label, slug or ""),
                "best_len": max(len(v) for v in variants),
            }
        )
        # slug-based hard aliases (clear product nouns)
        for alias in ALIAS_BY_SLUG.get(slug or "", []):
            an = norm(alias)
            ac = compact_norm(alias)
            if an and an not in variants:
                variants.append(an)
            if ac and len(ac) >= 6 and ac not in variants:
                variants.append(ac)
        leaves[idx]["variants"] = variants
        leaves[idx]["best_len"] = max(len(v) for v in variants)

        for v in variants:
            if " " in v:
                for w in v.split():
                    if len(w) >= 5:
                        word_inv[w].append(idx)
            else:
                if len(v) >= 6:
                    compact_inv[v].append(idx)
                for w in v.split():
                    if len(w) >= 5:
                        word_inv[w].append(idx)

    by_slug = {leaf["slug"]: i for i, leaf in enumerate(leaves) if leaf.get("slug")}
    # Longest-first alias phrases for primary matching
    alias_phrases: list[tuple[str, str, int]] = []  # compact_or_norm, slug, len
    for slug, phrases in ALIAS_BY_SLUG.items():
        if slug not in by_slug:
            continue
        for ph in phrases:
            ac = compact_norm(ph)
            an = norm(ph)
            if len(ac) >= 5:
                alias_phrases.append((ac, slug, len(ac)))
            if " " in an and len(an) >= 5:
                alias_phrases.append((an, slug, len(an)))
    alias_phrases.sort(key=lambda x: -x[2])

    log(f"   DB leaf categories: {len(leaves):,} | compact keys {len(compact_inv):,} | aliases {len(alias_phrases):,}")
    return leaves, {
        "word": word_inv,
        "compact": compact_inv,
        "by_slug": by_slug,
        "alias_phrases": alias_phrases,
    }


def _continuation_blocks(haystack_c: str, start: int, matched_len: int) -> bool:
    """True if match is only a prefix of a longer product-type compound (Automagnet⊂Magnettelefonhalter)."""
    rest = haystack_c[start + matched_len :]
    if not rest:
        return False
    return any(rest.startswith(suf) for suf in CONTINUATION_SUFFIXES)


def _find_match_pos(hay_c: str, hay_n: str, variant: str) -> int:
    if " " in variant:
        return hay_n.find(variant)
    return hay_c.find(variant)


def _only_as_fuer_object(title_n: str, phrase: str) -> bool:
    """True if phrase appears only after für/fuer/for (purpose object), not as product type.

    Example: 'Untersetzer für Pfannen' must not classify as Bratpfanne.
    """
    ph = phrase if " " in phrase else norm(phrase)
    if not ph:
        return False
    # compact phrases → check spaced tokens that start with phrase
    positions: list[int] = []
    if " " in ph or " " in title_n:
        start = 0
        while True:
            pos = title_n.find(ph, start)
            if pos < 0:
                break
            positions.append(pos)
            start = pos + 1
        if not positions:
            # try token prefix (pfanne → pfannen)
            for tok in title_n.split():
                if tok == ph or (tok.startswith(ph) and len(tok) <= len(ph) + 2):
                    positions.append(title_n.find(tok))
    if not positions:
        return False
    for pos in positions:
        before = title_n[:pos]
        # product-type if phrase is near the start (first ~40 chars of norm title)
        if pos <= 40 and not re.search(r"\b(fuer|fur|for)\s+$", before):
            # still product if no fuer immediately before
            if not re.search(r"\b(fuer|fur|for)\s+\S*$", before[-30:] if len(before) > 30 else before):
                return False
        if re.search(r"\b(fuer|fur|for)\s+([a-z0-9]+\s+){0,6}$", before):
            continue  # this hit is fuer-object
        return False  # at least one hit is not fuer-object → keep
    return True  # all hits are fuer-objects


def _title_alias_hit(title_n: str, title_c: str, phrase: str) -> int:
    """Return start pos in title_n/title_c, or -1. Short aliases need token boundaries."""
    if " " in phrase:
        pos = title_n.find(phrase)
        return pos
    # compact phrase
    if len(phrase) < 8:
        # require token match in spaced title (avoid pfanne⊂pfannen via bare compact,
        # and avoid matching only as für-object — checked separately)
        for tok in title_n.split():
            if tok == phrase or (len(phrase) >= 5 and tok.startswith(phrase) and len(tok) <= len(phrase) + 2):
                return title_n.find(tok)
        # compound head: title_c starts with phrase or phrase after digit/separator boundary
        pos = title_c.find(phrase)
        if pos == 0:
            return pos
        return -1
    pos = title_c.find(phrase)
    if pos < 0:
        return -1
    if _continuation_blocks(title_c, pos, len(phrase)):
        return -1
    return pos


def match_category(product: dict, leaves: list[dict], inv: dict) -> dict:
    """Assign leaf from ARTICLE TITLE only (never description — SEO fluff caused Couchtisch etc.).

    1) Longest alias phrase in title
    2) DB category label evidence in title only
    Empty is better than wrong.
    """
    empty = {
        "Andertal_Kategorie_Name": "",
        "Andertal_Kategorie_Slug": "",
        "Andertal_Kategorie_ID": "",
        "Andertal_Kategorie_Pfad": "",
        "Andertal_Match_Methode": "",
        "Andertal_Kategorie_Sicherheit": "",
    }
    name = product.get("Artikelname") or ""
    title_n = norm(name)
    title_c = compact_norm(name)
    if len(title_n) < 3:
        return empty

    prod_aud = audience_of_text(title_n)
    by_slug: dict[str, int] = inv["by_slug"]
    alias_phrases: list[tuple[str, str, int]] = inv["alias_phrases"]

    def pack(leaf: dict, method: str, mlen: int, sicher: str) -> dict:
        return {
            "Andertal_Kategorie_Name": leaf["name"],
            "Andertal_Kategorie_Slug": leaf["slug"],
            "Andertal_Kategorie_ID": leaf["id"],
            "Andertal_Kategorie_Pfad": leaf["path"],
            "Andertal_Match_Methode": f"{method}:{mlen}",
            "Andertal_Kategorie_Sicherheit": sicher,
        }

    # --- Pass 1: longest alias in TITLE (high confidence) ---
    best_alias = None  # (len, -pos, slug, method)
    for phrase, slug, plen in alias_phrases:
        pos = _title_alias_hit(title_n, title_c, phrase)
        if pos < 0:
            continue
        if _only_as_fuer_object(title_n, phrase):
            continue
        use_slug = slug
        # Glass/cup coasters must not catch appliance/furniture pads
        if slug in ("tabletop-saucers", "bar-coasters") and any(
            x in title_c
            for x in (
                "waschmaschine",
                "vibration",
                "moebelunter",
                "waschmaschinen",
                "trockner",
                "kuehlschrank",
            )
        ):
            continue
        # Prefer trivets when Topf/Pfannen-Untersetzer
        if slug == "tabletop-saucers" and any(
            x in title_c
            for x in ("topfuntersetzer", "pfannenuntersetzer", "fuertoepfe", "fuerpfannen", "hitzeschutz", "toepfe")
        ):
            if by_slug.get("trivets") is not None:
                use_slug = "trivets"
        # Car cradle aliases without auto/vent context → desk/bed phone mounts
        if slug == "cell-phone-automobile-cradles" and not any(
            x in title_c
            for x in ("auto", "kfz", "lueftung", "luftung", "magnettelefon", "autotelefon", "lueftungsschlitz")
        ):
            if by_slug.get("cell-phone-bedstand-desk-mounts") is not None:
                use_slug = "cell-phone-bedstand-desk-mounts"
        if slug == "cell-phone-bedstand-desk-mounts" and any(
            x in title_c for x in ("auto", "kfz", "lueftung", "luftung", "magnettelefon", "autotelefon")
        ):
            if by_slug.get("cell-phone-automobile-cradles") is not None:
                use_slug = "cell-phone-automobile-cradles"
        key = (plen, -pos, use_slug)
        if best_alias is None or key[:2] > best_alias[:2]:
            best_alias = (plen, -pos, use_slug, "alias_title")

    if best_alias:
        plen, _, slug, method = best_alias
        idx = by_slug.get(slug)
        if idx is not None:
            sicher = "hoch" if plen >= 10 else "mittel"
            return pack(leaves[idx], method, plen, sicher)

    # --- Pass 2: DB label evidence in TITLE only (no description) ---
    word_inv = inv["word"]
    compact_inv = inv["compact"]
    cand: set[int] = set()
    for w in title_n.split():
        if len(w) >= 5 and w not in WEAK_EVIDENCE:
            cand.update(word_inv.get(w, ()))
    n = len(title_c)
    for i in range(n):
        for L in range(8, min(48, n - i + 1)):  # min 8 — avoid tisch⊂tischschutz noise
            hit = compact_inv.get(title_c[i : i + L])
            if hit:
                cand.update(hit)

    best = None
    best_key = None
    for idx in cand:
        leaf = leaves[idx]
        matched_via = None
        matched_len = 0
        matched_var = ""
        for v in sorted(leaf["variants"], key=len, reverse=True):
            if len(v) < 8 and " " not in v:
                continue  # too short stem (tisch, glas, …)
            if v in WEAK_EVIDENCE or norm(v) in WEAK_EVIDENCE or compact_norm(v) in WEAK_EVIDENCE:
                continue
            if " " in v:
                if v in title_n:
                    if _only_as_fuer_object(title_n, v):
                        continue
                    matched_via, matched_len, matched_var = "title_phrase", len(v), v
                    break
            else:
                if v in title_c:
                    pos = title_c.find(v)
                    if pos >= 0 and _continuation_blocks(title_c, pos, len(v)):
                        continue
                    if _only_as_fuer_object(title_n, v):
                        continue
                    matched_via, matched_len, matched_var = "title_compound", len(v), v
                    break
        if not matched_via:
            continue

        # Accessory/product-pad titles must not become the host appliance/furniture
        if any(
            m in title_c
            for m in (
                "untersetzer",
                "vibrationsdaempfer",
                "antivibration",
                "tischschutz",
            )
        ):
            allowed = {
                "tabletop-saucers",
                "trivets",
                "bar-coasters",
                "tea-bag-coasters",
                "sports-fan-coasters",
                "plant-saucers",
                "furniture-cups",
                "mechanical-vibration-damping-pads",
                "holiday-tree-trays-mats",
            }
            if leaf["slug"] not in allowed:
                continue

        # Category "X für Y" requires Y evidence in TITLE
        fuer = re.search(r"(?i)\s+für\s+(.+)$", leaf["name"])
        if fuer:
            obj_n = norm(fuer.group(1))
            obj_c = compact_norm(fuer.group(1))
            if obj_n not in title_n and (len(obj_c) < 5 or obj_c not in title_c):
                continue

        leaf_aud = leaf["audience"]
        gender_leaf = leaf_aud & {"baby_boy", "baby_girl", "boy", "girl", "men", "women"}
        gender_prod = prod_aud & {"baby_boy", "baby_girl", "boy", "girl", "men", "women", "kids", "baby"}
        aud_bonus = 0
        if gender_leaf:
            specific_prod = gender_prod & {"baby_boy", "baby_girl", "boy", "girl", "men", "women"}
            if not specific_prod:
                continue
            if not (gender_leaf & specific_prod):
                if "baby" in gender_prod and gender_leaf & {"baby_boy", "baby_girl"}:
                    aud_bonus = 1
                else:
                    continue
            else:
                aud_bonus = 2

        if matched_len < 8:
            continue

        pos = _find_match_pos(title_c, title_n, matched_var) if matched_var else 9999
        if pos < 0:
            pos = 9999
        # Prefer earlier title match (product head noun)
        key = (matched_len, -pos if pos != 9999 else -9999, leaf["depth"], aud_bonus)
        if best_key is None or key > best_key:
            best_key = key
            sicher = "hoch" if matched_len >= 12 and pos <= 20 else "mittel"
            best = (leaf, matched_via, matched_len, sicher)

    if best:
        leaf, method, mlen, sicher = best
        return pack(leaf, method, mlen, sicher)

    # --- Pass 3: soft fill from strong title nouns (niedrig) — only when still empty ---
    # Longest phrases first. Gendered categories require audience evidence.
    SOFT = [
        ("handyhuelle", "cell-phone-basic-cases", False),
        ("handyhulle", "cell-phone-basic-cases", False),
        ("smartphonehuelle", "cell-phone-basic-cases", False),
        ("smartphonehulle", "cell-phone-basic-cases", False),
        ("huellekompatibelmitiphone", "cell-phone-basic-cases", False),
        ("huellekompatibelmitsamsung", "cell-phone-basic-cases", False),
        ("huellekompatibelmitgalaxy", "cell-phone-basic-cases", False),
        ("huellekompatibelmitxiaomi", "cell-phone-basic-cases", False),
        ("ipadhuelle", "tablet-cases", False),
        ("tablethuelle", "tablet-cases", False),
        ("galaxytabhuelle", "tablet-cases", False),
        ("macbookhuelle", "laptop-sleeves", False),
        ("laptophuelle", "laptop-sleeves", False),
        ("nintendoswitchhuelle", "nintendo-switch-cases-storage", False),
        ("schutzfolie", "cell-phone-screen-protectors", False),
        ("panzerfolie", "cell-phone-screen-protectors", False),
        ("powerbank", "cell-phone-portable-power-banks", False),
        ("ladekabel", "usb-cables", False),
        ("usbc kabel", "usb-cables", False),
        ("usbkabel", "usb-cables", False),
        ("hdmi kabel", "hdmi-cables", False),
        ("hdmikabel", "hdmi-cables", False),
        ("ledstreifen", "led-strip-lights", False),
        ("ledband", "led-strip-lights", False),
        ("computermaus", "computer-mice", False),
        ("funkmaus", "computer-mice", False),
        ("gamingmaus", "computer-mice", False),
        ("tastatur", "computer-keyboards", False),
        ("keyboard", "computer-keyboards", False),
        ("kuscheldecke", "kids-throw-blankets", False),
        ("fleecedecke", "kids-throw-blankets", False),
        ("wohndecke", "kids-throw-blankets", False),
        ("sofadecke", "kids-throw-blankets", False),
        ("dekokissen", "throw-pillows", False),
        ("zierkissen", "throw-pillows", False),
        ("formkissen", "throw-pillows", False),
        ("schulrucksack", "casual-daypack-backpacks", False),
        ("korkuntersetzer", "tabletop-saucers", False),
        ("topfuntersetzer", "trivets", False),
        ("tischuntersetzer", "tabletop-saucers", False),
        ("umhaengetasche", "messenger-bags", False),
        ("schultertasche", "messenger-bags", False),
        ("bauchtasche", "fashion-waist-packs", False),
        ("notebooktasche", "laptop-sleeves", False),
        ("laptoptasche", "laptop-sleeves", False),
        ("regenschirm", "folding-umbrellas", False),
        ("bluetoothlautsprecher", "portable-bluetooth-speakers", False),
        ("smartwatch", "smartwatches", False),
        ("tvstick", "streaming-media-players", False),
        ("klemmbaustein", "toy-building-sets", False),
        ("auflaufform", "baking-dishes", False),
        ("backform", "baking-dishes", False),
        ("katzenklo", "standard-cat-litter-boxes", False),
        ("katzentoilette", "standard-cat-litter-boxes", False),
        ("katzenschaufel", "cat-litter-scoops", False),
        ("transportbox", "small-animal-carriers", False),
        ("gehoerschutz", "safety-earmuffs", False),
        ("laermschutz", "safety-earmuffs", False),
        ("airtag", "item-finders", False),
        ("portemonnaie", "womens-wallets", False),
        ("geldboerse", "womens-wallets", False),
        ("lunchbox", "lunch-boxes", False),
        ("brotdose", "lunch-boxes", False),
        ("wasserkocher", "electric-kettles", False),
        ("bratpfanne", "chefs-pans", False),
        ("schneidebrett", "cutting-boards", False),
        ("taschenlampe", "handheld-flashlights", False),
        ("schreibtischlampe", "desk-lamps", False),
        ("speicherkarte", "micro-sd-memory-cards", False),
        ("usbstick", "usb-flash-drives", False),
        ("kopfhoerer", "over-ear-headphones", False),
        ("gehoerschutz", "safety-earmuffs", False),
        ("laermschutz", "safety-earmuffs", False),
        ("passiersieb", "colanders", False),
        ("glasschuessel", "serving-bowls", False),
        ("espressotasse", "demitasse-cups", False),
        ("mokkatasse", "demitasse-cups", False),
        ("innenkamera", "dome-surveillance-cameras", False),
        ("ueberwachungskamera", "dome-surveillance-cameras", False),
        ("sprungball", "kickballs-playground-balls", False),
        ("kleiderschrank", "portable-closets", False),
        ("pyjama", "boys-pajama-sets", True),
        ("schlafanzug", "boys-pajama-sets", True),
        ("boxershorts", "boys-boxer-shorts", True),
        # gendered — only if audience known
        ("hausschuhe", "boys-slippers", True),
        ("pantoffeln", "boys-slippers", True),
        ("sneaker", "boys-sneakers", True),
        ("hoodie", "boys-fashion-hoodies-sweatshirts", True),
        ("kapuzenpullover", "boys-fashion-hoodies-sweatshirts", True),
        ("socken", "boys-sports-recreation-socks", True),
        ("jeans", "mens-jeans", True),
    ]
    SOFT.sort(key=lambda x: -len(x[0]))
    GENDER_SLUG = {
        "boy": {
            "slippers": "boys-slippers",
            "sneakers": "boys-sneakers",
            "hoodies": "boys-fashion-hoodies-sweatshirts",
            "socks": "boys-sports-recreation-socks",
            "jeans": "boys-jeans",
            "pajamas": "boys-pajama-sets",
            "boxers": "boys-boxer-shorts",
        },
        "girl": {
            "slippers": "girls-slippers",
            "sneakers": "girls-sneakers",
            "hoodies": "girls-fashion-hoodies-sweatshirts",
            "socks": "girls-sports-recreation-socks",
            "jeans": "girls-jeans",
            "pajamas": "girls-pajama-sets",
            "boxers": "boys-boxer-shorts",  # no girls boxers leaf commonly
        },
        "men": {
            "slippers": "mens-slippers",
            "sneakers": "mens-fashion-sneakers",
            "hoodies": "mens-fashion-hoodies-sweatshirts",
            "socks": "mens-sports-recreation-socks",
            "jeans": "mens-jeans",
            "pajamas": "mens-pajama-sets" if "mens-pajama-sets" in by_slug else "boys-pajama-sets",
            "boxers": "mens-boxer-shorts",
        },
        "women": {
            "slippers": "womens-slippers",
            "sneakers": "womens-fashion-sneakers",
            "hoodies": "womens-fashion-hoodies-sweatshirts",
            "socks": "womens-sports-recreation-socks",
            "jeans": "womens-jeans",
            "pajamas": "womens-pajama-sets" if "womens-pajama-sets" in by_slug else "girls-pajama-sets",
            "boxers": "mens-boxer-shorts",
        },
    }
    # kinder without explicit boy/girl still often pajama/boxers → niedrig boys*
    if "kinder" in title_n or "kind" in title_c:
        prod_aud = prod_aud | {"kids"}
    for phrase, slug, need_gender in SOFT:
        pos = title_c.find(phrase)
        if pos < 0:
            continue
        if _continuation_blocks(title_c, pos, len(phrase)):
            continue
        use_slug = slug
        if need_gender:
            specific = prod_aud & {"boy", "girl", "men", "women", "baby_boy", "baby_girl"}
            if not specific and (prod_aud & {"kids", "baby"}) and phrase in (
                "pyjama",
                "schlafanzug",
                "boxershorts",
                "hausschuhe",
                "pantoffeln",
                "socken",
                "sneaker",
                "hoodie",
                "kapuzenpullover",
            ):
                # kids without gender → boys-* with niedrig (marked uncertain)
                specific = {"boy"}
            if not specific:
                continue  # no wrong-gender guess
            aud = next(iter(specific))
            if aud.startswith("baby_"):
                aud = aud[5:]  # baby_boy → boy
            kind = (
                "slippers"
                if "slipper" in slug or "hausschuh" in phrase or "pantoffel" in phrase
                else "sneakers"
                if "sneaker" in slug or phrase == "sneaker"
                else "hoodies"
                if "hoodie" in slug or "kapuze" in phrase or phrase == "hoodie"
                else "socks"
                if "sock" in slug or phrase == "socken"
                else "jeans"
                if "jean" in slug or phrase == "jeans"
                else "pajamas"
                if phrase in ("pyjama", "schlafanzug") or "pajama" in slug
                else "boxers"
                if phrase == "boxershorts" or "boxer" in slug
                else None
            )
            if kind and aud in GENDER_SLUG and kind in GENDER_SLUG[aud]:
                use_slug = GENDER_SLUG[aud][kind]
            else:
                continue
        idx = by_slug.get(use_slug)
        if idx is not None:
            return pack(leaves[idx], "soft_title", len(phrase), "niedrig")

    return empty


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


def attr_get(attrs: dict[str, str], *keys: str) -> str:
    for k in keys:
        v = (attrs.get(k) or "").strip()
        if v:
            return v
    return ""


def extract_eu_responsible(desc_html: str) -> dict[str, str]:
    """Best-effort parse of EU responsible person from description text."""
    text = strip_html(desc_html)
    out = {"EU_Verantwortliche_Person": "", "EU_Verantwortliche_Adresse": "", "EU_Verantwortliche_Email": ""}
    if not text:
        return out
    # patterns: "Verantwortliche Person: Name" / "EU Responsible Person: ..."
    m = re.search(
        r"(?is)(?:verantwortliche\s*person|eu\s*responsible\s*person|responsible\s*person)\s*[:\-]\s*([^\n|;]{3,120})",
        text,
    )
    if m:
        out["EU_Verantwortliche_Person"] = m.group(1).strip(" .;")
    m = re.search(r"(?is)(?:e-?mail|email)\s*[:\-]\s*([\w.+-]+@[\w.-]+\.\w+)", text)
    if m:
        out["EU_Verantwortliche_Email"] = m.group(1).strip()
    m = re.search(
        r"(?is)(?:adresse|address|anschrift)\s*[:\-]\s*([^\n|]{5,160})",
        text,
    )
    if m and out["EU_Verantwortliche_Person"]:
        out["EU_Verantwortliche_Adresse"] = m.group(1).strip(" .;")
    return out


def gpsr_block(attrs: dict[str, str], product: dict) -> dict[str, str]:
    """GPSR manufacturer + EU responsible columns from attributes / product / description."""
    # Prefer gpsr_* then meta_manufacturer_*:gpsr
    name = attr_get(attrs, "gpsr_manufacturer_name", "meta_manufacturer_name:gpsr")
    street = attr_get(attrs, "gpsr_manufacturer_street", "meta_manufacturer_street:gpsr")
    house = attr_get(attrs, "gpsr_manufacturer_housenumber", "meta_manufacturer_housenumber:gpsr")
    plz = attr_get(attrs, "gpsr_manufacturer_postalcode", "meta_manufacturer_postalcode:gpsr")
    city = attr_get(attrs, "gpsr_manufacturer_city", "meta_manufacturer_city:gpsr")
    state = attr_get(attrs, "gpsr_manufacturer_state", "meta_manufacturer_state:gpsr")
    country = attr_get(attrs, "gpsr_manufacturer_country", "meta_manufacturer_country:gpsr")
    email = attr_get(attrs, "gpsr_manufacturer_email", "meta_manufacturer_email:gpsr")
    home = attr_get(attrs, "gpsr_manufacturer_homepage", "meta_manufacturer_homepage:gpsr")
    hersteller_jtl = (product.get("Hersteller") or "").strip()

    eu = extract_eu_responsible(product.get("Beschreibung") or "")
    # Also check dedicated attr keys if they ever appear
    if not eu["EU_Verantwortliche_Person"]:
        eu["EU_Verantwortliche_Person"] = attr_get(
            attrs,
            "gpsr_responsible_person_name",
            "verantwortliche_person_information",
            "responsible_person_eu",
        )

    addr_parts = [p for p in (street, house, plz, city, state, country) if p]
    return {
        "Hersteller_JTL": hersteller_jtl,
        "GPSR_Hersteller_Name": name or hersteller_jtl,
        "GPSR_Hersteller_Strasse": street,
        "GPSR_Hersteller_Hausnummer": house,
        "GPSR_Hersteller_PLZ": plz,
        "GPSR_Hersteller_Stadt": city,
        "GPSR_Hersteller_Bundesland": state,
        "GPSR_Hersteller_Land": country,
        "GPSR_Hersteller_Email": email,
        "GPSR_Hersteller_Homepage": home,
        "GPSR_Hersteller_Adresse_voll": ", ".join(addr_parts),
        **eu,
    }


# Fixed lead columns immediately after Artikelnummer (user-facing)
LEAD_COLUMNS = [
    "Artikelname",
    "GTIN",
    "Bestellmenge_seit_01_01_2025",
    "Andertal_Kategorie_Name",
    "Andertal_Kategorie_Slug",
    "Andertal_Kategorie_ID",
    "Andertal_Kategorie_Pfad",
    "Andertal_Match_Methode",
    "Andertal_Kategorie_Sicherheit",
    "Farbe",
    "Farbe_Quelle",
    "Größe",
    "Größe_Quelle",
    "Material",
    "Material_Quelle",
    "Maß",
    "Maß_Quelle",
    "Hersteller_JTL",
    "GPSR_Hersteller_Name",
    "GPSR_Hersteller_Strasse",
    "GPSR_Hersteller_Hausnummer",
    "GPSR_Hersteller_PLZ",
    "GPSR_Hersteller_Stadt",
    "GPSR_Hersteller_Bundesland",
    "GPSR_Hersteller_Land",
    "GPSR_Hersteller_Email",
    "GPSR_Hersteller_Homepage",
    "GPSR_Hersteller_Adresse_voll",
    "EU_Verantwortliche_Person",
    "EU_Verantwortliche_Adresse",
    "EU_Verantwortliche_Email",
    "WEE_Nummer",
    "WEE_Kategorie",
    "Alle_Attribute",
]


def main() -> int:
    best = BASE / "MC Bestellungen ab 01.01.2025.csv"
    prod = BASE / "MC Alle Produkte Detayli.csv"
    attr = BASE / "MC Alle Attribute.csv"
    for p in (best, prod, attr, ENV_PATH):
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

    log("4/5 Andertal leaf categories FROM DATABASE (exact name evidence only)...")
    leaves, cat_inv = load_andertal_leaves_from_db()

    log("5/5 Enrich rows + write xlsx...")
    # Remaining original product columns (after lead block)
    skip_in_tail = {
        "Artikelnummer",
        "Artikelname",
        "GTIN",
        "Hersteller",
        "Farbe",
        "Größe",
        "Material",
        "Material..",
        "Grundfarbe",
    }
    tail_fields = [c for c in prod_fields if c and c not in skip_in_tail]

    wide = []
    matched = 0
    inferred_any = 0
    gpsr_filled = 0
    for i, r in enumerate(products):
        sku = r["Artikelnummer"].strip()
        attrs = dict(attr_by_sku.get(sku, {}))
        cat = match_category(r, leaves, cat_inv)
        if cat["Andertal_Kategorie_ID"]:
            matched += 1
        inferred = infer_attrs(r, attrs)
        if any(inferred.get(k + "_Quelle") == "inferred" and inferred.get(k) for k in ("Farbe", "Größe", "Material")):
            inferred_any += 1
        for k in ("Farbe", "Größe", "Material"):
            if inferred.get(k) and not attrs.get(k):
                attrs[k] = inferred[k]
        if inferred.get("Maß"):
            attrs["Maß"] = inferred["Maß"]

        gpsr = gpsr_block(attrs, r)
        if gpsr["GPSR_Hersteller_Name"] or gpsr["GPSR_Hersteller_Email"]:
            gpsr_filled += 1

        out = {
            "Artikelnummer": sku,
            "Artikelname": r.get("Artikelname") or "",
            "GTIN": r.get("GTIN") or "",
            "Bestellmenge_seit_01_01_2025": int(order_counts.get(sku, 0)),
            "Andertal_Kategorie_Name": cat["Andertal_Kategorie_Name"],
            "Andertal_Kategorie_Slug": cat["Andertal_Kategorie_Slug"],
            "Andertal_Kategorie_ID": cat["Andertal_Kategorie_ID"],
            "Andertal_Kategorie_Pfad": cat["Andertal_Kategorie_Pfad"],
            "Andertal_Match_Methode": cat.get("Andertal_Match_Methode", ""),
            "Andertal_Kategorie_Sicherheit": cat.get("Andertal_Kategorie_Sicherheit", ""),
            "Farbe": inferred["Farbe"],
            "Farbe_Quelle": inferred["Farbe_Quelle"],
            "Größe": inferred["Größe"],
            "Größe_Quelle": inferred["Größe_Quelle"],
            "Material": inferred["Material"],
            "Material_Quelle": inferred["Material_Quelle"],
            "Maß": inferred["Maß"],
            "Maß_Quelle": inferred["Maß_Quelle"],
            **gpsr,
            "WEE_Nummer": attr_get(attrs, "WEE_Nummer"),
            "WEE_Kategorie": attr_get(attrs, "WEE_Kategorie"),
            "Alle_Attribute": format_all_attrs(attrs),
        }
        for k in tail_fields:
            out[k] = r.get(k, "")
        wide.append(out)
        if (i + 1) % 5000 == 0:
            log(f"   ... enriched {i + 1:,}/{len(products):,}")

    cols_u = ["Artikelnummer"] + LEAD_COLUMNS + [c for c in tail_fields if c not in LEAD_COLUMNS]
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
            {"Kenntnis": "Mit GPSR Hersteller Daten", "Wert": gpsr_filled},
            {"Kenntnis": "Attribute-Zeilen", "Wert": len(attr_long)},
            {"Kenntnis": "Kategoriequelle", "Wert": "admin_hub_categories (DB leaves, exact name evidence)"},
            {"Kenntnis": "Kategorie-Regel", "Wert": "Nur wenn Kategorie-Name in Artikelname/Beschreibung vorkommt; sonst leer (kein Fuzzy)"},
            {"Kenntnis": "Hinweis EU Verantwortliche", "Wert": "In IMT-Attributen kaum vorhanden; nur Beschreibung-Parse oder leer"},
            {"Kenntnis": "Encoding", "Wert": ENC},
        ]
    )

    if OUT.exists():
        try:
            OUT.unlink()
        except PermissionError:
            log("ERROR: Excel datei ist offen — bitte schliessen und erneut starten")
            return 1

    with pd.ExcelWriter(OUT, engine="openpyxl") as writer:
        df_meta.to_excel(writer, sheet_name="Info", index=False)
        df_prod.to_excel(writer, sheet_name="Produkte", index=False)
        if not df_attr.empty:
            df_attr.to_excel(writer, sheet_name="Attribute", index=False)

    log(f"DONE -> {OUT}")
    log(f"   size: {OUT.stat().st_size / (1024 * 1024):.1f} MB")
    log(f"   Produkte {len(df_prod):,} | Kat-Match {matched:,} | inferred {inferred_any:,} | GPSR {gpsr_filled:,}")
    if len(df_prod):
        r0 = df_prod.iloc[0]
        log(f"   COLS after AN: {list(df_prod.columns[1:12])}")
        log(f"   sample AN={r0['Artikelnummer']} qty={r0['Bestellmenge_seit_01_01_2025']}")
        log(f"   sample cat={r0['Andertal_Kategorie_Name']} | {r0['Andertal_Kategorie_Slug']} | {r0['Andertal_Kategorie_ID']}")
        log(f"   sample method={r0.get('Andertal_Match_Methode','')}")
        log(f"   sample GPSR={r0['GPSR_Hersteller_Name']} | {r0['GPSR_Hersteller_Land']}")
        log(f"   sample Farbe={r0['Farbe']} Groesse={r0['Größe']} Mat={r0['Material']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

