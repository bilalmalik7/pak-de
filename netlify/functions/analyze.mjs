// Netlify Function: POST /api/analyze (see server/analyze-core.mjs)
import { handleAnalyze } from "../../server/analyze-core.mjs";

export default async (request) => {
  const { status, body } = await handleAnalyze(request.method, request.method === "POST" ? await request.text() : "");
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/analyze" };
