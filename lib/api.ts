import { InputError } from "@/lib/links";

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const url = new URL(request.url);
  const allowed = new Set([url.origin, `http://localhost:${url.port || "80"}`, `http://127.0.0.1:${url.port || "80"}`]);
  if (!allowed.has(origin)) throw new OriginError();
}

class OriginError extends Error {}

export async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("请求内容不能为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128_000) { await reader.cancel(); throw new InputError("请求内容过大"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("请求必须为有效 JSON"); }
}

export function apiError(error: unknown) {
  if (error instanceof OriginError) return Response.json({ error: "来源未被允许" }, { status: 403 });
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
  console.error("Navigation database request failed:", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "暂时无法连接收藏库，请确认本机 MongoDB 已启动后重试。" }, { status: 503 });
}
