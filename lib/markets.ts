export type MarketKind = "spot" | "crypto-perp" | "stock-perp" | "commodity-perp" | "forex-perp" | "tradfi-perp";
export type MarketSource = "spot" | "futures";
export type MarketView = "watchlist" | MarketKind;
export type ChartInterval = "5m" | "1h" | "4h" | "1d";
export interface Instrument { id: string; symbol: string; base: string; kind: MarketKind }
export interface Quote { symbol: string; price: number; change: number; high: number; low: number; volume: number; time: number }
export interface Point { time: number; price: number }
export interface MarketSettings { favorites: string[]; tags: Record<string, string[]>; tagOrder?: string[]; displayMode?: "table" | "cards"; view: MarketView; autoRefresh: boolean }
export interface MarketSnapshot { instruments: Instrument[]; quotes: Record<string, Quote>; fetchedAt: number }
export interface ChartSnapshot { points: Point[]; fetchedAt: number }

export const MARKET_LABELS: Record<MarketKind, string> = { spot: "加密现货", "crypto-perp": "加密永续", "stock-perp": "股票永续", "commodity-perp": "商品永续", "forex-perp": "外汇永续", "tradfi-perp": "其他 TradFi 永续" };
const FUTURES_KINDS: Record<string, MarketKind> = { COIN: "crypto-perp", EQUITY: "stock-perp", HK_EQUITY: "stock-perp", KR_EQUITY: "stock-perp", CN_EQUITY: "stock-perp", COMMODITY: "commodity-perp", FX: "forex-perp" };
export const DEFAULT_SETTINGS: MarketSettings = { favorites: [], tags: {}, view: "watchlist", autoRefresh: true };
export const sourceFor = (kind: MarketKind): MarketSource => kind === "spot" ? "spot" : "futures";
export const binanceMarketUrl = (instrument: Instrument): string => instrument.kind === "spot"
  ? `https://www.binance.com/en/trade/${encodeURIComponent(instrument.base)}_USDT?type=spot`
  : `https://www.binance.com/en/futures/${encodeURIComponent(instrument.symbol)}`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("行情数据格式异常");
  return value as Record<string, unknown>;
}
function numeric(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") throw new Error("行情数字格式异常");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("行情数字格式异常");
  return number;
}

export function parseInstruments(value: unknown, source: MarketSource): Instrument[] {
  const symbols = record(value).symbols;
  if (!Array.isArray(symbols)) throw new Error("交易对列表格式异常");
  return symbols.flatMap((value): Instrument[] => {
    const item = record(value);
    if (item.status !== "TRADING" || item.quoteAsset !== "USDT" || typeof item.symbol !== "string" || typeof item.baseAsset !== "string") return [];
    if (source === "spot" && item.isSpotTradingAllowed !== true) return [];
    if (source === "futures" && !["PERPETUAL", "TRADIFI_PERPETUAL"].includes(String(item.contractType))) return [];
    const kind: MarketKind | undefined = source === "spot" ? "spot" : Object.hasOwn(FUTURES_KINDS, String(item.underlyingType)) ? FUTURES_KINDS[String(item.underlyingType)] : item.contractType === "TRADIFI_PERPETUAL" ? "tradfi-perp" : undefined;
    if (!kind) return [];
    return [{ id: `${kind}:${item.symbol}`, symbol: item.symbol, base: item.baseAsset, kind }];
  });
}

export function parseQuotes(value: unknown): Record<string, Quote> {
  if (!Array.isArray(value)) throw new Error("行情列表格式异常");
  const result: Record<string, Quote> = {};
  for (const valueItem of value) {
    const item = record(valueItem);
    if (typeof item.symbol !== "string") continue;
    try {
      const quote = { symbol: item.symbol, price: numeric(item.lastPrice), change: numeric(item.priceChangePercent), high: numeric(item.highPrice), low: numeric(item.lowPrice), volume: numeric(item.quoteVolume), time: numeric(item.closeTime) };
      if (quote.price > 0 && quote.time > 0) result[item.symbol] = quote;
    } catch { /* An incomplete instrument must not hide the remaining market. */ }
  }
  if (!Object.keys(result).length) throw new Error("没有收到有效行情");
  return result;
}

export function parsePoints(value: unknown): Point[] {
  if (!Array.isArray(value) || !value.length) throw new Error("暂无走势数据");
  return value.map((row) => {
    if (!Array.isArray(row) || row.length < 5) throw new Error("走势数据格式异常");
    const point = { time: numeric(row[0]), price: numeric(row[4]) };
    if (point.price <= 0 || point.time <= 0) throw new Error("走势数据格式异常");
    return point;
  });
}

export function normalizeMarketTags(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) throw new Error("标签格式不正确");
  const tags = [...new Set((value as string[]).map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 10 || tags.some((tag) => tag.length > 20 || /[\r\n,，、]/.test(tag))) throw new Error("每个条目最多 10 个标签，每个标签最多 20 个字符");
  return tags;
}

export function parseSettings(value: unknown): MarketSettings {
  const item = record(value);
  if (!Array.isArray(item.favorites) || item.favorites.length > 200) throw new Error("自选备份格式不正确");
  // Migrate retired Stocks entries without discarding the remaining watchlist.
  const supported = item.favorites.filter((id) => typeof id !== "string" || !/^stock-spot:[A-Z0-9.-]{1,40}$/.test(id));
  if (!supported.every((id) => typeof id === "string" && /^(spot|crypto-perp|stock-perp|commodity-perp|forex-perp|tradfi-perp):[A-Z0-9_]{2,40}$/.test(id))) throw new Error("自选备份格式不正确");
  const favorites = [...new Set(supported as string[])];
  const rawTags = item.tags === undefined ? {} : record(item.tags);
  const tags = Object.fromEntries(favorites.map((id) => [id, normalizeMarketTags(rawTags[id] ?? [])]).filter(([, tags]) => tags.length));
  let tagOrder: string[] | undefined;
  if (item.tagOrder !== undefined) {
    if (!Array.isArray(item.tagOrder) || item.tagOrder.length > 2010 || !item.tagOrder.every((key) => typeof key === "string" && (key.startsWith("market:") && Object.hasOwn(MARKET_LABELS, key.slice(7)) || key.startsWith("custom:") && key.slice(7).trim().length > 0 && key.slice(7).length <= 20 && !/[\r\n,，、]/.test(key)))) throw new Error("标签顺序格式不正确");
    const available = new Set([...Object.keys(MARKET_LABELS).map((kind) => `market:${kind}`), ...Object.values(tags).flat().map((tag) => `custom:${tag}`)]);
    tagOrder = [...new Set(item.tagOrder as string[])].filter((key) => available.has(key));
  }
  return { favorites, tags, ...(tagOrder === undefined ? {} : { tagOrder }), ...(item.displayMode === undefined ? {} : { displayMode: item.displayMode === "cards" ? "cards" as const : "table" as const }), view: ["watchlist", ...Object.keys(MARKET_LABELS)].includes(String(item.view)) ? item.view as MarketView : "watchlist", autoRefresh: typeof item.autoRefresh === "boolean" ? item.autoRefresh : true };
}

export function mergeMarketSettings(current: MarketSettings, incoming: MarketSettings): MarketSettings {
  const favorites = [...new Set([...incoming.favorites, ...current.favorites])];
  if (favorites.length > 200) throw new Error("合并后超过 200 个自选，请先移除部分条目");
  const tags = Object.fromEntries(favorites.map((id) => [id, normalizeMarketTags([...(current.tags[id] ?? []), ...(incoming.tags[id] ?? [])])]));
  const tagOrder = incoming.tagOrder === undefined && current.tagOrder === undefined ? undefined : [...new Set([...(incoming.tagOrder ?? []), ...(current.tagOrder ?? [])])];
  return parseSettings({ ...incoming, favorites, tags, displayMode: incoming.displayMode ?? current.displayMode, ...(tagOrder === undefined ? {} : { tagOrder }) });
}

const ENDPOINTS = { spot: "https://data-api.binance.vision/api/v3", futures: "https://fapi.binance.com/fapi/v1" };
const blockedUntil: Partial<Record<MarketSource, number>> = {};

export async function requestMarket(source: MarketSource, path: string, signal: AbortSignal): Promise<unknown> {
  if ((blockedUntil[source] ?? 0) > Date.now()) throw new Error("请求频率受限，正在等待恢复，请稍后重试");
  let response: Response;
  try {
    response = await fetch(`${ENDPOINTS[source]}/${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]), credentials: "omit", cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("无法连接 Binance，请检查网络、所在地区的服务可用性或跨域限制");
  }
  if (response.status === 429 || response.status === 418) {
    const retry = response.headers.get("Retry-After");
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000;
    blockedUntil[source] = Date.now() + Math.max(Number.isFinite(delay) ? delay : 60_000, 60_000);
    throw new Error("Binance 请求频率受限，已暂停请求，稍后自动重试");
  }
  if (!response.ok) throw new Error(`Binance 返回 ${response.status}，请稍后重试`);
  const result: unknown = await response.json();
  if (result && typeof result === "object" && "code" in result && Number(result.code) < 0) throw new Error("Binance 暂不支持该交易对或请求");
  return result;
}
