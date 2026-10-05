// Vercel Function: POST /api/analyze (see server/analyze-core.mjs)
import { handleAnalyze } from "../server/analyze-core.mjs";

export async function POST(request) {
  const { status, body } = await handleAnalyze("POST", await request.text());
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
