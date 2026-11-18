import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, mergeMarketSettings, normalizeMarketTags, parseInstruments, parsePoints, parseQuotes, parseSettings, requestMarket } from "../lib/markets";

test("futures classification excludes dated contracts, inactive and non-USDT instruments", () => {
  const symbol = { status: "TRADING", quoteAsset: "USDT", contractType: "TRADIFI_PERPETUAL", symbol: "NVDAUSDT", baseAsset: "NVDA", underlyingType: "EQUITY" };
  const items = parseInstruments({ symbols: [symbol, { ...symbol, symbol: "BTCUSDT", baseAsset: "BTC", underlyingType: "COIN", contractType: "PERPETUAL" }, { ...symbol, contractType: "CURRENT_QUARTER" }, { ...symbol, status: "SETTLING" }, { ...symbol, quoteAsset: "USD1" }] }, "futures");
  assert.deepEqual(items.map((item) => item.id), ["stock-perp:NVDAUSDT", "crypto-perp:BTCUSDT"]);
});

test("XAU and other TradFi perpetuals use their actual underlying class and keep stable stock identities", () => {
  const base = { status: "TRADING", quoteAsset: "USDT", contractType: "TRADIFI_PERPETUAL" };
  const fixtures = [
    ["XAU", "COMMODITY", "commodity-perp"], ["XAG", "COMMODITY", "commodity-perp"],
    ["XPT", "COMMODITY", "commodity-perp"], ["XPD", "COMMODITY", "commodity-perp"],
    ["NVDA", "EQUITY", "stock-perp"], ["HK0700", "HK_EQUITY", "stock-perp"],
    ["SAMSUNG", "KR_EQUITY", "stock-perp"], ["CXMT", "CN_EQUITY", "stock-perp"],
    ["USDBRL", "FX", "forex-perp"], ["OPENAI", "PREMARKET", "tradfi-perp"], ["NEW", "FUTURE_CLASS", "tradfi-perp"],
  ];
  const instruments = parseInstruments({ symbols: fixtures.map(([asset, underlyingType]) => ({ ...base, symbol: `${asset}USDT`, baseAsset: asset, underlyingType })) }, "futures");
  assert.deepEqual(instruments.map((item) => item.id), fixtures.map(([asset, , kind]) => `${kind}:${asset}USDT`));
  const backup = parseSettings({ favorites: instruments.map((item) => item.id), tags: { "commodity-perp:XAUUSDT": ["贵金属"] }, view: "commodity-perp" });
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(backup))), backup);
  assert.deepEqual(parseInstruments({ symbols: [{ ...base, contractType: "PERPETUAL", underlyingType: "UNKNOWN", symbol: "BADUSDT", baseAsset: "BAD" }] }, "futures"), []);
});

test("spot instruments require explicit permission and remain distinct from perpetuals", () => {
  const symbol = { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING", isSpotTradingAllowed: true };
  assert.deepEqual(parseInstruments({ symbols: [symbol, { ...symbol, isSpotTradingAllowed: false }] }, "spot").map((item) => item.id), ["spot:BTCUSDT"]);
  assert.throws(() => parseInstruments({}, "spot"));
});

test("quote parsing isolates invalid rows and rejects empty feeds", () => {
  const valid = { symbol: "BTCUSDT", lastPrice: "64000.12", priceChangePercent: "-1.2", highPrice: "65000", lowPrice: "63000", quoteVolume: "1000000", closeTime: 1795000000000 };
  const result = parseQuotes([valid, { ...valid, symbol: "BADUSDT", lastPrice: "NaN" }]);
  assert.equal(result.BTCUSDT.price, 64000.12);
  assert.equal(result.BTCUSDT.change, -1.2);
  assert.equal(result.BADUSDT, undefined);
  assert.throws(() => parseQuotes([{ ...valid, lastPrice: "" }]));
});

test("K lines use open timestamp and close price, rejecting malformed or non-positive prices", () => {
  assert.deepEqual(parsePoints([[1795000000000, "1", "3", "1", "2", "100"]]), [{ time: 1795000000000, price: 2 }]);
  assert.throws(() => parsePoints([[1795000000000, 1, 1, 0, -1]]));
  assert.throws(() => parsePoints([]));
});

test("watchlist import distinguishes markets and validates untrusted data", () => {
  assert.deepEqual(parseSettings({ favorites: ["spot:BTCUSDT", "crypto-perp:BTCUSDT", "spot:BTCUSDT"], view: "invalid", autoRefresh: false }), { favorites: ["spot:BTCUSDT", "crypto-perp:BTCUSDT"], tags: {}, view: "watchlist", autoRefresh: false });
  assert.deepEqual(parseSettings({ favorites: [] }).favorites, []);
  assert.throws(() => parseSettings({ favorites: ["spot:BTCUSDT?url=bad"] }));
  assert.throws(() => parseSettings({ favorites: Array(201).fill("spot:BTCUSDT") }));
});

test("legacy watchlists retain saved items and start without tags; new users start empty", () => {
  const saved = parseSettings({ favorites: ["stock-perp:NVDAUSDT"], view: "stock-perp", autoRefresh: false });
  assert.deepEqual(saved, { favorites: ["stock-perp:NVDAUSDT"], tags: {}, view: "stock-perp", autoRefresh: false });
  assert.deepEqual(DEFAULT_SETTINGS.favorites, []);
  assert.deepEqual(parseSettings({ favorites: [], tags: { "spot:BTCUSDT": ["旧标签"] } }).tags, {});
});

test("retired stock spot entries are removed without resetting crypto or equity perpetual favorites", () => {
  const saved = parseSettings({ favorites: ["stock-spot:AAPL", "spot:BTCUSDT", "stock-perp:NVDAUSDT"], tags: { "stock-spot:AAPL": ["退休"], "spot:BTCUSDT": ["长期"] }, view: "stock-spot", autoRefresh: false });
  assert.deepEqual(saved, { favorites: ["spot:BTCUSDT", "stock-perp:NVDAUSDT"], tags: { "spot:BTCUSDT": ["长期"] }, view: "watchlist", autoRefresh: false });
  assert.deepEqual(parseSettings({ favorites: ["stock-spot:BRK.B"] }).favorites, []);
  assert.throws(() => parseSettings({ favorites: ["stock-spot:AAPL?key=invalid"] }));
});

test("tags normalize whitespace and duplicates while rejecting malformed and excessive input", () => {
  assert.deepEqual(normalizeMarketTags([" AI ", "科技", "AI", " "]), ["AI", "科技"]);
  for (const invalid of [[42], "AI", ["a".repeat(21)], Array.from({ length: 11 }, (_, index) => `标签${index}`), ["AI,科技"]]) assert.throws(() => normalizeMarketTags(invalid));
  assert.throws(() => parseSettings({ favorites: ["spot:BTCUSDT"], tags: { "spot:BTCUSDT": "错误" } }));
});

test("tagged backups round trip and merge without losing local labels or confusing spot and perpetual", () => {
  const current = parseSettings({ favorites: ["spot:BTCUSDT"], tags: { "spot:BTCUSDT": ["长期", "代币"] } });
  const incoming = parseSettings({ favorites: ["spot:BTCUSDT", "crypto-perp:BTCUSDT"], tags: { "spot:BTCUSDT": ["长期", "观察"], "crypto-perp:BTCUSDT": ["合约"] }, autoRefresh: false });
  const merged = mergeMarketSettings(current, incoming);
  assert.deepEqual(merged.favorites, ["spot:BTCUSDT", "crypto-perp:BTCUSDT"]);
  assert.deepEqual(merged.tags, { "spot:BTCUSDT": ["长期", "代币", "观察"], "crypto-perp:BTCUSDT": ["合约"] });
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(merged))), merged);
  assert.deepEqual(mergeMarketSettings(current, parseSettings({ favorites: ["spot:BTCUSDT"] })).tags, current.tags);
  const full = parseSettings({ favorites: Array.from({ length: 200 }, (_, index) => `spot:T${index}USDT`) });
  assert.throws(() => mergeMarketSettings(full, incoming), /200/);
});

test("import restores the backup's custom order and appends local-only favorites", () => {
  const local = parseSettings({ favorites: ["spot:BTCUSDT", "stock-perp:NVDAUSDT", "spot:ETHUSDT", "crypto-perp:BTCUSDT"] });
  const backup = parseSettings({ favorites: ["spot:ETHUSDT", "spot:BTCUSDT", "stock-perp:NVDAUSDT"] });
  const merged = mergeMarketSettings(local, backup);
  assert.deepEqual(merged.favorites, ["spot:ETHUSDT", "spot:BTCUSDT", "stock-perp:NVDAUSDT", "crypto-perp:BTCUSDT"]);
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(merged))).favorites, merged.favorites);
});

test("system and custom tag order survive backup round trips and prune removed tags", () => {
  const saved = parseSettings({ favorites: ["spot:BTCUSDT"], tags: { "spot:BTCUSDT": ["存储", "指数ETF"] }, tagOrder: ["custom:指数ETF", "market:commodity-perp", "custom:存储", "market:spot", "custom:已删除", "market:spot"] });
  assert.deepEqual(saved.tagOrder, ["custom:指数ETF", "market:commodity-perp", "custom:存储", "market:spot"]);
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(saved))), saved);
  for (const tagOrder of ["invalid", [null], ["market:invalid"], ["custom:"], ["all"], Array(2011).fill("market:spot")]) assert.throws(() => parseSettings({ favorites: [], tagOrder }));
});

test("tag-order imports prefer backup order, retain local tags and accept old backups", () => {
  const local = parseSettings({ favorites: ["spot:BTCUSDT"], tags: { "spot:BTCUSDT": ["存储"] }, tagOrder: ["custom:存储", "market:spot", "market:stock-perp"] });
  const backup = parseSettings({ favorites: ["spot:ETHUSDT"], tags: { "spot:ETHUSDT": ["指数ETF"] }, tagOrder: ["market:stock-perp", "custom:指数ETF", "market:spot"] });
  const merged = mergeMarketSettings(local, backup);
  assert.deepEqual(merged.tagOrder, ["market:stock-perp", "custom:指数ETF", "market:spot", "custom:存储"]);
  assert.deepEqual(mergeMarketSettings(local, parseSettings({ favorites: [] })).tagOrder, local.tagOrder);
  assert.equal(parseSettings({ favorites: [] }).tagOrder, undefined);
});

test("card view preferences round trip without resetting old backups or local favorites", () => {
  const cards = parseSettings({ favorites: ["spot:BTCUSDT"], displayMode: "cards" });
  assert.equal(parseSettings(JSON.parse(JSON.stringify(cards))).displayMode, "cards");
  assert.equal(parseSettings({ favorites: [] }).displayMode, undefined);
  assert.equal(parseSettings({ favorites: [], displayMode: "invalid" }).displayMode, "table");
  assert.equal(mergeMarketSettings(cards, parseSettings({ favorites: [] })).displayMode, "cards");
  const restored = mergeMarketSettings(cards, parseSettings({ favorites: ["commodity-perp:XAUUSDT"], displayMode: "table" }));
  assert.equal(restored.displayMode, "table");
  assert.deepEqual(restored.favorites, ["commodity-perp:XAUUSDT", "spot:BTCUSDT"]);
});

test("public requests omit credentials and pause after rate limits", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://data-api.binance.vision/api/v3/ticker/24hr");
    assert.equal(init?.credentials, "omit");
    return new Response("{}", { status: 429, headers: { "Retry-After": "120" } });
  };
  try {
    await assert.rejects(requestMarket("spot", "ticker/24hr", new AbortController().signal), /频率受限/);
    await assert.rejects(requestMarket("spot", "ticker/24hr", new AbortController().signal), /频率受限/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
