// Vercel Function: POST /api/transcript (see server/programmes-core.mjs)
import { handleTranscript } from "../server/programmes-core.mjs";

export async function POST(request) {
  const { status, body } = await handleTranscript("POST", await request.text());
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
