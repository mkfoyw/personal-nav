import assert from "node:assert/strict";
import test from "node:test";
import { compressBackupJson, decompressBackupJson } from "../lib/backup-compression";
import { downloadLinksFromGitHub, downloadMarketsFromGitHub, uploadLinksToGitHub, uploadMarketsToGitHub } from "../lib/github-sync";
import { createLinkExport } from "../lib/link-transfer";
import type { GitHubBackupSettings } from "../lib/indexed-db";
import type { NavigationNote } from "../lib/notes";
import { createMarketExport, parseMarketImport } from "../lib/market-transfer";
import { DEFAULT_SETTINGS, type MarketSettings } from "../lib/markets";

const settings: GitHubBackupSettings = { repository: "owner/repo", branch: "main", token: "test-token" };
const note: NavigationNote = { _id: "note-1", title: "普通笔记", content: "中文正文".repeat(100), tags: ["记录"], isDefault: true, order: 1, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };
const gzipPath = "/contents/qidian-navigation-backup.json.gz";
const jsonPath = "/contents/qidian-navigation-backup.json";
const marketPath = "/contents/qidian-markets-backup.json.gz";
const markets: MarketSettings = {
  favorites: ["commodity-perp:XAUUSDT", "spot:BTCUSDT"],
  tags: { "commodity-perp:XAUUSDT": ["贵金属"], "spot:BTCUSDT": ["观察"] },
  tagOrder: ["custom:贵金属", "market:spot", "market:commodity-perp", "custom:观察"],
  displayMode: "cards", view: "watchlist", autoRefresh: false,
};

function fileResponse(bytes: Uint8Array) {
  return Response.json({ sha: "file-sha", encoding: "base64", content: Buffer.from(bytes).toString("base64") });
}

test("gzip backup round-trips Unicode JSON and rejects corrupt data", async () => {
  const text = JSON.stringify(createLinkExport([], [note]));
  const compressed = await compressBackupJson(text);
  assert.deepEqual([...compressed.slice(0, 2)], [0x1f, 0x8b]);
  assert.ok(compressed.byteLength < new TextEncoder().encode(text).byteLength);
  assert.equal(await decompressBackupJson(compressed), text);
  await assert.rejects(decompressBackupJson(new Uint8Array([0, 1, 2])), /压缩备份已损坏/);
});

test("GitHub upload writes gzip bytes to the new backup filename", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let uploaded: { content: string; branch: string; sha?: string } | undefined;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
    if (url.includes(gzipPath) && init?.method === "PUT") {
      uploaded = JSON.parse(String(init.body));
      return Response.json({ commit: { html_url: "https://github.com/owner/repo/commit/test" } });
    }
    if (url.includes(gzipPath)) return new Response(null, { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    await uploadLinksToGitHub(settings, [], [note], ["分类"]);
    assert.ok(uploaded);
    assert.equal(uploaded.branch, "main");
    assert.equal(uploaded.sha, undefined);
    const text = await decompressBackupJson(new Uint8Array(Buffer.from(uploaded.content, "base64")));
    const payload = JSON.parse(text);
    assert.deepEqual(payload.notes, [note]);
    assert.deepEqual(payload.categoryOrder, ["分类"]);
    assert.equal(requests.some((request) => request.includes(`${jsonPath}?`)), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("restore prefers compressed backup and falls back to the old JSON file", async () => {
  const originalFetch = globalThis.fetch;
  const json = JSON.stringify(createLinkExport([], [note]));
  const gzip = await compressBackupJson(json);
  try {
    for (const useCompressed of [true, false]) {
      const requests: string[] = [];
      globalThis.fetch = (async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
        if (url.includes(gzipPath)) return useCompressed ? fileResponse(gzip) : new Response(null, { status: 404 });
        if (url.includes(jsonPath)) return fileResponse(new TextEncoder().encode(json));
        throw new Error(`Unexpected request: ${url}`);
      }) as typeof fetch;
      const restored = await downloadLinksFromGitHub(settings);
      assert.deepEqual(restored.notes, [note]);
      assert.equal(requests.some((request) => request.includes(`${jsonPath}?`)), !useCompressed);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("corrupt compressed backup fails instead of restoring a stale JSON file", async () => {
  const originalFetch = globalThis.fetch;
  let legacyRequested = false;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
    if (url.includes(gzipPath)) return fileResponse(new Uint8Array([1, 2, 3]));
    if (url.includes(`${jsonPath}?`)) {
      legacyRequested = true;
      return fileResponse(new TextEncoder().encode(JSON.stringify(createLinkExport([], [note]))));
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    await assert.rejects(downloadLinksFromGitHub(settings), /压缩备份已损坏/);
    assert.equal(legacyRequested, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("market backup uploads compressed settings to its own file, supports updates and an empty watchlist", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const existing of [false, true]) {
      const source = existing ? DEFAULT_SETTINGS : markets;
      const settingsWithExtras = { ...source, token: "must-not-export", quotes: { BTCUSDT: 1 }, charts: [] };
      let uploaded: { content: string; branch: string; sha?: string } | undefined;
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
        assert.ok(url.includes(marketPath), "market operations must not touch navigation backup files");
        if (init?.method === "PUT") {
          uploaded = JSON.parse(String(init.body));
          return Response.json({ commit: { html_url: "https://github.com/owner/repo/commit/test" } });
        }
        assert.ok(url.includes("ref=main"));
        return existing ? fileResponse(await compressBackupJson(JSON.stringify(createMarketExport(markets)))) : new Response(null, { status: 404 });
      }) as typeof fetch;
      await uploadMarketsToGitHub(settings, settingsWithExtras);
      assert.ok(uploaded);
      assert.equal(uploaded.branch, "main");
      assert.equal(uploaded.sha, existing ? "file-sha" : undefined);
      const bytes = new Uint8Array(Buffer.from(uploaded.content, "base64"));
      assert.deepEqual([...bytes.slice(0, 2)], [0x1f, 0x8b]);
      const payload = JSON.parse(await decompressBackupJson(bytes));
      assert.deepEqual(payload, createMarketExport(source));
      assert.deepEqual(parseMarketImport(payload), source);
      assert.equal(JSON.stringify(payload).includes("must-not-export"), false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("market restore retains Unicode tags, both orders and view preferences without touching navigation files", async () => {
  const originalFetch = globalThis.fetch;
  const compressed = await compressBackupJson(JSON.stringify(createMarketExport(markets)));
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
    assert.ok(url.includes(marketPath));
    return fileResponse(compressed);
  }) as typeof fetch;
  try { assert.deepEqual(await downloadMarketsFromGitHub(settings), markets); }
  finally { globalThis.fetch = originalFetch; }
});

test("missing, corrupt and invalid market backups fail rather than falling back to navigation data", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const cases = [
      { response: new Response(null, { status: 404 }), error: /还没有备份文件/ },
      { response: fileResponse(new Uint8Array([1, 2, 3])), error: /压缩备份已损坏/ },
      { response: fileResponse(await compressBackupJson("{")), error: /不是有效 JSON/ },
      { response: fileResponse(await compressBackupJson(JSON.stringify(createLinkExport([], [note])))), error: /行情页导出/ },
      { response: fileResponse(await compressBackupJson(JSON.stringify({ app: "qidian-markets", version: 1, settings: { favorites: ["invalid"] } }))), error: /自选备份格式不正确/ },
    ];
    for (const entry of cases) {
      globalThis.fetch = (async (input) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) return Response.json({ private: true });
        assert.ok(url.includes(marketPath));
        return entry.response;
      }) as typeof fetch;
      await assert.rejects(downloadMarketsFromGitHub(settings), entry.error);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("market upload refuses public repositories and reports auth or write conflicts", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const failure of ["public", "auth", "conflict"] as const) {
      let writes = 0;
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) return failure === "auth" ? new Response(null, { status: 401 }) : Response.json({ private: failure !== "public" });
        assert.ok(url.includes(marketPath));
        if (init?.method === "PUT") { writes++; return new Response(null, { status: 409 }); }
        return new Response(null, { status: 404 });
      }) as typeof fetch;
      await assert.rejects(uploadMarketsToGitHub(settings, markets), failure === "public" ? /不是私有仓库/ : failure === "auth" ? /令牌无效/ : /刚刚发生变化/);
      assert.equal(writes, failure === "conflict" ? 1 : 0);
    }
  } finally { globalThis.fetch = originalFetch; }
});
