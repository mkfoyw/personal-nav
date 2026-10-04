import { defaultLinks, normalizeLink, type LinkInput, type NavigationLink } from "@/lib/links";
import { mergeImportedLinks } from "@/lib/link-transfer";
import { normalizeNote, type NavigationNote, type NoteInput } from "@/lib/notes";

const DATABASE_NAME = "qidian-personal-nav";
const DATABASE_VERSION = 3;
const LINKS_STORE = "links";
const NOTES_STORE = "notes";
const META_STORE = "meta";

export async function getCategoryOrder(): Promise<string[]> {
  const database = await openDatabase();
  try {
    const row = await requestResult(database.transaction(META_STORE).objectStore(META_STORE).get("category-order") as IDBRequest<{ value: unknown } | undefined>);
    return Array.isArray(row?.value) ? row.value.filter((name): name is string => typeof name === "string") : [];
  } finally { database.close(); }
}

export async function saveCategoryOrder(names: string[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(META_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(META_STORE).put({ key: "category-order", value: [...new Set(names)] });
    await done;
  } finally { database.close(); }
}

export interface GitHubBackupSettings {
  repository: string;
  branch: string;
  token: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("浏览器存储操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("浏览器存储操作失败"));
    transaction.onabort = () => reject(transaction.error || new Error("浏览器存储操作已取消"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LINKS_STORE)) database.createObjectStore(LINKS_STORE, { keyPath: "_id" });
      if (!database.objectStoreNames.contains(NOTES_STORE)) database.createObjectStore(NOTES_STORE, { keyPath: "_id" });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" });
      if (event.oldVersion < 3) {
        const cursorRequest = request.transaction!.objectStore(NOTES_STORE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (typeof cursor.value.isDefault !== "boolean") cursor.update({ ...cursor.value, isDefault: true });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开浏览器存储"));
    request.onblocked = () => reject(new Error("浏览器存储正在被其他页面占用，请关闭旧页面后重试"));
  });
}

function sortLinks(links: NavigationLink[]) {
  return links.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export async function listLinks(): Promise<NavigationLink[]> {
  const database = await openDatabase();
  try {
    const rows = await requestResult(database.transaction(LINKS_STORE).objectStore(LINKS_STORE).getAll() as IDBRequest<NavigationLink[]>);
    return sortLinks(rows);
  } finally { database.close(); }
}

export async function listNotes(): Promise<NavigationNote[]> {
  const database = await openDatabase();
  try {
    const rows = await requestResult(database.transaction(NOTES_STORE).objectStore(NOTES_STORE).getAll() as IDBRequest<NavigationNote[]>);
    return rows.sort((left, right) => left.order - right.order);
  } finally { database.close(); }
}

export async function initializeLinks(): Promise<NavigationLink[]> {
  const existing = await listLinks();
  const database = await openDatabase();
  try {
    const initialized = await requestResult(database.transaction(META_STORE).objectStore(META_STORE).get("initialized") as IDBRequest<{ key: string; value: boolean } | undefined>);
    if (initialized?.value) return existing;
  } finally { database.close(); }
  if (existing.length) {
    await replaceLinks(existing);
    return existing;
  }
  const now = new Date().toISOString();
  const seeded = defaultLinks.map((link, index) => ({
    ...link,
    _id: `starter-${index + 1}`,
    order: index,
    createdAt: now,
    updatedAt: now,
  }));
  await replaceLinks(seeded);
  return seeded;
}

export async function createLink(input: LinkInput): Promise<NavigationLink> {
  const normalized = normalizeLink(input);
  const now = new Date().toISOString();
  const link: NavigationLink = {
    ...normalized,
    _id: crypto.randomUUID(),
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
  };
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(LINKS_STORE, "readwrite").objectStore(LINKS_STORE).add(link));
    return link;
  } finally { database.close(); }
}

export async function updateLink(id: string, input: LinkInput): Promise<NavigationLink> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(LINKS_STORE, "readwrite");
    const store = transaction.objectStore(LINKS_STORE);
    const current = await requestResult(store.get(id) as IDBRequest<NavigationLink | undefined>);
    if (!current) throw new Error("未找到这个链接");
    const updated: NavigationLink = { ...normalizeLink(input), _id: id, order: current.order, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    await requestResult(store.put(updated));
    return updated;
  } finally { database.close(); }
}

export async function deleteLink(id: string): Promise<void> {
  const database = await openDatabase();
  try { await requestResult(database.transaction(LINKS_STORE, "readwrite").objectStore(LINKS_STORE).delete(id)); }
  finally { database.close(); }
}

export async function createNote(input: NoteInput): Promise<NavigationNote> {
  const normalized = normalizeNote(input);
  const now = new Date().toISOString();
  const note: NavigationNote = { ...normalized, _id: crypto.randomUUID(), order: Date.now(), createdAt: now, updatedAt: now };
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(NOTES_STORE, "readwrite").objectStore(NOTES_STORE).add(note));
    return note;
  } finally { database.close(); }
}

export async function updateNote(id: string, input: NoteInput): Promise<NavigationNote> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTES_STORE, "readwrite");
    const store = transaction.objectStore(NOTES_STORE);
    const current = await requestResult(store.get(id) as IDBRequest<NavigationNote | undefined>);
    if (!current) throw new Error("未找到这篇笔记");
    const updated: NavigationNote = { ...normalizeNote(input), _id: id, order: current.order, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    await requestResult(store.put(updated));
    return updated;
  } finally { database.close(); }
}

export async function deleteNote(id: string): Promise<void> {
  const database = await openDatabase();
  try { await requestResult(database.transaction(NOTES_STORE, "readwrite").objectStore(NOTES_STORE).delete(id)); }
  finally { database.close(); }
}

export async function saveNoteOrder(ids: string[]): Promise<NavigationNote[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTES_STORE, "readwrite");
    const store = transaction.objectStore(NOTES_STORE);
    const notes = await requestResult(store.getAll() as IDBRequest<NavigationNote[]>);
    const byId = new Map(notes.map((note) => [note._id, note]));
    ids.forEach((id, order) => {
      const note = byId.get(id);
      if (note) store.put({ ...note, order });
    });
    await transactionDone(transaction);
    return notes.map((note) => ({ ...note, order: ids.indexOf(note._id) })).sort((left, right) => left.order - right.order);
  } finally { database.close(); }
}

export async function replaceLinks(links: NavigationLink[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LINKS_STORE, META_STORE], "readwrite");
    const store = transaction.objectStore(LINKS_STORE);
    store.clear();
    for (const link of links) store.put(link);
    transaction.objectStore(META_STORE).put({ key: "initialized", value: true });
    await transactionDone(transaction);
  } finally { database.close(); }
}

export async function replaceLibraryData(links: NavigationLink[], notes: NavigationNote[], categoryOrder?: string[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LINKS_STORE, NOTES_STORE, META_STORE], "readwrite");
    const linkStore = transaction.objectStore(LINKS_STORE);
    const noteStore = transaction.objectStore(NOTES_STORE);
    linkStore.clear();
    noteStore.clear();
    for (const link of links) linkStore.put(link);
    for (const note of notes) noteStore.put(note);
    if (categoryOrder !== undefined) transaction.objectStore(META_STORE).put({ key: "category-order", value: categoryOrder });
    transaction.objectStore(META_STORE).put({ key: "initialized", value: true });
    await transactionDone(transaction);
  } finally { database.close(); }
}

export async function importAndMergeLinks(imported: NavigationLink[]): Promise<NavigationLink[]> {
  const merged = mergeImportedLinks(await listLinks(), imported);
  await replaceLinks(merged);
  return sortLinks(merged);
}

export async function getGitHubBackupSettings(): Promise<GitHubBackupSettings | null> {
  const database = await openDatabase();
  try {
    const row = await requestResult(database.transaction(META_STORE).objectStore(META_STORE).get("github-backup") as IDBRequest<{ key: string; value: GitHubBackupSettings } | undefined>);
    return row?.value ?? null;
  } finally { database.close(); }
}

export async function saveGitHubBackupSettings(settings: GitHubBackupSettings): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({ key: "github-backup", value: settings });
    await transactionDone(transaction);
  } finally { database.close(); }
}

export async function clearGitHubBackupSettings(): Promise<void> {
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(META_STORE, "readwrite").objectStore(META_STORE).delete("github-backup"));
  } finally { database.close(); }
}
