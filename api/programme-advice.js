// Vercel Function: POST /api/programme-advice (see server/programmes-core.mjs)
import { handleAdvice } from "../server/programmes-core.mjs";

export async function POST(request) {
  const { status, body } = await handleAdvice("POST", await request.text());
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
