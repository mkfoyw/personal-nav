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
