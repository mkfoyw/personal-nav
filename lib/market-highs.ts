import { requestMarket, sourceFor, type Instrument } from "@/lib/markets";

export interface HistoricalHigh { high: number; highTime: number; firstOpenTime: number; fetchedAt: number }
const MONTHLY_LIMIT = 499;

export function validHistoricalHigh(value: unknown): value is HistoricalHigh {
  if (!value || typeof value !== "object") return false;
  const item = value as HistoricalHigh;
  return Number.isFinite(item.high) && item.high > 0 && Number.isSafeInteger(item.firstOpenTime) && item.firstOpenTime >= 0
    && Number.isSafeInteger(item.highTime) && item.highTime >= item.firstOpenTime
    && Number.isSafeInteger(item.fetchedAt) && item.fetchedAt >= item.highTime && item.fetchedAt > 0;
}

export function drawdownFromHigh(price: number | undefined, high: number | undefined): number | undefined {
  if (price === undefined || high === undefined || !Number.isFinite(price) || !Number.isFinite(high) || price <= 0 || high <= 0) return undefined;
  return Math.min(0, (price / high - 1) * 100);
}

function parseHighCandles(value: unknown, endTime: number, limit: number, startTime = 0): { time: number; high: number }[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error("历史 K 线格式异常");
  let previous = -1;
  return value.map((row) => {
    const time = Array.isArray(row) ? row[0] : undefined;
    const rawHigh = Array.isArray(row) ? row[2] : undefined;
    const high = typeof rawHigh === "number" || typeof rawHigh === "string" && rawHigh.trim() ? Number(rawHigh) : NaN;
    if (!Array.isArray(row) || row.length < 7 || !Number.isSafeInteger(time) || time < startTime || time <= previous || time > endTime || !Number.isFinite(high) || high <= 0) throw new Error("历史 K 线格式异常，无法确认历史最高价");
    previous = time;
    return { time, high };
  });
}

// Monthly highs include intramonth wicks. Walk backwards until history is exhausted,
// then inspect the peak month's daily candles to identify its actual UTC date.
export async function fetchHistoricalHigh(instrument: Instrument, signal: AbortSignal): Promise<HistoricalHigh> {
  const fetchedAt = Date.now();
  let endTime = fetchedAt, high = 0, highMonth = fetchedAt, firstOpenTime = fetchedAt, complete = false;
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const query = new URLSearchParams({ symbol: instrument.symbol, interval: "1M", limit: String(MONTHLY_LIMIT), endTime: String(endTime) });
    const value = await requestMarket(sourceFor(instrument.kind), `klines?${query}`, signal);
    signal.throwIfAborted();
    const rows = parseHighCandles(value, endTime, MONTHLY_LIMIT);
    if (!rows.length) {
      if (!high) throw new Error("暂无历史 K 线");
      complete = true;
      break;
    }
    for (const row of rows) {
      if (row.high > high || row.high === high && row.time < highMonth) {
        high = row.high;
        highMonth = row.time;
      }
    }
    firstOpenTime = rows[0].time;
    if (rows.length < MONTHLY_LIMIT || firstOpenTime === 0) { complete = true; break; }
    endTime = firstOpenTime - 1;
  }
  if (!complete) throw new Error("历史 K 线范围异常，无法确认完整历史");

  const month = new Date(highMonth);
  const monthEnd = Math.min(fetchedAt, Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) - 1);
  const query = new URLSearchParams({ symbol: instrument.symbol, interval: "1d", limit: "40", startTime: String(highMonth), endTime: String(monthEnd) });
  const value = await requestMarket(sourceFor(instrument.kind), `klines?${query}`, signal);
  signal.throwIfAborted();
  const days = parseHighCandles(value, monthEnd, 40, highMonth);
  // Accept a newer high in the currently open month; never assign a date to an unmatched price.
  const peak = days.reduce<{ time: number; high: number } | undefined>((best, day) => !best || day.high > best.high ? day : best, undefined);
  if (!peak || peak.high < high) throw new Error("历史最高价的出现日期暂时无法确认");
  return { high: peak.high, highTime: peak.time, firstOpenTime, fetchedAt };
}
