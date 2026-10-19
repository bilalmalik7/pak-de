// Vercel Function: GET /api/daad?q=…&level=master (see server/programmes-core.mjs)
import { handleDaad } from "../server/programmes-core.mjs";

export async function GET(request) {
  const { status, body, cache } = await handleDaad("GET", request.url);
  return Response.json(body, { status, headers: { "Cache-Control": cache ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store" } });
}
