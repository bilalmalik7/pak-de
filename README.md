# DeutschDreams: Study in Germany from Pakistan

A fast, animated, SEO-focused website for a study-in-Germany consultancy serving Pakistani students.
It's plain HTML, CSS and JavaScript with no framework and no build step, so you can host it anywhere for free.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Home: animated hero with a flight path from Pakistan to Germany, university marquee, "Why Germany" counters, journey preview, services, "Your GPA doesn't define you" band, packages, analyzer teaser, student stories, booklets, an Urdu section and FAQ |
| `journey.html` | The 10-step journey on a scroll-driven timeline (the plane flies down the line as you scroll), intakes, and Master's / Bachelor's / Ausbildung tracks |
| `packages.html` | 4 packages with a Master's / Bachelor's / Ausbildung price toggle (PKR), a comparison table, add-ons and payment FAQ |
| `universities.html` | 24 German universities with filters (tuition-free, TU9, applied sciences, private, popular with Pakistanis) and live search |
| `profile-analyzer.html` | **Student portal**: a 4-step form that converts CGPA/percentage to the German grade (Modified Bavarian Formula), scores the profile, suggests routes and sends the report to WhatsApp. Runs 100% in the browser |
| `reviews.html` | Video-style story cards and a "wall of love" of testimonials |
| `guides.html` | Interactive 3D **flip-through booklet** (printable as a PDF), a booklet library, and long-form guides (visa checklist, blocked account, without IELTS, Studienkolleg, Ausbildung, Opportunity Card) |
| `study-in-germany-from-pakistan.html` | Main SEO page for the core keyword, with city sections (Lahore, Islamabad, Karachi, Faisalabad, Multan, Peshawar…) |
| `low-gpa-germany.html` | SEO page for "study in Germany with low CGPA" |
| `contact.html` | Contact options, a lead form that opens WhatsApp with the details filled in, and office cards |
| `404.html` | Custom not-found page |

## ⚠️ Before you launch: replace the placeholders

1. **Email.** WhatsApp is already set to **+49 155 63342092** everywhere. The email `hello@deutschdreams.pk` is still a placeholder: change it in the `SITE` object at the top of `assets/js/main.js` and find and replace it in the HTML files. If the WhatsApp number ever changes, update `SITE.whatsapp` and replace `4915563342092` / `+49 155 63342092` in the HTML the same way.
2. **Domain.** Find and replace `https://www.deutschdreams.pk` in all `.html` files, `sitemap.xml` and `robots.txt` with your real domain.
3. **Student reviews.** The testimonials and video cards are **sample content**. Replace them with real, consented reviews and photos, then delete the "Sample stories…" notes. To add a photo, put it in `assets/img/students/` and swap the initials inside `<span class="avatar">` for an `<img>` tag. Don't publish invented reviews: it's misleading, it breaks Google's guidelines and it can create consumer-protection problems.
4. **Prices.** The package and add-on prices are examples. Update them in `packages.html`, in the home page packages section, and in the `Offer` structured data at the top of `packages.html`.
5. **Offices.** Put your real addresses and Google Maps links in `contact.html`.
6. **Social links.** The footer social icons point to `#`. Add your Instagram, Facebook, TikTok, YouTube and LinkedIn URLs.
7. **Facts and figures.** Blocked account amount, fees and visa rules change. Review them every intake (they currently reference ~€11,904/year for the blocked account and a €75 visa fee).
8. **Brand name.** Check that "DeutschDreams" and your domain are available before printing anything.

## SEO built in

- A unique keyword-targeted `<title>`, meta description and keywords on every page, aimed at Pakistani search terms (study in Germany from Pakistan, Germany student visa Pakistan, low CGPA, without IELTS, Lahore/Islamabad/Karachi consultants, CGPA to German grade calculator…)
- `lang="en-PK"`, `hreflang`, geo meta tags and an Urdu content block for local search
- JSON-LD structured data: `ProfessionalService` (with areaServed cities in Pakistan), `WebSite`, `BreadcrumbList`, `FAQPage` (generated from the visible FAQs), `HowTo` (journey), `OfferCatalog` (packages), `ItemList` (universities), `WebApplication` (analyzer) and `Article`
- `sitemap.xml`, `robots.txt`, canonical URLs, Open Graph and Twitter cards (`assets/img/og-image.png`)
- Semantic headings (one `h1` per page), descriptive link text and a "Popular searches" internal-link block in the footer
- Fast: no frameworks, about 100 KB of uncompressed CSS and JS (around 25 KB gzipped), system-font fallbacks, and animations that respect `prefers-reduced-motion`

**After launch:** verify the site in [Google Search Console](https://search.google.com/search-console), submit `sitemap.xml`, and create a **Google Business Profile** for each office. For "near me" searches in Lahore, Islamabad and Karachi, that matters as much as the website. Real Google reviews from your students will help rankings far more than anything on the page.

## Run locally

```bash
cd pak-de
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (free)

- **Netlify / Vercel:** connect this repo (the site is at the repo root, no build command needed), or drag and drop the folder.
- **GitHub Pages:** enable Pages for this repo from the root of the branch. `404.html` uses `<base href="/">`, so if you host it in a sub-path (e.g. `username.github.io/repo/`), change that value to match.

## Customising

- Colours, fonts and spacing are CSS variables at the top of `assets/css/style.css`.
- Add an element to the scroll animations by giving it the class `reveal` (variants: `from-left`, `from-right`, `zoom`). Put `data-stagger` on a parent to cascade its children.
- The analyzer's scoring rules live in `assets/js/analyzer.js`, and every rule is commented.
