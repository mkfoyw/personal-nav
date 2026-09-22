import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { MongoClient, ObjectId, type Collection, type Document } from "mongodb";
import nextEnv from "@next/env";
import { InputError, normalizeLink } from "../lib/links";

nextEnv.loadEnvConfig(process.cwd());

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 8788);
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const dbName = process.env.MONGODB_DB || "personal_nav";
const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((value) => value.trim()).filter(Boolean);

const localOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  ...configuredOrigins,
]);

let client: MongoClient | undefined;
let links: Collection<Document> | undefined;

async function getCollection() {
  if (links) return links;
  client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500 });
  try {
    await client.connect();
    links = client.db(dbName).collection("links");
    await links.createIndex({ order: 1, createdAt: -1 });
    return links;
  } catch (error) {
    await client.close().catch(() => {});
    client = undefined;
    links = undefined;
    throw error;
  }
}

function isAllowedOrigin(origin?: string) {
  if (!origin || localOrigins.has(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && (
      hostname.endsWith(".openai.site") ||
      hostname.endsWith(".sites.openai.com") ||
      hostname.endsWith(".chatgpt.site") ||
      hostname.endsWith(".chatgpt.com")
    );
  } catch { return false; }
}

function setCors(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128_000) throw new InputError("请求内容过大");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new InputError("请求必须为有效 JSON"); }
}

function serialize(document: Document & { _id: ObjectId }) {
  const categories = Array.isArray(document.categories) && document.categories.length
    ? document.categories : [document.category || "其他"];
  return {
    ...document,
    _id: document._id.toString(),
    categories,
    category: categories[0],
    isDefault: Boolean(document.isDefault),
  };
}

async function handleApi(request: http.IncomingMessage, response: http.ServerResponse, pathname: string) {
  setCors(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(isAllowedOrigin(request.headers.origin) ? 204 : 403);
    response.end();
    return;
  }
  if (!isAllowedOrigin(request.headers.origin)) return sendJson(response, 403, { error: "来源未被允许" });

  try {
    const collection = await getCollection();
    if (pathname === "/api/health" && request.method === "GET") {
      await collection.findOne({}, { projection: { _id: 1 } });
      return sendJson(response, 200, { ok: true });
    }
    if (pathname === "/api/links" && request.method === "GET") {
      const rows = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
      return sendJson(response, 200, { links: rows.map(serialize) });
    }
    if (pathname === "/api/links" && request.method === "POST") {
      const input = normalizeLink(await readJson(request));
      const now = new Date();
      const document = { ...input, order: now.getTime(), createdAt: now, updatedAt: now };
      const result = await collection.insertOne(document);
      return sendJson(response, 201, { link: serialize({ ...document, _id: result.insertedId }) });
    }

    const match = pathname.match(/^\/api\/links\/([a-f\d]{24})$/i);
    if (match && request.method === "PATCH") {
      const _id = new ObjectId(match[1]);
      const current = await collection.findOne({ _id });
      if (!current) return sendJson(response, 404, { error: "未找到这个链接" });
      const patch = await readJson(request);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new InputError("请求格式无效");
      const merged = { ...serialize(current), ...patch } as Record<string, unknown>;
      if ("category" in patch && !("categories" in patch)) merged.categories = patch.category;
      const input = normalizeLink(merged);
      const updated = await collection.findOneAndUpdate(
        { _id }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" },
      );
      return updated ? sendJson(response, 200, { link: serialize(updated) }) : sendJson(response, 404, { error: "未找到这个链接" });
    }
    if (match && request.method === "DELETE") {
      const result = await collection.deleteOne({ _id: new ObjectId(match[1]) });
      return sendJson(response, result.deletedCount ? 200 : 404, { ok: Boolean(result.deletedCount) });
    }
    return sendJson(response, 404, { error: "接口不存在" });
  } catch (error) {
    if (error instanceof InputError) return sendJson(response, 400, { error: error.message });
    console.error("MongoDB request failed:", error instanceof Error ? error.message : error);
    links = undefined;
    await client?.close().catch(() => {});
    client = undefined;
    return sendJson(response, 503, { error: "暂时无法连接收藏库，请确认本机 MongoDB 已启动后重试。" });
  }
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

async function serveStatic(response: http.ServerResponse, pathname: string) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let target = join(root, safePath);
  try {
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    const file = await readFile(target);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(target)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(request, response, url.pathname);
  return serveStatic(response, url.pathname);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`栖点本地服务：http://localhost:${port}`);
  console.log(`MongoDB：${mongoUri}${dbName}`);
});

async function shutdown() {
  await client?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
