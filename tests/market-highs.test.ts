import assert from "node:assert/strict";
import test from "node:test";
import { drawdownFromHigh, fetchHistoricalHigh, validHistoricalHigh } from "../lib/market-highs";
import type { Instrument } from "../lib/markets";

const spot: Instrument = { id: "spot:BTCUSDT", kind: "spot", symbol: "BTCUSDT", base: "BTC" };
const gold: Instrument = { id: "commodity-perp:XAUUSDT", kind: "commodity-perp", symbol: "XAUUSDT", base: "XAU" };
const candle = (open: number, high: number | string) => [open, "1", high, "1", "1", "0", open + 1000];

test("drawdown measures the decline from a positive high, handles new highs and rejects unavailable prices", () => {
  assert.ok(Math.abs(drawdownFromHigh(70, 100)! + 30) < 1e-10);
  assert.equal(drawdownFromHigh(1, 2), -50);
  assert.equal(drawdownFromHigh(100, 100), 0);
  assert.equal(drawdownFromHigh(101, 100), 0);
  for (const [price, high] of [[undefined, 100], [70, undefined], [0, 100], [-1, 100], [1, 0], [1, NaN], [Infinity, 1], [1, Infinity]]) {
    assert.equal(drawdownFromHigh(price, high), undefined);
  }
});

test("historical cache validation rejects missing, non-positive or invalid ranges", () => {
  const valid = { high: 100, highTime: 10, firstOpenTime: 0, fetchedAt: 1000 };
  assert.equal(validHistoricalHigh(valid), true);
  for (const value of [null, {}, { ...valid, high: "100" }, { ...valid, high: 0 }, { ...valid, high: Infinity }, { ...valid, firstOpenTime: -1 }, { ...valid, highTime: -1 }, { ...valid, highTime: 1001 }, { ...valid, firstOpenTime: 11 }, { high: 100, firstOpenTime: 0, fetchedAt: 1000 }]) {
    assert.equal(validHistoricalHigh(value), false);
  }
});

test("ATH uses monthly candle highs including the current candle, isolated by spot and futures markets", async () => {
  const originalFetch = globalThis.fetch;
  const first = Date.UTC(2020, 0, 1), recent = Date.UTC(2026, 0, 1);
  const highDate = Date.UTC(2026, 0, 9);
  try {
    for (const instrument of [spot, gold]) {
      let calls = 0;
      globalThis.fetch = (async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.host, instrument.kind === "spot" ? "data-api.binance.vision" : "fapi.binance.com");
        assert.equal(url.searchParams.get("symbol"), instrument.symbol);
        if (url.searchParams.get("interval") === "1d") {
          assert.equal(url.searchParams.get("startTime"), String(recent));
          assert.equal(url.searchParams.get("endTime"), String(Date.UTC(2026, 1, 1) - 1));
          return Response.json([candle(recent, "100"), candle(highDate, "250")]);
        }
        assert.equal(url.searchParams.get("interval"), "1M");
        assert.equal(url.searchParams.get("limit"), "499");
        assert.ok(Number(url.searchParams.get("endTime")) >= recent);
        assert.equal(init?.credentials, "omit");
        return Response.json([candle(first, "200"), candle(recent, "250")]);
      }) as typeof fetch;
      const result = await fetchHistoricalHigh(instrument, new AbortController().signal);
      assert.equal(result.high, 250); // Closing prices in the same candles are only 1.
      assert.equal(result.firstOpenTime, first);
      assert.equal(result.highTime, highDate);
      assert.equal(validHistoricalHigh(result), true);
      assert.equal(calls, 2);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("full batches continue backwards and include older peaks outside the most recent batch", async () => {
  const originalFetch = globalThis.fetch;
  const recent = Array.from({ length: 499 }, (_, index) => candle(Date.UTC(1980, index, 1), 100));
  const oldest = Date.UTC(1979, 11, 1);
  let calls = 0;
  globalThis.fetch = (async (input) => {
    calls++;
    const query = new URL(String(input)).searchParams;
    if (query.get("interval") === "1d") {
      assert.equal(query.get("startTime"), String(oldest));
      return Response.json([candle(Date.UTC(1979, 11, 15), "900")]);
    }
    if (calls === 1) return Response.json(recent);
    assert.equal(query.get("endTime"), String(Number(recent[0][0]) - 1));
    return Response.json([candle(oldest, "900")]);
  }) as typeof fetch;
  try {
    const result = await fetchHistoricalHigh(spot, new AbortController().signal);
    assert.equal(result.high, 900);
    assert.equal(result.firstOpenTime, oldest);
    assert.equal(result.highTime, Date.UTC(1979, 11, 15));
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("incomplete history is never returned as a complete ATH after an older page fails", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1
    ? Response.json(Array.from({ length: 499 }, (_, index) => candle(Date.UTC(1980, index, 1), 100)))
    : new Response(null, { status: 500 })) as typeof fetch;
  try { await assert.rejects(fetchHistoricalHigh(spot, new AbortController().signal), /Binance 返回 500/); }
  finally { globalThis.fetch = originalFetch; }
});

test("empty, invalid, unordered or out-of-range history cannot produce a misleading ATH", async () => {
  const originalFetch = globalThis.fetch;
  const t = Date.UTC(2020, 0, 1);
  try {
    for (const rows of [[], {}, [candle(t, "bad")], [candle(t, 0)], [candle(t, null as unknown as number)], [candle(t, " ")], [candle(t, 2), candle(t, 3)], [candle(t + 1000, 2), candle(t, 3)], [candle(Date.now() + 60_000, 2)], [[t, 1, 2]]]) {
      globalThis.fetch = (async () => Response.json(rows)) as typeof fetch;
      await assert.rejects(fetchHistoricalHigh(spot, new AbortController().signal), /历史 K 线/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("cancellation before or during a history request prevents returning a snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const before = new AbortController();
  before.abort();
  let calls = 0;
  const during = new AbortController();
  globalThis.fetch = (async () => {
    calls++;
    during.abort();
    return Response.json([candle(Date.UTC(2020, 0, 1), 100)]);
  }) as typeof fetch;
  try {
    await assert.rejects(fetchHistoricalHigh(spot, before.signal), { name: "AbortError" });
    assert.equal(calls, 0);
    await assert.rejects(fetchHistoricalHigh(spot, during.signal), { name: "AbortError" });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("peak date comes from the first matching day in the earliest peak month", async () => {
  const originalFetch = globalThis.fetch;
  const month = Date.UTC(2025, 0, 1), firstDay = Date.UTC(2025, 0, 6);
  globalThis.fetch = (async (input) => {
    const query = new URL(String(input)).searchParams;
    if (query.get("interval") === "1M") return Response.json([candle(month, 250), candle(Date.UTC(2025, 2, 1), 250)]);
    assert.equal(query.get("startTime"), String(month));
    return Response.json([candle(month, 100), candle(firstDay, 250), candle(Date.UTC(2025, 0, 9), 250)]);
  }) as typeof fetch;
  try {
    const peak = await fetchHistoricalHigh(spot, new AbortController().signal);
    assert.equal(peak.highTime, firstDay);
    assert.notEqual(peak.highTime, month);
    assert.equal(peak.high, 250);
  } finally { globalThis.fetch = originalFetch; }
});

test("daily history must confirm the monthly high before assigning an occurrence date", async () => {
  const originalFetch = globalThis.fetch;
  const month = Date.UTC(2025, 0, 1);
  try {
    for (const days of [[], [candle(month, 99)], [candle(Date.UTC(2025, 1, 1), 100)]]) {
      globalThis.fetch = (async (input) => Response.json(new URL(String(input)).searchParams.get("interval") === "1M" ? [candle(month, 100)] : days)) as typeof fetch;
      await assert.rejects(fetchHistoricalHigh(spot, new AbortController().signal), /出现日期|历史 K 线/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("a new high between monthly and daily requests uses the newer price and its actual day", async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date(), month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  globalThis.fetch = (async (input) => Response.json([candle(month, new URL(String(input)).searchParams.get("interval") === "1M" ? 100 : 101)])) as typeof fetch;
  try {
    const peak = await fetchHistoricalHigh(spot, new AbortController().signal);
    assert.equal(peak.high, 101);
    assert.equal(peak.highTime, month);
    assert.equal(validHistoricalHigh(peak), true);
  } finally { globalThis.fetch = originalFetch; }
});
