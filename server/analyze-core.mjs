// AI Profile Analysis: shared logic for the Vercel (api/analyze.js) and Netlify
// (netlify/functions/analyze.mjs) endpoints. Needs ANTHROPIC_API_KEY in the host's environment.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_BODY_BYTES = 12_000;

const SYSTEM_PROMPT = `You are a senior study-abroad counsellor at DeutschDreams, an education consultancy that guides Pakistani students to study in Germany (Master's, Bachelor's via Studienkolleg, and Ausbildung).

You receive one student's anonymous profile plus an analysis already computed by our engine: their German grade (Modified Bavarian Formula), sub-scores, and a shortlist of German universities matched from our database. Write a personal, encouraging and strictly honest counselling report.

Rules:
- Be specific to this student. Reference their numbers (German grade, English score, gap, budget) and their Pakistani university or qualification where useful.
- Be honest about difficulty. Never promise admission, scholarships or visas. A low CGPA is a different route, not a dead end: show the realistic routes.
- Only discuss universities from the provided shortlist, and keep their names exactly as given. Do not invent programmes, rankings, deadlines or fees. Programme examples may be mentioned only if they appear in the shortlist data.
- For rules that change (blocked-account amount, visa fees, tuition), describe them as approximate and to be confirmed.
- Pakistani context matters: HEC/IBCC attestation, anabin status of the student's university, the 16-year rule for Master's, the German Embassy Islamabad / Consulate Karachi, family sponsorship.
- Write in clear, warm English that a 22-year-old and their parents can follow. No markdown.
- parent_note_urdu: 2–3 short sentences in Urdu script for the student's parents summarising the plan reassuringly and honestly.`;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "strengths", "risks", "strategy", "university_notes", "sop_angle", "parent_note_urdu"],
  properties: {
    headline: { type: "string", description: "One-line verdict, max 12 words." },
    summary: { type: "string", description: "3–4 sentence personal assessment." },
    strengths: { type: "array", items: { type: "string" }, description: "2–4 concrete strengths." },
    risks: { type: "array", items: { type: "string" }, description: "2–4 honest risks, each with a fix." },
    strategy: {
      type: "array",
      description: "4–6 time-ordered steps toward the target intake.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["when", "action"],
        properties: { when: { type: "string" }, action: { type: "string" } },
      },
    },
    university_notes: {
      type: "array",
      description: "Up to 5 universities from the shortlist with why they fit this student.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "fit", "why"],
        properties: {
          name: { type: "string" },
          fit: { type: "string", enum: ["ambitious", "target", "safe"] },
          why: { type: "string" },
        },
      },
    },
    sop_angle: { type: "string", description: "The story angle their motivation letter should lead with, 2 sentences." },
    parent_note_urdu: { type: "string" },
  },
};

const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : null;
};

// Accept only the fields we expect, with bounded sizes, so the endpoint can't be used as a general LLM proxy.
export function sanitizeProfile(body) {
  const p = body && typeof body === "object" ? body : {};
  const matches = Array.isArray(p.matches) ? p.matches.slice(0, 10) : [];
  return {
    target: str(p.target, 20),
    qualification: str(p.qualification, 80),
    pakistaniUniversity: str(p.pakistaniUniversity, 120),
    city: str(p.city, 40),
    field: str(p.field, 40),
    grade: str(p.grade, 30),
    germanGrade: num(p.germanGrade, 1, 5),
    english: str(p.english, 60),
    german: str(p.german, 10),
    gapYears: num(p.gapYears, 0, 20),
    workYears: num(p.workYears, 0, 30),
    finance: str(p.finance, 40),
    intake: str(p.intake, 30),
    goal: str(p.goal, 300),
    score: num(p.score, 0, 100),
    subScores: {
      academics: num(p.subScores?.academics, 0, 100),
      language: num(p.subScores?.language, 0, 100),
      finance: num(p.subScores?.finance, 0, 100),
      profile: num(p.subScores?.profile, 0, 100),
    },
    routes: (Array.isArray(p.routes) ? p.routes.slice(0, 8) : []).map((r) => str(r, 120)),
    matches: matches.map((m) => ({
      name: str(m?.name, 120),
      city: str(m?.city, 60),
      type: str(m?.type, 60),
      fee: str(m?.fee, 60),
      fit: str(m?.fit, 20),
      programmes: (Array.isArray(m?.programmes) ? m.programmes.slice(0, 4) : []).map((x) => str(x, 80)),
    })),
  };
}

export async function analyzeProfile(profile) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // a declined request is retried server-side on Anthropic's recommended fallback model
    output_config: { effort: "low", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Student profile and engine analysis (JSON):\n${JSON.stringify(profile)}` }],
  });

  if (response.stop_reason === "refusal") throw new Error("refused");
  if (response.stop_reason === "max_tokens") throw new Error("truncated");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("empty");
  const report = JSON.parse(text);

  // Keep only universities that were actually in the shortlist we sent.
  const allowed = new Set(profile.matches.map((m) => m.name));
  report.university_notes = (report.university_notes || []).filter((u) => allowed.has(u.name)).slice(0, 5);
  return { report, model: response.model };
}

// Shared request handling: returns { status, body } so each platform wrapper stays tiny.
export async function handleAnalyze(method, rawBody) {
  if (method !== "POST") return { status: 405, body: { error: "Method not allowed" } };
  if (!process.env.ANTHROPIC_API_KEY) return { status: 503, body: { error: "AI analysis is not configured" } };
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return { status: 413, body: { error: "Invalid request size" } };
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const profile = sanitizeProfile(parsed);
  if (!profile.target || profile.germanGrade === null) return { status: 400, body: { error: "Incomplete profile" } };
  try {
    const result = await analyzeProfile(profile);
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { status: 429, body: { error: "Busy, please retry shortly" } };
    if (err instanceof Anthropic.AuthenticationError) return { status: 503, body: { error: "AI analysis is not configured" } };
    if (err instanceof Anthropic.APIError) return { status: 502, body: { error: "AI service error" } };
    return { status: 502, body: { error: "Could not generate the AI report" } };
  }
}
