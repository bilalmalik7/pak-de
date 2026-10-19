// Netlify Function: POST /api/transcript (see server/programmes-core.mjs)
import { handleTranscript } from "../../server/programmes-core.mjs";

export default async (request) => {
  const { status, body } = await handleTranscript(request.method, request.method === "POST" ? await request.text() : "");
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/transcript" };
