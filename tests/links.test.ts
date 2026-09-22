import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLink, parseCategories } from "../lib/links";
import { apiError, checkOrigin, readJson } from "../lib/api";

const valid = { title: "测试", url: "https://example.com", categories: ["开发"] };

test("supports legacy category and normalizes whitespace and URL", () => {
  const result = normalizeLink({ title: " GitHub ", url: "https://github.com", category: "开发，效率", isDefault: true });
  assert.deepEqual(result.categories, ["开发", "效率"]);
  assert.equal(result.title, "GitHub");
  assert.equal(result.url, "https://github.com/");
  assert.equal(result.isDefault, true);
});

test("deduplicates categories and supports Chinese delimiters", () => {
  assert.deepEqual(parseCategories("效率、开发，效率, AI 工具"), ["效率", "开发", "AI 工具"]);
  assert.deepEqual(parseCategories(" , "), ["其他"]);
  assert.throws(() => parseCategories(Array.from({ length: 11 }, (_, i) => String(i))));
  assert.throws(() => parseCategories(["a".repeat(31)]));
});

test("rejects unsafe URLs, invalid field types, invalid colors, and empty titles", () => {
  for (const patch of [{ url: "javascript:alert(1)" }, { url: "file:///tmp/test" }, { url: "nonsense" }, { title: " " }, { title: {} }, { categories: [7] }, { isDefault: "true" }, { color: "__proto__" }, { note: "x".repeat(121) }]) {
    assert.throws(() => normalizeLink({ ...valid, ...patch }));
  }
  assert.throws(() => normalizeLink(null));
});

test("rejects untrusted browser origins before any database access", () => {
  assert.doesNotThrow(() => checkOrigin(new Request("http://localhost:8788/api/links", { headers: { origin: "http://localhost:8788" } })));
  assert.throws(() => checkOrigin(new Request("http://localhost:8788/api/links", { headers: { origin: "https://example.com" } })));
});

test("malformed and oversized bodies produce validation errors", async () => {
  for (const body of ["{", "x".repeat(128001)]) {
    try {
      await readJson(new Request("http://localhost/api/links", { method: "POST", body }));
      assert.fail("Expected a rejected request");
    } catch (error) { assert.equal(apiError(error).status, 400); }
  }
});
