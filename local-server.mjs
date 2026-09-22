import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";

const root = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number(process.env.PORT || 8788);
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const dbName = process.env.MONGODB_DB || "personal_nav";
const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const defaultOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  ...configuredOrigins,
]);

const defaultLinks = [
  { title: "ChatGPT", url: "https://chatgpt.com", category: "AI 工具", note: "思考、写作与创造", color: "blue", order: 10, isDefault: true },
  { title: "GitHub", url: "https://github.com", category: "开发", note: "代码与项目", color: "violet", order: 20, isDefault: true },
  { title: "Notion", url: "https://notion.so", category: "效率", note: "知识与计划", color: "slate", order: 30, isDefault: true },
  { title: "Figma", url: "https://figma.com", category: "设计", note: "界面与原型", color: "pink", order: 40, isDefault: true },
  { title: "Linear", url: "https://linear.app", category: "效率", note: "任务与协作", color: "indigo", order: 50, isDefault: true },
  { title: "哔哩哔哩", url: "https://bilibili.com", category: "灵感", note: "视频与学习", color: "cyan", order: 60, isDefault: true },
  { title: "即刻", url: "https://okjike.com", category: "灵感", note: "发现有趣的人", color: "amber", order: 70, isDefault: true },
  { title: "少数派", url: "https://sspai.com", category: "阅读", note: "效率与生活方式", color: "red", order: 80, isDefault: true },
];

let client;
let links;

async function connectDatabase() {
  if (links) return links;
  client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500 });
  await client.connect();
  const db = client.db(dbName);
  links = db.collection("links");
  await links.createIndex({ order: 1, createdAt: -1 });
  if ((await links.estimatedDocumentCount()) === 0) {
    const now = new Date();
    await links.insertMany(defaultLinks.map((item) => ({ ...item, createdAt: now, updatedAt: now })));
  }
  await links.updateMany(
    { isDefault: { $exists: false }, url: { $in: defaultLinks.map((item) => item.url) } },
    { $set: { isDefault: true } },
  );
  return links;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (defaultOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (
      url.hostname.endsWith(".openai.site") ||
      url.hostname.endsWith(".sites.openai.com") ||
      url.hostname.endsWith(".chatgpt.site") ||
      url.hostname.endsWith(".chatgpt.com")
    );
  } catch {
    return false;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128_000) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeLink(input) {
  const title = String(input.title || "").trim().slice(0, 80);
  const category = String(input.category || "其他").trim().slice(0, 30) || "其他";
  const note = String(input.note || "").trim().slice(0, 120);
  let url;
  try {
    url = new URL(String(input.url || "").trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("请输入有效的 http(s) 地址");
  }
  if (!title) throw new Error("名称不能为空");
  return {
    title,
    url: url.href,
    category,
    note,
    color: String(input.color || "blue").slice(0, 20),
    isDefault: Boolean(input.isDefault),
  };
}

function serialize(document) {
  return { ...document, _id: document._id.toString() };
}

async function handleApi(req, res, pathname) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(isAllowedOrigin(req.headers.origin) ? 204 : 403);
    return res.end();
  }
  if (!isAllowedOrigin(req.headers.origin)) return sendJson(res, 403, { error: "来源未被允许" });

  try {
    const collection = await connectDatabase();
    if (pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, database: dbName, host: "localhost:27017" });
    }
    if (pathname === "/api/links" && req.method === "GET") {
      const rows = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
      return sendJson(res, 200, { links: rows.map(serialize) });
    }
    if (pathname === "/api/links" && req.method === "POST") {
      const input = normalizeLink(await readJson(req));
      const now = new Date();
      const result = await collection.insertOne({ ...input, order: Date.now(), createdAt: now, updatedAt: now });
      const row = await collection.findOne({ _id: result.insertedId });
      return sendJson(res, 201, { link: serialize(row) });
    }

    const match = pathname.match(/^\/api\/links\/([a-f\d]{24})$/i);
    if (match && req.method === "PATCH") {
      const input = normalizeLink(await readJson(req));
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(match[1]) },
        { $set: { ...input, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      if (!result) return sendJson(res, 404, { error: "未找到这个链接" });
      return sendJson(res, 200, { link: serialize(result) });
    }
    if (match && req.method === "DELETE") {
      const result = await collection.deleteOne({ _id: new ObjectId(match[1]) });
      return sendJson(res, result.deletedCount ? 200 : 404, { ok: Boolean(result.deletedCount) });
    }
    return sendJson(res, 404, { error: "接口不存在" });
  } catch (error) {
    console.error(error);
    links = undefined;
    if (client) await client.close().catch(() => {});
    client = undefined;
    return sendJson(res, 503, { error: "无法连接本机 MongoDB，请确认服务已启动", detail: error.message });
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);

  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  try {
    const file = await readFile(join(root, safePath));
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(safePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`个人导航站已启动：http://localhost:${port}`);
  console.log(`MongoDB：${mongoUri}${dbName}`);
});

process.on("SIGINT", async () => {
  await client?.close();
  server.close(() => process.exit(0));
});
