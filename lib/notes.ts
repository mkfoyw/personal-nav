import { decryptText, encryptSharedText, isEncryptedData, type EncryptedData } from "@/lib/encryption";

export interface NoteInput {
  title: string;
  content: string;
  tags: string[];
  isDefault: boolean;
}

export interface NavigationNote extends NoteInput {
  _id: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  encrypted?: EncryptedData;
}

export const LOCKED_NOTE_TITLE = "加密笔记";
export const NOTE_DEFAULT_VIEW = "view:notes-default";
export const NOTE_ALL_VIEW = "view:notes-all";
export const NOTE_ENCRYPTED_VIEW = "view:notes-encrypted";

export function notesForView(notes: NavigationNote[], view: string): NavigationNote[] {
  return notes.filter((note) => {
    if (view === NOTE_ENCRYPTED_VIEW) return Boolean(note.encrypted);
    if (note.encrypted) return false;
    if (view === NOTE_ALL_VIEW) return true;
    if (view === NOTE_DEFAULT_VIEW) return note.isDefault !== false;
    return view.startsWith("tag:") && note.tags.includes(view.slice(4));
  });
}

export function sharedSaltForNotes(notes: NavigationNote[]): string | undefined {
  const salts = [...new Set(notes.filter((note) => note.encrypted?.version === 2).map((note) => note.encrypted!.salt))];
  if (salts.length > 1) throw new Error("备份中包含不同的加密密钥，无法合并加密笔记");
  return salts[0];
}

export async function protectNote(input: NoteInput, password: string, id: string, sharedSalt: string): Promise<NoteInput & { encrypted: EncryptedData }> {
  const normalized = normalizeNote(input);
  const encrypted = await encryptSharedText(JSON.stringify(normalized), password, `qidian-note:${id}`, sharedSalt);
  return { title: LOCKED_NOTE_TITLE, content: "", tags: [], isDefault: normalized.isDefault, encrypted };
}

export async function unlockNote(note: NavigationNote, password: string): Promise<NoteInput> {
  if (!note.encrypted) return normalizeNote(note);
  const text = await decryptText(note.encrypted, password, `qidian-note:${note._id}`);
  try { return normalizeNote(JSON.parse(text)); }
  catch { throw new Error("解密后的笔记格式无效"); }
}

export function normalizeStoredNote(value: Record<string, unknown>): Pick<NavigationNote, "title" | "content" | "tags" | "isDefault" | "encrypted"> {
  if (value.encrypted === undefined) return normalizeNote(value);
  if (!isEncryptedData(value.encrypted)) throw new Error("笔记加密数据格式无效");
  if (value.isDefault !== undefined && typeof value.isDefault !== "boolean") throw new Error("默认分组设置无效");
  return { title: LOCKED_NOTE_TITLE, content: "", tags: [], isDefault: value.isDefault !== false, encrypted: value.encrypted };
}

export function parseNoteTags(value: string | string[]): string[] {
  const tags = [...new Set((Array.isArray(value) ? value : value.split(/[,，、]/))
    .map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 20) throw new Error("每篇笔记最多添加 20 个标签");
  if (tags.some((tag) => tag.length > 30)) throw new Error("每个标签不能超过 30 个字符");
  return tags;
}

export function normalizeNote(value: unknown): NoteInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("笔记格式无效");
  const input = value as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim()) throw new Error("笔记标题不能为空");
  if (input.title.trim().length > 120) throw new Error("笔记标题不能超过 120 个字符");
  if (input.content !== undefined && typeof input.content !== "string") throw new Error("笔记内容必须是文本");
  const content = (input.content as string | undefined) ?? "";
  if (content.length > 100_000) throw new Error("笔记内容不能超过 100,000 个字符");
  const tags = input.tags ?? [];
  if (typeof tags !== "string" && !(Array.isArray(tags) && tags.every((tag) => typeof tag === "string"))) {
    throw new Error("标签格式无效");
  }
  if (input.isDefault !== undefined && typeof input.isDefault !== "boolean") throw new Error("默认分组设置无效");
  return { title: input.title.trim(), content, tags: parseNoteTags(tags as string | string[]), isDefault: input.isDefault !== false };
}
