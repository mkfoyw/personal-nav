import { apiError } from "@/lib/api";
import { getLinksCollection } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const collection = await getLinksCollection();
    await collection.findOne({}, { projection: { _id: 1 } });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
