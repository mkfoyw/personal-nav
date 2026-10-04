import { normalizeLink, type NavigationLink } from "@/lib/links";
import { normalizeNote, type NavigationNote } from "@/lib/notes";

export const EXPORT_FORMAT = "qidian-navigation";
export const EXPORT_VERSION = 2;

export interface LinkExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  links: NavigationLink[];
  notes: NavigationNote[];
  categoryOrder?: string[];
}

export interface LibraryImport {
  links: NavigationLink[];
  notes: NavigationNote[];
  categoryOrder?: string[];
}

export function createLinkExport(links: NavigationLink[], notes: NavigationNote[] = [], categoryOrder: string[] = []): LinkExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    links,
    notes,
    categoryOrder,
  };
}

export function parseLinkImport(value: unknown): NavigationLink[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { links?: unknown }).links)
      ? (value as { links: unknown[] }).links
      : null;
  if (!rows) throw new Error("请选择有效的栖点 JSON 备份文件");

  const now = new Date().toISOString();
  const seenIds = new Set<string>();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`第 ${index + 1} 条链接格式无效`);
    try {
      const source = row as Record<string, unknown>;
      const normalized = normalizeLink(source);
      let id = typeof source._id === "string" && source._id.trim() ? source._id.trim() : crypto.randomUUID();
      if (seenIds.has(id)) id = crypto.randomUUID();
      seenIds.add(id);
      return {
        ...normalized,
        _id: id,
        order: typeof source.order === "number" && Number.isFinite(source.order) ? source.order : index,
        createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
        updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
      };
    } catch (error) {
      throw new Error(`第 ${index + 1} 条链接无效：${error instanceof Error ? error.message : "格式错误"}`);
    }
  });
}

export function parseLibraryImport(value: unknown): LibraryImport {
  const links = parseLinkImport(value);
  const rows = value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { notes?: unknown }).notes)
    ? (value as { notes: unknown[] }).notes
    : [];
  const now = new Date().toISOString();
  const seenIds = new Set<string>();
  const notes = rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`第 ${index + 1} 篇笔记格式无效`);
    try {
      const source = row as Record<string, unknown>;
      const normalized = normalizeNote(source);
      let id = typeof source._id === "string" && source._id.trim() ? source._id.trim() : crypto.randomUUID();
      if (seenIds.has(id)) id = crypto.randomUUID();
      seenIds.add(id);
      return {
        ...normalized,
        _id: id,
        order: typeof source.order === "number" && Number.isFinite(source.order) ? source.order : index,
        createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
        updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
      };
    } catch (error) {
      throw new Error(`第 ${index + 1} 篇笔记无效：${error instanceof Error ? error.message : "格式错误"}`);
    }
  });
  const rawOrder = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { categoryOrder?: unknown }).categoryOrder : undefined;
  if (rawOrder !== undefined && (!Array.isArray(rawOrder) || rawOrder.some((name) => typeof name !== "string" || !name.trim() || name.length > 30))) {
    throw new Error("备份中的分组顺序格式无效");
  }
  return { links, notes, ...(rawOrder === undefined ? {} : { categoryOrder: [...new Set(rawOrder as string[])] }) };
}

export function mergeImportedLinks(current: NavigationLink[], imported: NavigationLink[]): NavigationLink[] {
  const result = [...current];
  const byId = new Map(result.map((link, index) => [link._id, index]));
  const byUrl = new Map(result.map((link, index) => [link.url, index]));
  for (const link of imported) {
    const existingIndex = byId.get(link._id) ?? byUrl.get(link.url);
    if (existingIndex === undefined) {
      const index = result.length;
      result.push(link);
      byId.set(link._id, index);
      byUrl.set(link.url, index);
    } else {
      const existing = result[existingIndex];
      result[existingIndex] = { ...link, _id: existing._id, createdAt: existing.createdAt || link.createdAt };
      byId.set(existing._id, existingIndex);
      byUrl.set(link.url, existingIndex);
    }
  }
  return result;
}

export function mergeImportedNotes(current: NavigationNote[], imported: NavigationNote[]): NavigationNote[] {
  const result = [...current];
  const byId = new Map(result.map((note, index) => [note._id, index]));
  for (const note of imported) {
    const existingIndex = byId.get(note._id);
    if (existingIndex === undefined) {
      byId.set(note._id, result.length);
      result.push(note);
    } else {
      const existing = result[existingIndex];
      result[existingIndex] = { ...note, order: existing.order, createdAt: existing.createdAt || note.createdAt };
    }
  }
  return result;
}
