#!/usr/bin/env python3
"""Assemble the DeutschDreams static pages from body fragments + shared layout."""
import json, os, re, glob, html
import data

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
BASE = "https://www.deutschdreams.pk"
BRAND = "DeutschDreams"
PHONE = "+49 155 67783533"
EMAIL = "hello@deutschdreams.pk"

ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
WA_ICON = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 6.9L3.2 29l6.5-1.7c1.9 1 4.1 1.6 6.3 1.6 7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2 0-3.9-.5-5.6-1.5l-.4-.2-3.9 1 1-3.7-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.8C5.1 9.9 10 5.2 16 5.2s10.9 4.7 10.9 10.6S22 26.4 16 26.4z"/><path d="M22 18.6c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.2 1.4 3.4c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>'

NAV = [
    ("journey.html", "Journey"),
    ("packages.html", "Packages"),
    ("universities.html", "Universities"),
    ("programme-finder.html", "Programmes"),
    ("profile-analyzer.html", "AI Analyzer"),
    ("reviews.html", "Reviews"),
    ("guides.html", "Guides"),
    ("contact.html", "Contact"),
]

SOCIAL = {
    "Instagram": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    "Facebook": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3c-2.8 0-4 1.8-4 4.4V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/></svg>',
    "TikTok": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c.4 2.3 1.9 3.9 4.2 4.1v3.3c-1.6 0-3-.5-4.2-1.3v6.4c0 3.6-2.8 6-6 6s-6-2.5-6-5.9c0-3.6 3.1-6.3 6.9-5.8v3.4c-1.8-.4-3.5.8-3.5 2.4 0 1.4 1.1 2.5 2.6 2.5 1.6 0 2.7-1.1 2.7-3V3h3.3z"/></svg>',
    "YouTube": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2c-.2-1.6-1-2.7-2.6-2.9C16.9 5 12 5 12 5s-4.9 0-7.4.3C3 5.5 2.2 6.6 2 8.2 1.8 9.6 1.8 12 1.8 12s0 2.4.2 3.8c.2 1.6 1 2.7 2.6 2.9 2.5.3 7.4.3 7.4.3s4.9 0 7.4-.3c1.6-.2 2.4-1.3 2.6-2.9.2-1.4.2-3.8.2-3.8s0-2.4-.2-3.8zM10 15V9l5.2 3L10 15z"/></svg>',
    "LinkedIn": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3.5a2 2 0 110 4 2 2 0 010-4zM3 9h3v12H3zM9 9h2.9v1.7c.4-.8 1.5-1.9 3.4-1.9 3.4 0 4.2 2.2 4.2 5.2V21h-3v-6.2c0-1.5 0-3.3-2-3.3s-2.4 1.6-2.4 3.2V21H9z"/></svg>',
}

ORG_SCHEMA = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "ProfessionalService",
            "@id": BASE + "/#organization",
            "name": BRAND,
            "alternateName": ["Deutsch Dreams", "DeutschDreams Study in Germany Consultants"],
            "description": "Study in Germany consultants for Pakistani students — free profile assessment, university admissions, uni-assist, SOP, blocked account, health insurance and German student visa guidance from Lahore, Islamabad and Karachi.",
            "url": BASE + "/",
            "logo": BASE + "/assets/img/logo.svg",
            "image": BASE + "/assets/img/og-image.png",
            "email": EMAIL,
            "telephone": PHONE,
            "priceRange": "€200–€800",
            "address": {"@type": "PostalAddress", "addressLocality": "Lahore", "addressRegion": "Punjab", "addressCountry": "PK"},
            "areaServed": [{"@type": "Country", "name": "Pakistan"}] + [
                {"@type": "City", "name": c} for c in ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Sialkot", "Gujranwala", "Quetta", "Hyderabad", "Bahawalpur"]
            ],
            "knowsAbout": ["Study in Germany", "German student visa", "uni-assist", "Blocked account (Sperrkonto)", "Studienkolleg", "Ausbildung in Germany", "Opportunity Card (Chancenkarte)", "HEC degree attestation", "IELTS for Germany"],
            "knowsLanguage": ["en", "ur", "de"],
        },
        {
            "@type": "WebSite",
            "@id": BASE + "/#website",
            "url": BASE + "/",
            "name": BRAND,
            "inLanguage": "en-PK",
            "publisher": {"@id": BASE + "/#organization"},
        },
    ],
}


def header(active):
    cur = ' aria-current="page"'
    links = "\n".join(
        f'        <a href="{href}"{cur if href == active else ""}>{label}</a>' for href, label in NAV
    )
    return f'''<a class="skip-link" href="#main">Skip to content</a>
  <div class="curtain" aria-hidden="true"><img src="assets/img/logo.svg" alt="" width="76" height="76"><div class="curtain-bar"></div></div>
  <div class="scroll-progress" aria-hidden="true"></div>
  <div class="cursor-glow" aria-hidden="true"></div>

  <header class="site-header">
    <div class="container">
      <a class="brand" href="index.html" aria-label="{BRAND} — home">
        <img src="assets/img/logo.svg" alt="" width="40" height="40">
        <span>Deutsch<em>Dreams</em><small>Pakistan → Germany</small></span>
      </a>
      <button class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span><span></span><span></span></button>
      <nav class="nav" id="site-nav" aria-label="Main">
{links}
        <a class="btn btn-primary btn-sm magnetic" href="profile-analyzer.html">Free Assessment {ARROW}</a>
      </nav>
    </div>
  </header>'''


def footer():
    socials = "".join(f'<a href="#" aria-label="{n}" title="{n} (add your link)">{svg}</a>' for n, svg in SOCIAL.items())
    seo = [
        ("study-in-germany-from-pakistan.html", "Study in Germany from Pakistan"),
        ("study-in-germany-from-pakistan.html#visa", "Germany student visa Pakistan"),
        ("study-in-germany-from-pakistan.html#free", "Free education in Germany for Pakistani students"),
        ("low-gpa-germany.html", "Study in Germany with low CGPA"),
        ("guides.html#without-ielts", "Study in Germany without IELTS"),
        ("study-in-germany-from-pakistan.html#lahore", "Germany education consultants in Lahore"),
        ("study-in-germany-from-pakistan.html#islamabad", "Study abroad consultants Islamabad"),
        ("study-in-germany-from-pakistan.html#karachi", "Germany consultants Karachi"),
        ("study-in-germany-from-pakistan.html#cities", "Faisalabad · Multan · Peshawar · Sialkot"),
        ("guides.html#blocked-account", "Blocked account for Germany from Pakistan"),
        ("journey.html", "Masters in Germany for Pakistani students"),
        ("journey.html#bachelor", "Bachelor in Germany after FSc / A-Levels"),
        ("guides.html#studienkolleg", "Studienkolleg for Pakistani students"),
        ("guides.html#ausbildung", "Ausbildung in Germany for Pakistanis"),
        ("universities.html", "Tuition-free universities in Germany"),
        ("guides.html#chancenkarte", "Germany Opportunity Card (Chancenkarte)"),
        ("packages.html", "Study in Germany consultancy fees"),
        ("profile-analyzer.html", "Check eligibility for Germany"),
        ("profile-analyzer.html", "AI university matcher for Germany"),
        ("programme-finder.html", "Masters programmes in Germany in English"),
        ("programme-finder.html#transcript", "Check eligibility from transcript"),
        ("universities.html", "List of universities in Germany"),
        ("pakistani-universities.html", "HEC recognised universities list"),
        ("pakistani-universities.html#ready-title", "Pakistani degree recognition in Germany"),
    ]
    seo_links = "".join(f'<a href="{h}">{t}</a>' for h, t in seo)
    return f'''<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html"><img src="assets/img/logo.svg" alt="" width="40" height="40"><span>Deutsch<em>Dreams</em><small>Pakistan → Germany</small></span></a>
          <p>Study in Germany consultants for Pakistani students. From your first question to your first lecture in Germany, we walk every step with you, honestly and transparently.</p>
          <p class="urdu" lang="ur">جرمنی میں تعلیم کا خواب — ہم آپ کے ساتھ ہر قدم پر</p>
          <div class="socials">{socials}</div>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>
            <li><a href="journey.html">Your Journey</a></li>
            <li><a href="packages.html">Packages &amp; Fees</a></li>
            <li><a href="universities.html">Universities in Germany</a></li>
            <li><a href="programme-finder.html">AI Programme Finder</a></li>
            <li><a href="pakistani-universities.html">Pakistani Universities</a></li>
            <li><a href="profile-analyzer.html">AI Profile Analyzer</a></li>
            <li><a href="reviews.html">Student Stories</a></li>
          </ul>
        </div>
        <div>
          <h4>Free Guides</h4>
          <ul>
            <li><a href="study-in-germany-from-pakistan.html">Study in Germany from Pakistan</a></li>
            <li><a href="low-gpa-germany.html">Low CGPA? Read this</a></li>
            <li><a href="guides.html#blocked-account">Blocked Account Guide</a></li>
            <li><a href="guides.html#visa-checklist">Visa Checklist 2026–27</a></li>
            <li><a href="guides.html">Booklets &amp; Checklists</a></li>
          </ul>
        </div>
        <div>
          <h4>Talk to us</h4>
          <ul>
            <li><a data-wa href="https://wa.me/4915567783533">WhatsApp: {PHONE}</a></li>
            <li><a data-email href="mailto:{EMAIL}">{EMAIL}</a></li>
            <li>Lahore · Islamabad · Karachi</li>
            <li>Mon–Sat · 10:00–19:00 PKT</li>
          </ul>
        </div>
      </div>
      <div class="seo-cloud">
        <h4>Popular searches</h4>
        <p>{seo_links}</p>
      </div>
      <div class="footer-bottom">
        <span>© <span data-year>2026</span> {BRAND}. All rights reserved.</span>
        <span>Independent education consultancy. Not affiliated with the German government, DAAD or uni-assist.</span>
      </div>
      <div class="footer-giant" aria-hidden="true">DeutschDreams</div>
    </div>
  </footer>

  <a class="wa-float" data-wa href="https://wa.me/4915567783533" aria-label="Chat with a counsellor on WhatsApp">{WA_ICON}<span class="wa-tip">Chat with a counsellor 👋</span></a>'''


def breadcrumb_schema(path, name):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": BASE + "/" + path},
        ],
    }


def faq_schema(body):
    """Build FAQPage JSON-LD from <details class="faq-item"> blocks so markup and schema never drift."""
    items = re.findall(r'<details[^>]*>\s*<summary>(.*?)</summary>\s*<div class="faq-body">(.*?)</div>\s*</details>', body, re.S)
    if not items:
        return None
    def clean(s):
        return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}} for q, a in items
        ],
    }


def build(src, ph):
    raw = open(src, encoding="utf-8").read()
    for k, v in ph.items():
        raw = raw.replace(k, v)
    m = re.match(r"<!--meta\s*(\{.*?\})\s*-->\s*", raw, re.S)
    meta = json.loads(m.group(1))
    body = raw[m.end():]
    path = meta["path"]
    url = BASE + "/" + ("" if path == "index.html" else path)
    for k, v in {"{ARROW}": ARROW, "{WA_ICON}": WA_ICON, "{BASE}": BASE, "{PHONE_PLACEHOLDER}": PHONE}.items():
        body = body.replace(k, v)

    schemas = [ORG_SCHEMA] if path == "index.html" else [{"@context": "https://schema.org", **ORG_SCHEMA["@graph"][0]}]
    if path not in ("index.html", "404.html"):
        schemas.append(breadcrumb_schema(path, meta.get("crumb", meta["title"])))
    fq = faq_schema(body)
    if fq:
        schemas.append(fq)
    schemas += meta.get("schema", [])
    ld = "\n".join(
        f'  <script type="application/ld+json">{json.dumps(s, ensure_ascii=False, separators=(",", ":"))}</script>' for s in schemas
    )
    robots = "noindex, follow" if path == "404.html" else "index, follow, max-image-preview:large, max-snippet:-1"
    scripts = '  <script src="assets/js/main.js" defer></script>' + "".join(
        f'\n  <script src="{s}" defer></script>' for s in meta.get("scripts", [])
    )
    base_tag = ('\n  <base href="' + meta["base"] + '">') if meta.get("base") else ""
    title = html.escape(meta["title"], quote=True)
    desc = html.escape(meta["description"], quote=True)
    keywords = html.escape(meta.get("keywords", ""), quote=True)

    page = f'''<!doctype html>
<html lang="en-PK" class="no-js">
<head>
  <meta charset="utf-8">{base_tag}
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="keywords" content="{keywords}">
  <meta name="robots" content="{robots}">
  <link rel="canonical" href="{url}">
  <link rel="alternate" hreflang="en-PK" href="{url}">
  <link rel="alternate" hreflang="x-default" href="{url}">
  <meta name="geo.region" content="PK">
  <meta name="geo.placename" content="Lahore; Islamabad; Karachi">
  <meta name="theme-color" content="#0E1430">
  <meta name="author" content="{BRAND}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{BRAND}">
  <meta property="og:locale" content="en_PK">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{BASE}/assets/img/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{BASE}/assets/img/og-image.png">

  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
  <link rel="manifest" href="site.webmanifest">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@500&display=swap">
  <link rel="stylesheet" href="assets/css/style.css">
{ld}
  <script>window.va = window.va || function () {{ (window.vaq = window.vaq || []).push(arguments); }};</script>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  {header(path)}

  <main id="main">
{body.rstrip()}
  </main>

  {footer()}

{scripts}
</body>
</html>
'''
    with open(os.path.join(OUT, path), "w", encoding="utf-8") as f:
        f.write(page)
    return path, meta


if __name__ == "__main__":
    de, pk, progs, topics = data.write_json(OUT)
    ph = data.placeholders(de, pk, progs, topics)
    built = [build(p, ph) for p in sorted(glob.glob(os.path.join(HERE, "pages", "*.html")))]
    print(f"data: {len(de)} German, {len(pk)} Pakistani universities, {len(progs)} programmes")
    # sitemap
    prio = {"index.html": "1.0", "study-in-germany-from-pakistan.html": "0.9", "profile-analyzer.html": "0.9", "programme-finder.html": "0.9", "packages.html": "0.9", "low-gpa-germany.html": "0.9", "universities.html": "0.9", "pakistani-universities.html": "0.9"}
    urls = []
    for path, meta in built:
        if path == "404.html":
            continue
        loc = BASE + "/" + ("" if path == "index.html" else path)
        urls.append(f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>2026-10-05</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>{prio.get(path, '0.8')}</priority>\n  </url>")
    open(os.path.join(OUT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n")
    print("built:", ", ".join(p for p, _ in built))
