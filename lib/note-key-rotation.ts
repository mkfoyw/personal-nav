import { createSharedSalt } from "@/lib/encryption";
import { protectNote, sharedSaltForNotes, unlockNote, type NavigationNote } from "@/lib/notes";

export async function rotateEncryptedNotes(
  notes: NavigationNote[],
  currentPassword: string,
  newPassword: string,
  updatedAt = new Date().toISOString(),
): Promise<NavigationNote[]> {
  if (notes.some((note) => note.encrypted?.version === 1)) throw new Error("存在旧版逐篇加密笔记，无法统一迁移");
  const encrypted = notes.filter((note) => note.encrypted?.version === 2);
  if (!encrypted.length) throw new Error("没有需要迁移的加密笔记");
  if (newPassword.length < 12) throw new Error("新密码至少需要 12 个字符");
  if (newPassword === currentPassword) throw new Error("新密码不能与当前共用密码相同");
  const currentSalt = sharedSaltForNotes(notes);

  const decrypted = new Map<string, Awaited<ReturnType<typeof unlockNote>>>();
  for (const note of encrypted) {
    if (!currentPassword) throw new Error("请先解锁共用密码");
    try { decrypted.set(note._id, await unlockNote(note, currentPassword)); }
    catch { throw new Error("当前共用密码错误或加密数据已损坏"); }
  }

  let newSalt = createSharedSalt();
  while (newSalt === currentSalt) newSalt = createSharedSalt();
  const rotated = new Map<string, NavigationNote>();
  for (const note of encrypted) {
    const input = decrypted.get(note._id)!;
    rotated.set(note._id, { ...note, ...await protectNote(input, newPassword, note._id, newSalt), updatedAt });
  }
  return notes.map((note) => rotated.get(note._id) ?? note);
}
