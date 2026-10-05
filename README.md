# DeutschDreams: Study in Germany from Pakistan

A fast, animated, SEO-focused website for a study-in-Germany consultancy serving Pakistani students:
plain HTML, CSS and JavaScript, with an **optional AI Profile Analyzer** powered by Claude.

The site works on any static host (GitHub Pages, Netlify, Vercel). The AI report needs a host that runs
serverless functions (Vercel or Netlify) plus an Anthropic API key. Without them, the analyzer falls back
to its built-in engine automatically.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Home: hero with the counsellor illustration and an animated flight path from Pakistan to Germany, university marquee, "Why Germany" counters, journey preview, services, "Your GPA doesn't define you", packages, AI analyzer teaser, stories, booklets, an Urdu section and FAQ |
| `universities.html` | **Explorer of 321 German universities**: search plus filters by state, type, subject, sector, no tuition, popular with Pakistanis, TU9 and medical faculty. Tuition rules, programme examples, and website + DAAD links on every card |
| `pakistani-universities.html` | **193 Pakistani universities** by province, field and sector, plus a guide to getting a Pakistani degree accepted in Germany (16-year rule, HEC, anabin, uni-assist) |
| `profile-analyzer.html` | **AI Profile Analyzer**: a 4-step form, then an animated analysis that converts the CGPA (Modified Bavarian Formula), scores the profile, matches against the German university database and produces a full report: strengths, risks, best-fit universities with match %, a dated strategy, SOP angle, routes, and a note for parents in Urdu. Shareable to WhatsApp and printable as a PDF |
| `journey.html` | The 10-step journey on a scroll-driven timeline, intakes, and Master's / Bachelor's / Ausbildung tracks |
| `packages.html` | 4 packages with a Master's / Bachelor's / Ausbildung price toggle (PKR), a comparison table, add-ons and payment FAQ |
| `reviews.html` | Story cards and testimonials (sample content, see below) |
| `guides.html` | 3D flip-through booklet (printable) and long-form guides: visa checklist, blocked account, without IELTS, Studienkolleg, Ausbildung, Opportunity Card |
| `study-in-germany-from-pakistan.html` | Main SEO page for the core keyword, with city sections |
| `low-gpa-germany.html` | SEO page for "study in Germany with low CGPA" |
| `contact.html` | Contact options and a lead form that opens WhatsApp with the details filled in |

## How the AI Profile Analyzer works

1. **On-device engine (always on).** `assets/js/analyzer.js` converts the grade, applies the eligibility rules for Pakistani qualifications, scores academics, language, finances and timeline, and ranks every university in `assets/data/universities-de.json` by subject fit, grade competitiveness, fees versus budget, and Pakistani-community routes.
2. **AI counsellor report.** The page sends an *anonymous* summary (no name, phone or email) plus the top matches to `/api/analyze`. The function (`server/analyze-core.mjs`) calls Claude (`claude-opus-5-5` by default) with a strict JSON schema and returns the personal report. It also:
   - accepts only expected fields, with size limits, so it can't be used as a general chatbot proxy;
   - drops any university the model names that wasn't in the shortlist;
   - uses Anthropic's server-side refusal fallback (`fallbacks: "default"`), so a declined request is retried on Anthropic's recommended fallback model.
3. **Fallback.** If the endpoint is missing, slow or fails, the engine writes the report itself. The badge shows "AI counsellor report" or "Smart engine report".

### Turn on the AI report

**Vercel:** import the repo (no build command, output directory `.`), then add the environment variable `ANTHROPIC_API_KEY` under *Settings → Environment Variables*. `api/analyze.js` is picked up automatically and `vercel.json` gives it up to 60 seconds.

**Netlify:** import the repo (publish directory `.`, no build command) and add `ANTHROPIC_API_KEY` under *Site configuration → Environment variables*. `netlify/functions/analyze.mjs` serves `/api/analyze`. Netlify's default function timeout is short, so if reports time out, raise the function timeout or use Vercel.

Optional: set `ANTHROPIC_MODEL` to use a different Claude model. To switch AI off entirely, set `aiEndpoint: ""` in `assets/js/main.js`.

**Cost and abuse:** each AI report is one Claude API call, typically a few US cents. Set a monthly spend limit in the Anthropic Console, and consider your host's rate limiting or firewall rules for `/api/analyze`.

## University data

- `_build/data/de_universities.txt`: 321 German higher-education institutions (name, city, state, type, sector, website, subjects, programme examples, flags).
- `_build/data/pk_universities.txt`: 193 Pakistani universities (name, city, province, sector, website, focus).

Both lists were seeded from the open [Hipo university-domains-list](https://github.com/Hipo/university-domains-list) (MIT licence), then cleaned by hand: renamed institutions, merged duplicates, closed institutions removed, and missing art schools, private universities and new public universities added. The pages credit the source. Programme names are examples, not complete lists. Each card links to the university's website and its DAAD international-programme search. Fees follow general rules (no tuition at most public universities; €1,500/semester for non-EU students in Baden-Württemberg; TUM's international fees; private fees apply). Review the data every intake.

To edit, change the `.txt` files (the format is documented at the top of each), then rebuild.

## Building the pages

Pages are plain HTML generated from `_build/pages/*.html` by a small Python script, which adds the shared header, footer, SEO tags and university data:

```bash
python3 _build/gen.py   # rebuilds all pages, assets/data/*.json and sitemap.xml
```

Edit the files in `_build/pages/` (not the generated `.html` at the root), then run the command. GitHub Pages ignores `_build/` automatically, and `robots.txt` keeps crawlers out of it.

## ⚠️ Before you launch: replace the placeholders

1. **Email.** WhatsApp is set to **+49 155 63342092** everywhere. The email `hello@deutschdreams.pk` is still a placeholder: change it in `SITE` in `assets/js/main.js` and in `_build/gen.py` (`EMAIL`), then rebuild.
2. **Domain.** Change `BASE` in `_build/gen.py` and the sitemap line in `robots.txt`, then rebuild.
3. **Student reviews.** Testimonials are **sample content**. Replace them with real, consented reviews and photos, then remove the "Sample stories…" notes. Don't publish invented reviews: it's misleading, it breaks Google's guidelines and it can cause consumer-protection problems.
4. **Prices.** Package prices are examples (`_build/pages/packages.html`, the home page, and the `Offer` structured data).
5. **Offices and social links.** Real addresses in `contact.html`, and social URLs in `_build/gen.py`.
6. **Facts.** The blocked-account amount (~€11,904/year), visa fee (€75) and tuition rules change. Check them every intake.

## SEO built in

- A keyword-targeted title and description on every page, aimed at Pakistani searches (study in Germany from Pakistan, Germany student visa, low CGPA, without IELTS, list of universities in Germany, HEC recognised universities, CGPA to German grade calculator, AI university matcher…)
- `lang="en-PK"`, hreflang, geo tags and Urdu content
- JSON-LD: `ProfessionalService`, `WebSite`, `BreadcrumbList`, `FAQPage`, `HowTo`, `OfferCatalog`, `WebApplication`, `Article`, and `ItemList`s of all 321 German and 193 Pakistani universities
- All university cards are pre-rendered in the HTML, so search engines can index every one
- `sitemap.xml`, `robots.txt`, canonical URLs, Open Graph and Twitter cards

**After launch:** verify the site in Google Search Console, submit the sitemap, and create a Google Business Profile for each office. Real Google reviews from your students help local rankings a lot.

## Run locally

```bash
python3 -m http.server 8000   # static site; the analyzer uses the on-device report
# or, with the AI endpoint (needs ANTHROPIC_API_KEY):
npm install && npx vercel dev
```
