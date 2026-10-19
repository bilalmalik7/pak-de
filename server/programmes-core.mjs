// Programme Finder: shared logic for three endpoints (Vercel files in api/, Netlify files in netlify/functions/).
//   POST /api/transcript        reads an uploaded transcript (PDF / photo) or pasted text with Claude and returns
//                               structured academic data. Personal identifiers are never returned, nothing is stored.
//   POST /api/programme-advice  Claude reviews the engine's top programme matches for one anonymous profile.
//   GET  /api/daad              live keyword search of DAAD's international-programmes database (no API key needed).
// The Claude endpoints need ANTHROPIC_API_KEY in the host's environment.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_TRANSCRIPT_BYTES = 4_400_000; // Vercel rejects request bodies over 4.5 MB
const MAX_ADVICE_BYTES = 16_000;
const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const num = (v, lo, hi) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : null;
};
const nullable = (type) => ({ anyOf: [{ type }, { type: "null" }] });

function apiError(err) {
  if (err instanceof Anthropic.RateLimitError) return { status: 429, body: { error: "Busy, please retry shortly" } };
  if (err instanceof Anthropic.AuthenticationError) return { status: 503, body: { error: "AI analysis is not configured" } };
  if (err instanceof Anthropic.APIError) return { status: 502, body: { error: "AI service error" } };
  return { status: 502, body: { error: "Could not complete the AI analysis" } };
}

async function askClaude({ system, content, schema, maxTokens }) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // a declined request is retried server-side on Anthropic's recommended fallback model
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  if (response.stop_reason === "max_tokens") throw new Error("truncated");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("empty");
  return { data: JSON.parse(text), model: response.model };
}

/* ---------- Transcript reading ---------- */

const TRANSCRIPT_PROMPT = `You read academic documents for DeutschDreams, a consultancy that helps Pakistani students apply to German universities. You receive one transcript, degree certificate, mark sheet or CV (or text a student typed about their education) and extract the academic facts our matching engine needs.

Rules:
- Never output personal identifiers: no names, father's name, roll / registration / enrolment numbers, CNIC or passport numbers, dates of birth, addresses or photos. Leave them out entirely.
- Report only what the document shows. Use null for anything missing or unreadable. Never guess a CGPA.
- cgpa: the final cumulative CGPA (not a single semester GPA) with its scale (usually 4.0). percentage: the overall percentage or aggregate if the document uses marks instead.
- degree_level: bachelor_16_year for 4-year BS/BE/BSc (Hons)/BBA (Hons)/MBBS/Pharm-D/DPT and BA+MA combinations; bachelor_14_year for 2-year BA/BSc/BCom; master for MS/MPhil/MSc (18 years); intermediate for FSc/ICS/ICom/FA; a_levels for A-Levels.
- courses: every course you can read (up to 80) with credit hours and grade as printed. Keep course titles short and in English.
- strongest_subjects / weakest_subjects: 2-5 subject areas inferred from the grades (for example "Power Systems", "Programming").
- If the document is not an academic record at all, set document_type to "not_academic" and leave the other fields empty or null.
- notes: one or two sentences on anything that matters for German admissions (for example a 14-year degree, a grading scale other than 4.0, or missing final results).`;

const TRANSCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_type", "degree_title", "degree_level", "field_of_study", "institution", "country", "cgpa", "cgpa_scale", "percentage", "total_credit_hours", "courses", "strongest_subjects", "weakest_subjects", "notes"],
  properties: {
    document_type: { type: "string", enum: ["transcript", "degree_certificate", "mark_sheet", "cv", "self_description", "not_academic"] },
    degree_title: { type: "string", description: "e.g. BS Electrical Engineering" },
    degree_level: { type: "string", enum: ["intermediate", "a_levels", "bachelor_14_year", "bachelor_16_year", "master", "other", "unknown"] },
    field_of_study: { type: "string" },
    institution: { type: "string", description: "University or board name, not a person" },
    country: { type: "string" },
    cgpa: nullable("number"),
    cgpa_scale: nullable("number"),
    percentage: nullable("number"),
    total_credit_hours: nullable("number"),
    courses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "credits", "grade"],
        properties: { title: { type: "string" }, credits: nullable("number"), grade: { type: "string" } },
      },
    },
    strongest_subjects: { type: "array", items: { type: "string" } },
    weakest_subjects: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
};

function cleanTranscript(d) {
  return {
    document_type: str(d.document_type, 30),
    degree_title: str(d.degree_title, 120),
    degree_level: str(d.degree_level, 30),
    field_of_study: str(d.field_of_study, 120),
    institution: str(d.institution, 160),
    country: str(d.country, 60),
    cgpa: num(d.cgpa, 0, 10),
    cgpa_scale: num(d.cgpa_scale, 1, 10),
    percentage: num(d.percentage, 0, 100),
    total_credit_hours: num(d.total_credit_hours, 0, 400),
    courses: (Array.isArray(d.courses) ? d.courses.slice(0, 80) : []).map((c) => ({
      title: str(c?.title, 100),
      credits: num(c?.credits, 0, 20),
      grade: str(c?.grade, 10),
    })).filter((c) => c.title),
    strongest_subjects: (Array.isArray(d.strongest_subjects) ? d.strongest_subjects.slice(0, 5) : []).map((s) => str(s, 60)),
    weakest_subjects: (Array.isArray(d.weakest_subjects) ? d.weakest_subjects.slice(0, 5) : []).map((s) => str(s, 60)),
    notes: str(d.notes, 400),
  };
}

export async function handleTranscript(method, rawBody) {
  if (method !== "POST") return { status: 405, body: { error: "Method not allowed" } };
  if (!process.env.ANTHROPIC_API_KEY) return { status: 503, body: { error: "AI analysis is not configured" } };
  if (!rawBody || rawBody.length > MAX_TRANSCRIPT_BYTES) return { status: 413, body: { error: "File too large (max ~3 MB)" } };
  let p;
  try {
    p = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const content = [];
  const file = p && typeof p.file === "object" ? p.file : null;
  if (file) {
    const type = str(file.type, 40);
    const data = typeof file.data === "string" ? file.data : "";
    if (!FILE_TYPES.has(type) || !data || /[^A-Za-z0-9+/=]/.test(data)) return { status: 400, body: { error: "Unsupported file" } };
    content.push(type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: type, data } }
      : { type: "image", source: { type: "base64", media_type: type, data } });
    content.push({ type: "text", text: "Extract the academic record from this document." });
  } else {
    const text = str(p?.text, 30_000);
    if (text.length < 10) return { status: 400, body: { error: "Nothing to analyse" } };
    content.push({ type: "text", text: `Extract the academic record from this text the student pasted or typed:\n\n${text}` });
  }
  try {
    const { data, model } = await askClaude({ system: TRANSCRIPT_PROMPT, content, schema: TRANSCRIPT_SCHEMA, maxTokens: 8000 });
    return { status: 200, body: { transcript: cleanTranscript(data), model } };
  } catch (err) {
    return apiError(err);
  }
}

/* ---------- AI review of programme matches ---------- */

const ADVICE_PROMPT = `You are a senior admissions counsellor at DeutschDreams, helping Pakistani students choose German degree programmes. You receive one student's anonymous academic profile and a shortlist of programmes that our engine matched, each with an estimated admission chance.

Rules:
- Discuss only the programmes in the shortlist and refer to them by their id. Do not invent programmes, modules, deadlines, fees or admission statistics.
- German master's admissions check subject fit (the bachelor's must be "closely related", often counted in ECTS of specific subjects), the German grade, English (usually IELTS 6.5) and sometimes GRE or work experience. Judge the subject fit from the student's courses.
- Be honest: if a programme is a stretch or a subject mismatch, say so and explain what would close the gap. Never promise admission or visas.
- Mention Pakistani specifics when relevant: HEC attestation, anabin H+ status of the university, uni-assist / VPD, the 16-year rule.
- Clear, warm English for a 22-year-old and their parents. No markdown.`;

const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "eligibility", "programme_notes", "prerequisite_gaps", "next_steps"],
  properties: {
    headline: { type: "string", description: "One-line verdict, max 12 words." },
    summary: { type: "string", description: "3-4 sentences on how this profile fits German programmes." },
    eligibility: { type: "array", items: { type: "string" }, description: "2-4 eligibility facts (16-year rule, subject fit, language)." },
    programme_notes: {
      type: "array",
      description: "One note per shortlisted programme, best first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "why", "gaps"],
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["apply", "consider", "stretch", "skip"] },
          why: { type: "string", description: "1-2 sentences tied to the student's courses and grade." },
          gaps: { type: "string", description: "What to fix or prove for this programme, or empty." },
        },
      },
    },
    prerequisite_gaps: { type: "array", items: { type: "string" }, description: "0-4 subject areas the student may lack for their top choices." },
    next_steps: { type: "array", items: { type: "string" }, description: "3-5 concrete next steps." },
  },
};

export function sanitizeAdvice(body) {
  const p = body && typeof body === "object" ? body : {};
  return {
    target: str(p.target, 20),
    qualification: str(p.qualification, 80),
    degree: str(p.degree, 120),
    institution: str(p.institution, 160),
    grade: str(p.grade, 40),
    germanGrade: num(p.germanGrade, 1, 5),
    english: str(p.english, 60),
    german: str(p.german, 10),
    workYears: num(p.workYears, 0, 30),
    subjects: (Array.isArray(p.subjects) ? p.subjects.slice(0, 8) : []).map((s) => str(s, 60)),
    interests: (Array.isArray(p.interests) ? p.interests.slice(0, 6) : []).map((s) => str(s, 60)),
    courses: (Array.isArray(p.courses) ? p.courses.slice(0, 45) : []).map((s) => str(s, 80)),
    programmes: (Array.isArray(p.programmes) ? p.programmes.slice(0, 12) : []).map((m) => ({
      id: str(m?.id, 140),
      name: str(m?.name, 140),
      degree: str(m?.degree, 10),
      university: str(m?.university, 140),
      city: str(m?.city, 60),
      type: str(m?.type, 60),
      language: str(m?.language, 20),
      fee: str(m?.fee, 60),
      chance: num(m?.chance, 0, 100),
      subjectFit: num(m?.subjectFit, 0, 100),
    })).filter((m) => m.id && m.name),
  };
}

export async function handleAdvice(method, rawBody) {
  if (method !== "POST") return { status: 405, body: { error: "Method not allowed" } };
  if (!process.env.ANTHROPIC_API_KEY) return { status: 503, body: { error: "AI analysis is not configured" } };
  if (!rawBody || rawBody.length > MAX_ADVICE_BYTES) return { status: 413, body: { error: "Invalid request size" } };
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const profile = sanitizeAdvice(parsed);
  if (!profile.programmes.length) return { status: 400, body: { error: "No programmes to review" } };
  try {
    const { data, model } = await askClaude({
      system: ADVICE_PROMPT,
      content: `Student profile and matched programmes (JSON):\n${JSON.stringify(profile)}`,
      schema: ADVICE_SCHEMA,
      maxTokens: 6000,
    });
    // Keep only notes about programmes that were actually in the shortlist.
    const allowed = new Set(profile.programmes.map((m) => m.id));
    data.programme_notes = (data.programme_notes || []).filter((n) => allowed.has(n.id));
    return { status: 200, body: { advice: data, model } };
  } catch (err) {
    return apiError(err);
  }
}

/* ---------- Live DAAD search ---------- */
// DAAD's international-programmes website loads its results from this JSON endpoint. It is not a documented,
// versioned API, so the mapping below reads several possible field names and the browser falls back to our own
// catalogue whenever this returns an error. DAAD owns this content: results are shown with credit and link back.
const DAAD_SEARCH = process.env.DAAD_SEARCH_URL || "https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json";
const DAAD_ORIGIN = "https://www2.daad.de";
const DAAD_DEGREE = { bachelor: "1", master: "2" };

const plain = (v, max = 160) => str(typeof v === "string" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") : "", max);
const first = (...vals) => vals.find((v) => typeof v === "string" && v.trim()) || "";

function daadLink(v) {
  if (typeof v !== "string" || !v) return "";
  try {
    const u = new URL(v, DAAD_ORIGIN);
    return u.protocol === "https:" && /(^|\.)daad\.de$/.test(u.hostname) ? u.href : "";
  } catch {
    return "";
  }
}

export function mapDaad(json) {
  const list = Array.isArray(json?.courses) ? json.courses
    : Array.isArray(json?.results) ? json.results
    : Array.isArray(json?.response?.docs) ? json.response.docs
    : Array.isArray(json?.docs) ? json.docs : null;
  if (!list) return null;
  const langs = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;/]/) : []).map((x) => plain(x, 30)).filter(Boolean).slice(0, 4);
  const results = list.slice(0, 30).map((c) => ({
    name: plain(first(c?.courseName, c?.courseNameShort, c?.name, c?.title)),
    university: plain(first(c?.academy, c?.university, c?.institution, c?.hochschule)),
    city: plain(first(c?.city, c?.location, c?.town), 60),
    degree: plain(first(c?.degree, c?.courseType, c?.academicDegree), 60),
    languages: langs(c?.languages ?? c?.language),
    tuition: plain(first(c?.tuitionFees, c?.tuitionFee, c?.fees), 80),
    beginning: plain(first(c?.beginning, c?.startDate, c?.date), 60),
    link: daadLink(first(c?.link, c?.url, c?.detailLink, c?.href)),
  })).filter((r) => r.name && r.university);
  const total = Number(json?.numResults ?? json?.total ?? json?.response?.numFound);
  return { total: Number.isFinite(total) ? total : results.length, results };
}

export async function handleDaad(method, requestUrl) {
  if (method !== "GET") return { status: 405, body: { error: "Method not allowed" } };
  const params = new URL(requestUrl, "http://local").searchParams;
  const q = str(params.get("q") || "", 80).replace(/[^\p{L}\p{N} &+.,'\/-]/gu, " ").trim();
  const level = params.get("level") === "bachelor" ? "bachelor" : "master";
  if (q.length < 2) return { status: 400, body: { error: "Query too short" } };
  const url = new URL(DAAD_SEARCH);
  url.searchParams.set("q", q);
  url.searchParams.append("degree[]", DAAD_DEGREE[level]);
  url.searchParams.set("limit", "20");
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort", "4");
  url.searchParams.set("display", "list");
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) return { status: 502, body: { error: "DAAD search unavailable" } };
    const mapped = mapDaad(await res.json());
    if (!mapped) return { status: 502, body: { error: "Unexpected DAAD response" } };
    return { status: 200, body: { source: "DAAD International Programmes", ...mapped }, cache: true };
  } catch {
    return { status: 502, body: { error: "DAAD search unavailable" } };
  }
}
