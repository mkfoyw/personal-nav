import assert from "node:assert/strict";
import test from "node:test";
import { createLinkExport, parseLibraryImport } from "../lib/link-transfer";
import { createSharedSalt, encryptText } from "../lib/encryption";
import { NOTE_ALL_VIEW, NOTE_DEFAULT_VIEW, NOTE_ENCRYPTED_VIEW, notesForView, protectNote, sharedSaltForNotes, unlockNote, type NavigationNote, type NoteInput } from "../lib/notes";

const date = "2026-10-12T00:00:00.000Z";
const privateInput: NoteInput = { title: "私人标题", content: "秘密正文", tags: ["私人标签"], isDefault: false };
const plainInput: NoteInput = { title: "普通笔记", content: "公开正文", tags: ["普通"], isDefault: true };

test("only the selected note is encrypted in local storage and JSON backups", async () => {
  const protectedFields = await protectNote(privateInput, "a sufficiently long password", "private-1", createSharedSalt());
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
  await assert.rejects(protectNote(privateInput, "short", "private-1", createSharedSalt()), /至少需要 12/);
  assert.throws(() => parseLibraryImport({ links: [], notes: [{ ...privateInput, _id: "bad", encrypted: { format: "wrong" } }] }), /加密数据格式无效/);
});

test("encrypted notes appear only in the encrypted group, including after backup restore", async () => {
  const protectedFields = await protectNote({ ...privateInput, isDefault: true }, "a sufficiently long password", "private-1", createSharedSalt());
  const privateNote: NavigationNote = { ...protectedFields, _id: "private-1", order: 1, createdAt: date, updatedAt: date };
  const plainNote: NavigationNote = { ...plainInput, _id: "plain-1", order: 2, createdAt: date, updatedAt: date };
  const restored = parseLibraryImport(createLinkExport([], [privateNote, plainNote])).notes;

  assert.deepEqual(notesForView(restored, NOTE_ENCRYPTED_VIEW).map((note) => note._id), ["private-1"]);
  assert.deepEqual(notesForView(restored, NOTE_DEFAULT_VIEW).map((note) => note._id), ["plain-1"]);
  assert.deepEqual(notesForView(restored, NOTE_ALL_VIEW).map((note) => note._id), ["plain-1"]);
  assert.deepEqual(notesForView(restored, "tag:普通").map((note) => note._id), ["plain-1"]);
  assert.deepEqual(notesForView(restored, "tag:私人标签"), []);

  const unprotected = [{ ...privateNote, ...privateInput, encrypted: undefined }, plainNote];
  assert.deepEqual(notesForView(unprotected, NOTE_ENCRYPTED_VIEW), []);
  assert.deepEqual(notesForView(unprotected, NOTE_ALL_VIEW).map((note) => note._id), ["private-1", "plain-1"]);
});

test("encrypted notes share one salt and key while keeping separate nonces", async () => {
  const salt = createSharedSalt();
  const password = "one shared password for notes";
  const first: NavigationNote = { ...await protectNote(privateInput, password, "private-1", salt), _id: "private-1", order: 1, createdAt: date, updatedAt: date };
  const second: NavigationNote = { ...await protectNote({ ...privateInput, title: "另一篇" }, password, "private-2", salt), _id: "private-2", order: 2, createdAt: date, updatedAt: date };
  assert.equal(first.encrypted?.version, 2);
  assert.equal(second.encrypted?.version, 2);
  assert.equal(sharedSaltForNotes([first, second]), salt);
  assert.notEqual(first.encrypted?.iv, second.encrypted?.iv);
  assert.deepEqual(await unlockNote(first, password), privateInput);
  assert.equal((await unlockNote(second, password)).title, "另一篇");
  await assert.rejects(unlockNote(second, "a different password"), /密码错误/);

  const foreign: NavigationNote = { ...second, encrypted: { ...second.encrypted!, salt: createSharedSalt() } };
  assert.throws(() => sharedSaltForNotes([first, foreign]), /不同的加密密钥/);
});

test("legacy encrypted notes remain readable and can be converted to the shared key", async () => {
  const legacy: NavigationNote = {
    ...privateInput, title: "加密笔记", content: "", tags: [], _id: "legacy", order: 1, createdAt: date, updatedAt: date,
    encrypted: await encryptText(JSON.stringify(privateInput), "old private password", "qidian-note:legacy"),
  };
  assert.equal(legacy.encrypted?.version, 1);
  const content = await unlockNote(legacy, "old private password");
  const migrated: NavigationNote = { ...legacy, ...await protectNote(content, "new shared password", legacy._id, createSharedSalt()) };
  assert.equal(migrated.encrypted?.version, 2);
  assert.deepEqual(await unlockNote(migrated, "new shared password"), privateInput);
  await assert.rejects(unlockNote(migrated, "old private password"), /密码错误/);
});
