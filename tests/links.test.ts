import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLink, parseCategories } from "../lib/links";
import { createLinkExport, mergeImportedLinks, parseLinkImport } from "../lib/link-transfer";
import type { NavigationLink } from "../lib/links";

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

test("rejects unsafe URLs, invalid field types, and empty titles", () => {
  for (const patch of [{ url: "javascript:alert(1)" }, { url: "file:///tmp/test" }, { url: "nonsense" }, { title: " " }, { title: {} }, { categories: [7] }, { isDefault: "true" }, { note: "x".repeat(121) }]) {
    assert.throws(() => normalizeLink({ ...valid, ...patch }));
  }
  assert.throws(() => normalizeLink(null));
});

test("exports and imports validated navigation data", () => {
  const source: NavigationLink[] = [{
    ...normalizeLink(valid), _id: "link-1", order: 1,
    createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z",
  }];
  const exported = createLinkExport(source);
  assert.equal(exported.format, "qidian-navigation");
  assert.deepEqual(parseLinkImport(exported), source);
  assert.deepEqual(parseLinkImport(source), source);
});

test("import rejects malformed rows and merges duplicate URLs", () => {
  assert.throws(() => parseLinkImport({ nope: [] }));
  assert.throws(() => parseLinkImport({ links: [{ title: "坏链接", url: "javascript:alert(1)" }] }));
  const current = parseLinkImport([{ ...valid, _id: "current", note: "旧" }]);
  const imported = parseLinkImport([{ ...valid, _id: "imported", title: "新名称", note: "新" }]);
  const merged = mergeImportedLinks(current, imported);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]._id, "current");
  assert.equal(merged[0].title, "新名称");
});
