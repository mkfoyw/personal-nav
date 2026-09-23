import { defaultLinks, normalizeLink, type LinkInput, type NavigationLink } from "@/lib/links";
import { mergeImportedLinks } from "@/lib/link-transfer";

const DATABASE_NAME = "qidian-personal-nav";
const DATABASE_VERSION = 1;
const LINKS_STORE = "links";
const META_STORE = "meta";

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
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LINKS_STORE)) database.createObjectStore(LINKS_STORE, { keyPath: "_id" });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" });
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
