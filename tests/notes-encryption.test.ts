import assert from "node:assert/strict";
import test from "node:test";
import { createLinkExport, parseLibraryImport } from "../lib/link-transfer";
import { protectNote, unlockNote, type NavigationNote, type NoteInput } from "../lib/notes";

const date = "2026-10-12T00:00:00.000Z";
const privateInput: NoteInput = { title: "私人标题", content: "秘密正文", tags: ["私人标签"], isDefault: false };
const plainInput: NoteInput = { title: "普通笔记", content: "公开正文", tags: ["普通"], isDefault: true };

test("only the selected note is encrypted in local storage and JSON backups", async () => {
  const protectedFields = await protectNote(privateInput, "a sufficiently long password", "private-1");
  const privateNote: NavigationNote = { ...protectedFields, _id: "private-1", order: 1, createdAt: date, updatedAt: date };
  const plainNote: NavigationNote = { ...plainInput, _id: "plain-1", order: 2, createdAt: date, updatedAt: date };
  const backup = JSON.stringify(createLinkExport([], [privateNote, plainNote]));

  assert.equal(backup.includes("私人标题"), false);
  assert.equal(backup.includes("秘密正文"), false);
  assert.equal(backup.includes("私人标签"), false);
  assert.equal(backup.includes("普通笔记"), true);
  assert.equal(backup.includes("公开正文"), true);
  const imported = parseLibraryImport(JSON.parse(backup));
  assert.deepEqual(imported.notes[0], privateNote);
  assert.deepEqual(imported.notes[1], plainNote);
  assert.deepEqual(await unlockNote(imported.notes[0], "a sufficiently long password"), privateInput);
  await assert.rejects(unlockNote(imported.notes[0], "incorrect password"), /密码错误/);
  await assert.rejects(unlockNote({ ...privateNote, _id: "another-id" }, "a sufficiently long password"), /密码错误/);
});

test("rejects short passwords and malformed encrypted notes", async () => {
  await assert.rejects(protectNote(privateInput, "short", "private-1"), /至少需要 12/);
  assert.throws(() => parseLibraryImport({ links: [], notes: [{ ...privateInput, _id: "bad", encrypted: { format: "wrong" } }] }), /加密数据格式无效/);
});
