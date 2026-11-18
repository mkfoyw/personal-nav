// A separate database keeps market caches independent of navigation backups.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("qidian-markets", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("data")) database.createObjectStore("data");
      const store = request.transaction!.objectStore("data");
      // Remove credentials and caches left by the retired Stocks integration.
      store.delete("stocks-api-key");
      store.delete("stocks-cache");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开行情本地存储"));
    request.onblocked = () => reject(new Error("行情本地存储被占用，请关闭旧页面后重试"));
  });
}

export async function readMarketData<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction("data").objectStore("data").get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(new Error("读取行情缓存失败"));
    });
  } finally { database.close(); }
}

export async function writeMarketData(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("data", "readwrite");
      const store = transaction.objectStore("data");
      store.put(value, key);
      // Chart history is bounded; keep the 20 most recently written series.
      if (key.startsWith("chart:")) {
        const request = store.get("chart-keys");
        request.onsuccess = () => {
          const previous: string[] = Array.isArray(request.result) ? request.result : [];
          const keys = [key, ...previous.filter((item) => item !== key)];
          keys.slice(20).forEach((item) => store.delete(item));
          store.put(keys.slice(0, 20), "chart-keys");
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("保存行情数据失败，可能是浏览器存储空间不足"));
      transaction.onabort = () => reject(new Error("保存行情数据已中止"));
    });
  } finally { database.close(); }
}
