from pathlib import Path

root = Path(__file__).resolve().parent

p = root / "packages/shop-theme/src/defaults.js"
text = p.read_text(encoding="utf-8")
dup = (
    "    /** Desktop \u22651024px: when true, second nav keeps its own bg at page top (no merge with header gradient) */\n"
    "    own_color_at_top_desktop: false,\n"
    "    /** Desktop \u22651024px: when true, second nav keeps its own bg at page top (no merge with header gradient) */\n"
    "    own_color_at_top_desktop: false,"
)
fix = (
    "    /** Desktop \u22651024px: when true, second nav keeps its own bg at page top (no merge with header gradient) */\n"
    "    own_color_at_top_desktop: false,"
)
if dup in text:
    p.write_text(text.replace(dup, fix, 1), encoding="utf-8")
    print("defaults.js: duplicate removed")
else:
    print("defaults.js: duplicate pattern not found")

p2 = root / "apps/sellercentral/src/lib/styles-page-i18n.js"
text2 = p2.read_text(encoding="utf-8")
marker = '    secondNavAtTopDesktop: t("Second nav at page top'
first = text2.find(marker)
second = text2.find(marker, first + 1)
if second != -1:
    end_marker = '    hideSecondNavOnScroll: t("Hide second nav on scroll"'
    end = text2.find(end_marker, second)
    if end != -1:
        p2.write_text(text2[:second] + text2[end:], encoding="utf-8")
        print("styles-page-i18n.js: duplicate block removed")
    else:
        print("i18n: end marker not found")
else:
    print("i18n: no duplicate found")
