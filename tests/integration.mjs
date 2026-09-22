import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";

// Never run mutation tests against the user's personal_nav database.
const databaseName = `qidian_test_${Date.now()}_${process.pid}`;
const port = Number(process.env.TEST_PORT || 8790);
const base = `http://127.0.0.1:${port}`;
const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 2500 });
let server;
let output = "";

async function start() {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, MONGODB_DB: databaseName }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (data) => { output += data; });
  server.stderr.on("data", (data) => { output += data; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      const result = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (result.ok) return;
    } catch { /* Wait for the test server. */ }
    await delay(100);
  }
  throw new Error(`Test server did not start: ${output}`);
}

async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
}

async function request(path, method = "GET", body, headers = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

try {
  // Refuse to attach to an unrelated running service on the test port.
  let occupied = false;
  try { await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* Available. */ }
  assert.equal(occupied, false, "TEST_PORT is already in use");
  await client.connect();
  await start();
  let result = await request("/links");
  assert.equal(result.data.links.length, 8, "new database receives starter links");

  const input = { title: "Integration test", url: "https://example.com", categories: ["测试", "开发", "测试"], note: "temporary", color: "cyan", isDefault: false };
  result = await request("/links", "POST", input);
  assert.equal(result.status, 201);
  const id = result.data.link._id;
  assert.deepEqual(result.data.link.categories, ["测试", "开发"]);
  assert.equal(result.data.link.isDefault, false);

  result = await request(`/links/${id}`, "PATCH", { title: "Updated" });
  assert.equal(result.data.link.title, "Updated");
  assert.equal(result.data.link.note, "temporary", "PATCH preserves omitted fields");
  assert.equal(result.data.link.isDefault, false);

  result = await request(`/links/${id}`, "PATCH", { category: "旧分类" });
  assert.deepEqual(result.data.link.categories, ["旧分类"]);
  assert.equal((await request("/links", "POST", { ...input, url: "javascript:alert(1)" })).status, 400);
  assert.equal((await request("/links", "POST", input, { Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await request("/links/invalid", "DELETE")).status, 400);
  assert.equal((await request(`/links/${id}`, "DELETE")).status, 200);
  assert.equal((await request(`/links/${id}`, "DELETE")).status, 404);

  const collection = client.db(databaseName).collection("links");
  await collection.insertOne({ title: "旧数据", url: "https://legacy.example", category: "旧分类", note: "", color: "blue", order: 90, createdAt: new Date(), updatedAt: new Date() });
  result = await request("/links");
  assert.deepEqual(result.data.links.find((link) => link.title === "旧数据").categories, ["旧分类"]);

  await collection.deleteMany({});
  await stop();
  await start();
  assert.equal((await request("/links")).data.links.length, 0, "empty collection stays empty after restart");
  console.log("PASS: seeding, CRUD, partial updates, legacy categories, validation, origin checks, and no reseeding after deletion.");
} finally {
  await stop();
  await client.db(databaseName).dropDatabase().catch(() => {});
  await client.close();
}
