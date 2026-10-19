// Netlify Function: POST /api/programme-advice (see server/programmes-core.mjs)
import { handleAdvice } from "../../server/programmes-core.mjs";

export default async (request) => {
  const { status, body } = await handleAdvice(request.method, request.method === "POST" ? await request.text() : "");
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/programme-advice" };
