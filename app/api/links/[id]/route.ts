import { ObjectId } from "mongodb";
import { apiError, checkOrigin, readJson } from "@/lib/api";
import { InputError, normalizeLink } from "@/lib/links";
import { getLinksCollection, serializeLink } from "@/lib/mongodb";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const notFound = () => Response.json({ error: "未找到这个链接" }, { status: 404 });

async function getId(context: Context) {
  const { id } = await context.params;
  if (!/^[a-f\d]{24}$/i.test(id)) throw new InputError("链接 ID 无效");
  return new ObjectId(id);
}

export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const _id = await getId(context);
    const input = await readJson(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("请求格式无效");
    const collection = await getLinksCollection();
    const current = await collection.findOne({ _id });
    if (!current) return notFound();
    const updates = input as Record<string, unknown>;
    const merged = { ...serializeLink(current), ...updates };
    if (updates.category !== undefined && updates.categories === undefined) merged.categories = updates.category as string[];
    const normalized = normalizeLink(merged);
    const result = await collection.findOneAndUpdate({ _id }, { $set: { ...normalized, updatedAt: new Date() } }, { returnDocument: "after" });
    return result ? Response.json({ link: serializeLink(result) }) : notFound();
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const _id = await getId(context);
    const collection = await getLinksCollection();
    const result = await collection.deleteOne({ _id });
    return result.deletedCount ? Response.json({ ok: true }) : notFound();
  } catch (error) { return apiError(error); }
}
