"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, parseInstruments, parsePoints, parseQuotes, parseSettings, requestMarket, type ChartInterval, type ChartSnapshot, type Instrument, type MarketSettings, type MarketSnapshot, type MarketSource } from "@/lib/markets";
import { readMarketData, writeMarketData } from "@/lib/market-storage";

const SOURCES: MarketSource[] = ["spot", "futures"];
const message = (error: unknown) => error instanceof Error ? error.message : "行情暂时不可用";

export function useMarketData() {
  const [settings, setSettings] = useState<MarketSettings>(DEFAULT_SETTINGS);
  const [snapshots, setSnapshots] = useState<Partial<Record<MarketSource, MarketSnapshot>>>({});
  const [errors, setErrors] = useState<Partial<Record<MarketSource, string>>>({});
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const catalog = useRef<Partial<Record<MarketSource, Instrument[]>>>({});
  const catalogFetchedAt = useRef<Partial<Record<MarketSource, number>>>({});

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const results = await Promise.allSettled([readMarketData<MarketSettings>("settings"), ...SOURCES.map((source) => readMarketData<MarketSnapshot>(source))]);
      if (cancelled) return;
      const saved = results[0];
      if (saved.status === "fulfilled" && saved.value) {
        try { setSettings(parseSettings(saved.value)); } catch { setStorageError("行情设置损坏，已恢复默认自选。可以重新导入备份。"); }
      }
      const restored: Partial<Record<MarketSource, MarketSnapshot>> = {};
      SOURCES.forEach((source, index) => {
        const result = results[index + 1];
        if (result.status === "fulfilled" && result.value && "instruments" in result.value) {
          restored[source] = result.value;
          catalog.current[source] = result.value.instruments;
        }
      });
      if (results.some((result) => result.status === "rejected")) setStorageError("浏览器存储不可用；仍可查看行情，本次更改可能无法保存。");
      setSnapshots(restored);
      setReady(true);
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void writeMarketData("settings", settings).catch((error) => setStorageError(message(error)));
    }, 100);
    return () => clearTimeout(timer);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let inFlight = false;
    async function update(forceCatalog = false) {
      if (inFlight || controller.signal.aborted || document.hidden) return;
      inFlight = true;
      setBusy(true);
      await Promise.all(SOURCES.map(async (source) => {
        try {
          if (forceCatalog || !catalog.current[source]?.length || Date.now() - (catalogFetchedAt.current[source] ?? 0) > 3_600_000) {
            catalog.current[source] = parseInstruments(await requestMarket(source, "exchangeInfo", controller.signal), source);
            catalogFetchedAt.current[source] = Date.now();
          }
          const quotes = parseQuotes(await requestMarket(source, "ticker/24hr", controller.signal));
          if (controller.signal.aborted) return;
          const snapshot: MarketSnapshot = { instruments: catalog.current[source]!, quotes, fetchedAt: Date.now() };
          setSnapshots((previous) => ({ ...previous, [source]: snapshot }));
          setErrors((previous) => ({ ...previous, [source]: "" }));
          void writeMarketData(source, snapshot).catch((error) => setStorageError(message(error)));
        } catch (error) {
          if (!controller.signal.aborted) setErrors((previous) => ({ ...previous, [source]: message(error) }));
        }
      }));
      inFlight = false;
      if (!controller.signal.aborted) setBusy(false);
    }
    const initial = window.setTimeout(() => void update(refresh > 0), 0);
    const timer = settings.autoRefresh ? window.setInterval(() => void update(), 30_000) : undefined;
    const onVisible = () => { if (settings.autoRefresh && !document.hidden) void update(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [ready, settings.autoRefresh, refresh]);

  return { settings, setSettings, snapshots, errors, storageError, ready, busy, refresh, reload: () => setRefresh((value) => value + 1) };
}

export function useMarketChart(instrument: Instrument | undefined, interval: ChartInterval, autoRefresh: boolean, refresh: number) {
  const key = instrument ? `chart:${instrument.id}:${interval}` : "";
  const [state, setState] = useState<ChartSnapshot & { key: string; error: string; loading: boolean }>({ key: "", points: [], fetchedAt: 0, error: "", loading: false });
  const kind = instrument?.kind;
  const symbol = instrument?.symbol;
  useEffect(() => {
    if (!key || !kind || !symbol) return;
    const controller = new AbortController();
    let inFlight = false;
    async function update() {
      if (inFlight || controller.signal.aborted || document.hidden) return;
      inFlight = true;
      setState((previous) => previous.key === key ? { ...previous, loading: true } : { key, points: [], fetchedAt: 0, error: "", loading: true });
      try {
        const points = parsePoints(await requestMarket(kind === "spot" ? "spot" : "futures", `klines?${new URLSearchParams({ symbol: symbol!, interval, limit: "120" })}`, controller.signal));
        if (controller.signal.aborted) return;
        const snapshot = { points, fetchedAt: Date.now() };
        setState({ ...snapshot, key, error: "", loading: false });
        void writeMarketData(key, snapshot).catch(() => { /* The main page reports persistent storage availability. */ });
      } catch (error) {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, key, error: message(error), loading: false }));
      } finally { inFlight = false; }
    }
    async function initialize() {
      try {
        const saved = await readMarketData<ChartSnapshot>(key);
        if (controller.signal.aborted) return;
        if (saved) setState({ ...saved, key, error: "", loading: true });
      } catch { /* Network data remains available without a cache. */ }
      if (!controller.signal.aborted) await update();
    }
    void initialize();
    const timer = autoRefresh ? window.setInterval(() => void update(), 30_000) : undefined;
    return () => { controller.abort(); clearInterval(timer); };
  }, [key, kind, symbol, interval, autoRefresh, refresh]);
  return state.key === key ? state : { key, points: [], fetchedAt: 0, error: "", loading: !!key };
}
