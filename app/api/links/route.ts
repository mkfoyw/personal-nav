import { apiError, checkOrigin, readJson } from "@/lib/api";
import { normalizeLink } from "@/lib/links";
import { getLinksCollection, serializeLink } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const collection = await getLinksCollection();
    const links = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
    return Response.json({ links: links.map(serializeLink) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = normalizeLink(await readJson(request));
    const collection = await getLinksCollection();
    const now = new Date();
    const document = { ...input, order: now.getTime(), createdAt: now, updatedAt: now };
    const result = await collection.insertOne(document);
    return Response.json({ link: serializeLink({ ...document, _id: result.insertedId }) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
