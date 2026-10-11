import assert from "node:assert/strict";
import test from "node:test";
import { compressBackupJson, decompressBackupJson } from "../lib/backup-compression";
import { downloadLinksFromGitHub, uploadLinksToGitHub } from "../lib/github-sync";
import { createLinkExport } from "../lib/link-transfer";
import type { GitHubBackupSettings } from "../lib/indexed-db";
import type { NavigationNote } from "../lib/notes";

const settings: GitHubBackupSettings = { repository: "owner/repo", branch: "main", token: "test-token" };
const note: NavigationNote = { _id: "note-1", title: "普通笔记", content: "中文正文".repeat(100), tags: ["记录"], isDefault: true, order: 1, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };
const gzipPath = "/contents/qidian-navigation-backup.json.gz";
const jsonPath = "/contents/qidian-navigation-backup.json";

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
