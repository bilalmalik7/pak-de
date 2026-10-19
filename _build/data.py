"""Load the curated university lists and render them as JSON + static HTML for the site."""
import hashlib
import html
import json
import os
import re
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))

KIND = {
    "U": "University", "T": "Technical University", "H": "University of Applied Sciences",
    "K": "Art, Music & Film", "P": "University of Education", "M": "Medical University",
    "B": "Private University / Business School", "R": "Theology", "D": "Dual / Distance",
}
DEFAULT_AREAS = {"U": "NHBL", "T": "ECNB", "H": "EBC", "K": "A", "P": "DH", "M": "M", "B": "B", "R": "H", "D": "BC"}
AREA = {
    "E": "Engineering", "C": "Computer Science & IT", "B": "Business & Economics", "N": "Natural Sciences",
    "M": "Medicine & Health", "L": "Law", "H": "Humanities & Social Sciences", "A": "Arts, Design & Music",
    "G": "Agriculture & Environment", "D": "Teaching & Education", "S": "Social Work",
}
PK_FOCUS = {
    "E": "Engineering", "C": "Computing & IT", "B": "Business", "M": "Medical & Health", "G": "Multi-discipline",
    "A": "Agriculture & Veterinary", "R": "Art & Design", "L": "Languages & Law", "T": "Textile", "S": "Sciences",
}
SECTOR = {"pub": "Public", "priv": "Private", "church": "Church-run"}
CREST_COLORS = ["#0065bd", "#00549f", "#c50e1f", "#00883a", "#9c1006", "#009682", "#00305d", "#005ca9",
                "#7a003f", "#00a19a", "#004e73", "#c4071b", "#0d4f8b", "#5b4bd6", "#e3000f", "#ab1d3d",
                "#0e9f6e", "#f2a900", "#1b2350", "#d9480f"]


def _rows(fname, ncols):
    out = []
    for line in open(os.path.join(HERE, "data", fname), encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.rstrip("\n").split("|")]
        if len(parts) != ncols:
            raise ValueError(f"{fname}: expected {ncols} columns: {line!r}")
        out.append(parts)
    return out


def slug(s):
    keep = "".join(ch.lower() if ch.isalnum() else "-" for ch in s)
    return "-".join(p for p in keep.split("-") if p)[:60]


def crest_color(name):
    return CREST_COLORS[int(hashlib.md5(name.encode()).hexdigest(), 16) % len(CREST_COLORS)]


def tuition(sector, state, short):
    """Indicative non-EU tuition rule (fees change: the page tells visitors to verify)."""
    if sector == "priv":
        return "Tuition fees apply", False
    if sector == "church":
        return "Check fees", False
    if short == "TUM":
        return "€2,000–6,000 / semester (non-EU)", False
    if state == "Baden-Württemberg":
        return "€1,500 / semester (non-EU)", False
    return "No tuition · semester fee only", True


def load_de():
    unis = []
    for name, short, city, state, kind, sector, domain, areas, progs, flags in _rows("de_universities.txt", 10):
        fee, free = tuition(sector, state, short)
        unis.append({
            "id": slug(name), "n": name, "s": short, "c": city, "st": state, "k": kind, "sec": sector,
            "d": domain, "a": list(areas or DEFAULT_AREAS[kind]), "p": [p for p in progs.split(";") if p],
            "f": flags.split(), "fee": fee, "free": free,
        })
    order = "TUHBMDKPR"
    unis.sort(key=lambda u: ("pk" not in u["f"], "tu9" not in u["f"], order.index(u["k"]), u["n"]))
    return unis


def load_pk():
    return [
        {"n": n, "s": s, "c": c, "pr": pr, "sec": sec, "d": d, "f": list(f)}
        for n, s, c, pr, sec, d, f in _rows("pk_universities.txt", 7)
    ]


DEGREES = {"MSc", "MA", "MEng", "MBA", "LLM", "MRes", "MPH", "MPP", "MIA", "BSc", "BA", "BEng", "BBA"}
LANGS = {"en", "de", "en/de"}
PROG_FLAGS = {"sel", "open", "fee", "ects210"}


def load_topics():
    with open(os.path.join(HERE, "data", "topics.json"), encoding="utf-8") as f:
        return json.load(f)


def tag_topics(name, topics):
    """Topic ids whose programme regex matches the name, earliest match first (the first one is the primary subject)."""
    hits = []
    for t in topics:
        m = re.search(t["p"], name, re.I)
        if m:
            hits.append((m.start(), -(m.end() - m.start()), t["id"]))
    return [tid for _, _, tid in sorted(hits)]


def load_programmes(de, topics):
    """Parse programmes.txt: '@ <university>' header lines, then 'degree | name | language | flags' rows."""
    by_key = {}
    for u in de:
        for key in (u["s"], u["n"], u["id"]):
            by_key.setdefault(key, []).append(u)
    progs, uni, seen = [], None, set()
    for line in open(os.path.join(HERE, "data", "programmes.txt"), encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            key = line[1:].strip()
            found = by_key.get(key, [])
            if len(found) != 1:
                raise ValueError(f"programmes.txt: university {key!r} is {'ambiguous' if found else 'unknown'}; use its full name")
            uni = found[0]
            continue
        parts = [p.strip() for p in line.split("|")]
        if uni is None or len(parts) != 4:
            raise ValueError(f"programmes.txt: bad line {line!r}")
        degree, name, lang, flags = parts
        flags = flags.split()
        if degree not in DEGREES or lang not in LANGS or not set(flags) <= PROG_FLAGS:
            raise ValueError(f"programmes.txt: bad degree, language or flag in {line!r}")
        pid = uni["id"] + "--" + slug(f"{name} {degree}")
        if pid in seen:
            raise ValueError(f"programmes.txt: duplicate {line!r}")
        seen.add(pid)
        progs.append({
            "id": pid, "u": uni["id"], "n": name, "dg": degree, "lv": "b" if degree.startswith("B") else "m",
            "l": lang, "t": tag_topics(name, topics), "f": flags,
        })
    return progs


def write_json(out_dir):
    os.makedirs(os.path.join(out_dir, "assets", "data"), exist_ok=True)
    de, pk = load_de(), load_pk()
    topics = load_topics()
    progs = load_programmes(de, topics["topics"])
    counts = {}
    for p in progs:
        counts[p["u"]] = counts.get(p["u"], 0) + 1
    for u in de:
        u["np"] = counts.get(u["id"], 0)
    for fname, data in (("universities-de.json", de), ("universities-pk.json", pk), ("programmes.json", progs), ("topics.json", topics)):
        with open(os.path.join(out_dir, "assets", "data", fname), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return de, pk, progs, topics


def e(s):
    return html.escape(s, quote=True)


def daad_url(u):
    return "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/result/?q=" + urllib.parse.quote(u["n"])


def de_card(u):
    tags = [f'<span class="tag">{e(KIND[u["k"]])}</span>']
    tags.append(f'<span class="tag {"green" if u["free"] else "gold" if u["sec"] == "pub" else "red"}">{e(u["fee"])}</span>')
    if "tu9" in u["f"]:
        tags.append('<span class="tag">TU9</span>')
    if "pk" in u["f"]:
        tags.append('<span class="tag">🇵🇰 Popular</span>')
    if "partner" in u["f"]:
        tags.append('<span class="tag red">Partner-university degrees</span>')
    areas = ", ".join(AREA[a] for a in u["a"])
    progs = ""
    if u["p"]:
        progs = '<ul class="prog-list">' + "".join(f"<li>{e(p)}</li>" for p in u["p"]) + "</ul>"
    links = []
    if u["d"]:
        links.append(f'<a href="https://{e(u["d"])}" target="_blank" rel="noopener nofollow">Website ↗</a>')
    if u.get("np"):
        links.append(f'<a href="programme-finder.html?uni={u["id"]}">{u["np"]} programmes: check my chances →</a>')
    links.append(f'<a href="{e(daad_url(u))}" target="_blank" rel="noopener nofollow">English programmes (DAAD) ↗</a>')
    return (
        f'<article class="card uni-card" id="{u["id"]}" data-state="{e(u["st"])}" data-kind="{u["k"]}" '
        f'data-sector="{u["sec"]}" data-free="{int(u["free"])}" data-areas="{"".join(u["a"])}" '
        f'data-flags="{" ".join(u["f"])}">'
        f'<div class="uni-top"><span class="uni-crest" style="background:{crest_color(u["n"])}">{e(u["s"][:5])}</span>'
        f'<div><h3>{e(u["n"])}</h3><span class="city">📍 {e(u["c"])} · {e(u["st"])}</span></div></div>'
        f'<div class="uni-tags">{"".join(tags)}</div>'
        f'<p class="uni-areas"><b>Subjects:</b> {e(areas)}</p>{progs}'
        f'<div class="uni-links">{" ".join(links)}</div></article>'
    )


def pk_card(u):
    focus = ", ".join(PK_FOCUS[f] for f in u["f"])
    site = f'<a href="https://{e(u["d"])}" target="_blank" rel="noopener nofollow">Website ↗</a>' if u["d"] else ""
    return (
        f'<article class="pk-row" data-province="{e(u["pr"])}" data-sector="{u["sec"]}" data-focus="{"".join(u["f"])}">'
        f'<span class="uni-crest" style="background:{crest_color(u["n"])}">{e(u["s"][:6])}</span>'
        f'<div class="pk-main"><h3>{e(u["n"])}</h3><span class="city">📍 {e(u["c"]) if u["c"] == u["pr"] else e(u["c"]) + " · " + e(u["pr"])} · {SECTOR[u["sec"]]}</span></div>'
        f'<div class="pk-focus">{e(focus)}</div><div class="pk-link">{site}</div></article>'
    )


def options(values):
    return "".join(f'<option value="{e(v)}">{e(v)}</option>' for v in values)


def programme_index(de, progs, topics):
    """Crawlable index of every programme, grouped by primary subject (the finder renders the interactive results)."""
    unis = {u["id"]: u for u in de}
    groups = []
    for t in topics["topics"]:
        rows = sorted((p for p in progs if p["t"] and p["t"][0] == t["id"]), key=lambda p: (p["lv"] != "m", p["n"], unis[p["u"]]["n"]))
        if not rows:
            continue
        items = "".join(
            f'<li><a href="programme-finder.html?p={p["id"]}">{e(p["dg"])} {e(p["n"])}</a> · {e(unis[p["u"]]["n"])}, {e(unis[p["u"]]["c"])}'
            f'{" · German-taught" if p["l"] == "de" else ""}</li>' for p in rows
        )
        groups.append(f'<details class="prog-index-group"><summary>{e(t["label"])} <span>{len(rows)}</span></summary><ul>{items}</ul></details>')
    return "\n".join(groups)


def placeholders(de, pk, progs, topics):
    states = sorted({u["st"] for u in de})
    provinces = ["Islamabad", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Azad Jammu & Kashmir", "Gilgit-Baltistan"]
    de_schema = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "Universities in Germany for Pakistani students",
        "numberOfItems": len(de),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "item": {
                "@type": "CollegeOrUniversity", "name": u["n"],
                **({"url": "https://" + u["d"]} if u["d"] else {}),
                "address": {"@type": "PostalAddress", "addressLocality": u["c"].split(" (")[0], "addressRegion": u["st"], "addressCountry": "DE"}}}
            for i, u in enumerate(de)
        ],
    }
    pk_schema = {
        "@context": "https://schema.org", "@type": "ItemList", "name": "Universities in Pakistan (HEC-recognised)",
        "numberOfItems": len(pk),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "item": {
                "@type": "CollegeOrUniversity", "name": u["n"],
                **({"url": "https://" + u["d"]} if u["d"] else {}),
                "address": {"@type": "PostalAddress", "addressLocality": u["c"], "addressRegion": u["pr"], "addressCountry": "PK"}}}
            for i, u in enumerate(pk)
        ],
    }
    return {
        "{{DE_COUNT}}": str(len(de)),
        "{{DE_FREE_COUNT}}": str(sum(u["free"] for u in de)),
        "{{DE_UAS_COUNT}}": str(sum(u["k"] == "H" for u in de)),
        "{{DE_CARDS}}": "\n".join(de_card(u) for u in de),
        "{{DE_STATE_OPTIONS}}": options(states),
        "{{DE_KIND_OPTIONS}}": "".join(f'<option value="{k}">{e(v)}</option>' for k, v in KIND.items()),
        "{{DE_AREA_OPTIONS}}": "".join(f'<option value="{k}">{e(v)}</option>' for k, v in AREA.items()),
        "{{DE_SCHEMA}}": json.dumps(de_schema, ensure_ascii=False, separators=(",", ":")),
        "{{PK_COUNT}}": str(len(pk)),
        "{{PK_CARDS}}": "\n".join(pk_card(u) for u in pk),
        "{{PK_PROVINCE_OPTIONS}}": options(provinces),
        "{{PK_FOCUS_OPTIONS}}": "".join(f'<option value="{k}">{e(v)}</option>' for k, v in PK_FOCUS.items()),
        "{{PK_DATALIST}}": "".join(f'<option value="{e(u["n"])}">' for u in pk),
        "{{PK_SCHEMA}}": json.dumps(pk_schema, ensure_ascii=False, separators=(",", ":")),
        "{{PROG_COUNT}}": f"{len(progs):,}",
        "{{TOPIC_COUNT}}": str(len(topics["topics"])),
        "{{PROG_EN_COUNT}}": f'{sum(p["l"] != "de" for p in progs):,}',
        "{{PROG_UNI_COUNT}}": str(len({p["u"] for p in progs})),
        "{{PROG_INDEX}}": programme_index(de, progs, topics),
        "{{TOPIC_OPTIONS}}": "".join(f'<option value="{t["id"]}">{e(t["label"])}</option>' for t in sorted(topics["topics"], key=lambda t: t["label"])),
    }
