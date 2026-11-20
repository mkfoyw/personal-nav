"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHistoricalHigh, validHistoricalHigh, type HistoricalHigh } from "@/lib/market-highs";
import { readMarketData, writeMarketData } from "@/lib/market-storage";
import { type MarketKind, sourceFor } from "@/lib/markets";

export interface HighState { snapshot?: HistoricalHigh; loading: boolean; error: string }
const MAX_AGE = 3_600_000;

export function useMarketHighs(ids: string[], autoRefresh: boolean, refresh: number, observedHighs: Record<string, number> = {}) {
  const idsKey = [...new Set(ids)].sort().join("|");
  const observedKey = JSON.stringify(Object.entries(observedHighs).sort(([a], [b]) => a.localeCompare(b)));
  const [states, setStates] = useState<Record<string, HighState>>({});
  const memory = useRef<Record<string, HighState>>({});
  const lastRefresh = useRef(refresh);
  const observed = useRef<Record<string, number>>({});
  const updateHistory = useRef<(() => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    observed.current = JSON.parse(observedKey);
    if (autoRefresh) void updateHistory.current?.();
  }, [observedKey, autoRefresh]);

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    const requested = idsKey.split("|");
    const force = refresh !== lastRefresh.current;
    lastRefresh.current = refresh;
    let inFlight = false;

    function publish(id: string, state: HighState) {
      if (controller.signal.aborted) return;
      memory.current[id] = state;
      setStates((previous) => ({ ...previous, [id]: state }));
    }

    async function update(forceFetch = false) {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      let cursor = 0;
      const unavailable = new Map<string, string>();
      async function worker() {
        while (cursor < requested.length && !controller.signal.aborted) {
          const id = requested[cursor++];
          const [kind, symbol] = id.split(":") as [MarketKind, string];
          const source = sourceFor(kind);
          const remembered = memory.current[id]?.snapshot;
          let snapshot = validHistoricalHigh(remembered) ? remembered : undefined;
          if (!snapshot) {
            try {
              const saved = await readMarketData<unknown>(`ath:v2:${id}`);
              if (validHistoricalHigh(saved)) snapshot = saved;
            } catch { /* Historical prices still work when browser storage is unavailable. */ }
          }
          if (controller.signal.aborted) return;
          const newHigh = snapshot && (observed.current[id] ?? 0) > snapshot.high;
          if (document.hidden || !forceFetch && snapshot && !newHigh && Date.now() - snapshot.fetchedAt < MAX_AGE) {
            publish(id, { snapshot, loading: false, error: "" });
            continue;
          }
          if (unavailable.has(source)) {
            publish(id, { snapshot, loading: false, error: unavailable.get(source)! });
            continue;
          }
          publish(id, { snapshot, loading: true, error: "" });
          try {
            const fetched = await fetchHistoricalHigh({ id, kind, symbol, base: symbol.replace(/USDT$/, "") }, controller.signal);
            if (controller.signal.aborted) return;
            publish(id, { snapshot: fetched, loading: false, error: "" });
            void writeMarketData(`ath:v2:${id}`, fetched).catch(() => { /* The main data hook reports storage availability. */ });
          } catch (cause) {
            if (controller.signal.aborted) return;
            const error = cause instanceof Error ? cause.message : "历史最高价暂时不可用";
            // Stop a network outage or rate limit from triggering requests for every saved symbol.
            if (/无法连接 Binance|请求频率受限|请求过于频繁/.test(error)) unavailable.set(source, error);
            publish(id, { snapshot, loading: false, error });
          }
        }
      }
      try { await Promise.all([worker(), worker()]); }
      finally { inFlight = false; }
    }

    updateHistory.current = update;
    void update(force);
    const timer = autoRefresh ? window.setInterval(() => void update(), 60_000) : undefined;
    const onVisible = () => { if (autoRefresh && !document.hidden) void update(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      controller.abort(); clearInterval(timer);
      updateHistory.current = undefined;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [idsKey, autoRefresh, refresh]);

  return states;
}
