export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiBase = typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8788/api"
    : "/api";
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload as T;
}
