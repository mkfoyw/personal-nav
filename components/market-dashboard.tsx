"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { ArrowDownUp, Bookmark, ChartNoAxesCombined, Check, CircleAlert, Cloud, Compass, Database, Download, ExternalLink, GripVertical, LayoutGrid, Moon, Pencil, Plus, RefreshCw, Search, Star, Sun, Table2, Tags, Trash2, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MarketItemEditor } from "@/components/market-item-editor";
import { GitHubBackupDialog } from "@/components/github-backup-dialog";
import { useMarketChart, useMarketData } from "@/hooks/use-market-data";
import { insertCategory as reorderFavorites } from "@/lib/category-order";
import { MARKET_LABELS, binanceMarketUrl, mergeMarketSettings, sourceFor, type ChartInterval, type Instrument, type MarketKind, type Point } from "@/lib/markets";
import { createMarketExport, parseMarketImport } from "@/lib/market-transfer";
import { getGitHubBackupSettings, type GitHubBackupSettings } from "@/lib/indexed-db";
import { writeMarketData } from "@/lib/market-storage";

const SYSTEM_TAGS = Object.entries(MARKET_LABELS).map(([kind, label]) => ({ key: `market:${kind}`, label }));
const NAMES: Record<string, string> = { XAU: "黄金", XAG: "白银", XPT: "铂金", XPD: "钯金", COPPER: "铜", CL: "WTI 原油", BZ: "布伦特原油", NATGAS: "天然气", BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", DOGE: "Dogecoin", XRP: "XRP", NVDA: "英伟达", TSLA: "特斯拉", AAPL: "苹果", AMZN: "亚马逊", MSFT: "微软", META: "Meta", GOOGL: "Alphabet", COIN: "Coinbase", MSTR: "Strategy", PLTR: "Palantir", SPY: "标普 500 ETF", QQQ: "纳斯达克 100 ETF" };
const number = (value: number | undefined) => value === undefined ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 1 ? 8 : value < 100 ? 4 : 2 }).format(value);
const compact = (value: number | undefined) => value === undefined ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const tone = (value: number | undefined) => value === undefined || value === 0 ? "text-muted-foreground" : value > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
const time = (value: number) => new Date(value).toLocaleTimeString("zh-CN", { hour12: false });

function PriceChart({ points, label }: { points: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800, height = 240, pad = 10;
  const low = Math.min(...points.map((point) => point.price));
  const high = Math.max(...points.map((point) => point.price));
  const span = high - low || high * 0.01 || 1;
  const x = (index: number) => pad + index / Math.max(points.length - 1, 1) * (width - pad * 2);
  const y = (price: number) => height - pad - (price - low) / span * (height - pad * 2);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.price)}`).join(" ");
  const index = hover === null ? points.length - 1 : Math.min(hover, points.length - 1);
  const point = points[index];
  const up = points[points.length - 1].price >= points[0].price;
  const pointLabel = (point: Point) => new Date(point.time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return <div className="mt-6">
    <div className="mb-3 flex justify-between gap-2 text-xs text-muted-foreground"><span>{pointLabel(point)} · 收盘 {number(point.price)} USDT</span><span>区间最高 {number(high)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}，${points.length} 个收盘价，最低 ${number(low)}，最高 ${number(high)}`} className={`h-52 w-full overflow-visible sm:h-64 ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`} onPointerLeave={() => setHover(null)} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHover(Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (points.length - 1))); }}>
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height * fraction} y2={height * fraction} stroke="currentColor" opacity="0.1" strokeDasharray="3 6" />)}
      <path d={`${path} L${x(points.length - 1)},${height} L${pad},${height} Z`} fill="currentColor" opacity="0.06" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {hover !== null && <><line x1={x(index)} x2={x(index)} y1="0" y2={height} stroke="currentColor" opacity="0.25" /><circle cx={x(index)} cy={y(point.price)} r="4" fill="currentColor" /></>}
    </svg>
    <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{pointLabel(points[0])}</span><span>区间最低 {number(low)}</span><span>{pointLabel(points[points.length - 1])}</span></div>
  </div>;
}

export function MarketDashboard() {
  const { settings, setSettings, snapshots, errors, storageError, ready, busy, refresh, reload } = useMarketData();
  const { resolvedTheme, setTheme } = useTheme();
  const displayMode = settings.displayMode ?? "table";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [interval, setInterval] = useState<ChartInterval>("1h");
  const [sort, setSort] = useState<"default" | "gainers" | "losers" | "volume">("default");
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(0);
  const [editor, setEditor] = useState<{ instrument?: Instrument } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const dragSource = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const tagDragSource = useRef<string | null>(null);
  const suppressTagClick = useRef(false);
  const [draggingTag, setDraggingTag] = useState<string | null>(null);
  const [tagDropTarget, setTagDropTarget] = useState<{ key: string; side: "before" | "after" } | null>(null);
  const [sortNotice, setSortNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [githubBackupOpen, setGithubBackupOpen] = useState(false);
  const [githubSettings, setGithubSettings] = useState<GitHubBackupSettings | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);

  const instruments = useMemo(() => {
    const all = [...(snapshots.spot?.instruments ?? []), ...(snapshots.futures?.instruments ?? [])];
    for (const id of settings.favorites) {
      if (all.some((item) => item.id === id)) continue;
      const [kind, symbol] = id.split(":") as [MarketKind, string];
      all.push({ id, kind, symbol, base: symbol.replace(/USDT$/, "") });
    }
    return all;
  }, [snapshots, settings.favorites]);
  const quoteFor = (item: Instrument) => snapshots[sourceFor(item.kind)]?.quotes[item.symbol];
  const knownTags = [...new Set(settings.favorites.flatMap((id) => settings.tags[id] ?? []))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filterTags = [...SYSTEM_TAGS, ...knownTags.map((tag) => ({ key: `custom:${tag}`, label: SYSTEM_TAGS.some((system) => system.label === tag) ? `${tag}（自定义）` : tag }))];
  const tagRanks = new Map((settings.tagOrder ?? []).map((key, index) => [key, index]));
  filterTags.sort((left, right) => (tagRanks.get(left.key) ?? tagRanks.size) - (tagRanks.get(right.key) ?? tagRanks.size));
  const activeTags = selectedTags.filter((key) => filterTags.some((tag) => tag.key === key));
  const filtered = instruments.filter((item) => {
    const tags = settings.tags[item.id] ?? [];
    const tagKeys = [`market:${item.kind}`, ...tags.map((tag) => `custom:${tag}`)];
    return settings.favorites.includes(item.id)
      && (!activeTags.length || activeTags.some((key) => tagKeys.includes(key)))
      && `${item.symbol} ${NAMES[item.base] ?? ""} ${MARKET_LABELS[item.kind]} ${tags.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  filtered.sort((left, right) => {
    const a = quoteFor(left), b = quoteFor(right);
    if (sort === "gainers") return (b?.change ?? -Infinity) - (a?.change ?? -Infinity);
    if (sort === "losers") return (a?.change ?? Infinity) - (b?.change ?? Infinity);
    if (sort === "volume") return (b?.volume ?? 0) - (a?.volume ?? 0);
    return settings.favorites.indexOf(left.id) - settings.favorites.indexOf(right.id);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const rows = ready ? filtered.slice(currentPage * 20, (currentPage + 1) * 20) : [];
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const selectedQuote = selected && quoteFor(selected);
  const chart = useMarketChart(ready && displayMode === "table" ? selected : undefined, interval, settings.autoRefresh, refresh);
  const selectedSource = selected && sourceFor(selected.kind);
  const selectedSnapshot = selectedSource && snapshots[selectedSource];
  const selectedCached = !!selectedSource && (!!errors[selectedSource] || !!selectedSnapshot && now - selectedSnapshot.fetchedAt > 90_000);
  const chartCached = !!chart.error || now - chart.fetchedAt > 90_000;
  const canReorder = ready && sort === "default";

  function clearDrag() {
    dragSource.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }
  function moveItem(source: string, target: string, side: "before" | "after") {
    if (!canReorder || source === target) return;
    setSelectedId(selected?.id ?? source);
    setSettings((previous) => ({ ...previous, favorites: reorderFavorites(previous.favorites, source, target, side) }));
    const name = instruments.find((item) => item.id === source)?.base ?? source;
    const targetName = instruments.find((item) => item.id === target)?.base ?? target;
    setSortNotice(`已将 ${name} 移到 ${targetName} ${side === "before" ? "之前" : "之后"}，顺序自动保存。`);
  }
  function moveWithKeyboard(id: string, direction: -1 | 1) {
    const index = filtered.findIndex((item) => item.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= filtered.length) return;
    moveItem(id, filtered[targetIndex].id, direction === -1 ? "before" : "after");
    setPage(Math.floor(targetIndex / 20));
  }

  function startItemDrag(event: DragEvent<HTMLElement>, id: string) {
    if (!canReorder || event.target instanceof Element && event.target.closest("button, a, input, select") && !event.target.closest("[data-market-drag-handle]")) { event.preventDefault(); return; }
    dragSource.current = id; setDraggingId(id); setDropTarget(null);
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id);
  }
  function dragSide(event: DragEvent<HTMLElement>, horizontal: boolean): "before" | "after" {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (horizontal ? event.clientX < bounds.left + bounds.width / 2 : event.clientY < bounds.top + bounds.height / 2) ? "before" : "after";
  }
  function dragOverItem(event: DragEvent<HTMLElement>, id: string, horizontal = false) {
    if (!canReorder || !dragSource.current) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    if (dragSource.current === id) { setDropTarget(null); return; }
    const side = dragSide(event, horizontal);
    setDropTarget((previous) => previous?.id === id && previous.side === side ? previous : { id, side });
  }
  function leaveItemDrag(event: DragEvent<HTMLElement>, id: string) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget((previous) => previous?.id === id ? null : previous);
  }
  function dropItem(event: DragEvent<HTMLElement>, id: string, horizontal = false) {
    if (!canReorder || !dragSource.current) return;
    event.preventDefault(); event.stopPropagation();
    const source = dragSource.current;
    const side = dragSide(event, horizontal);
    clearDrag(); moveItem(source, id, side);
  }

  function clearTagDrag() {
    tagDragSource.current = null;
    setDraggingTag(null);
    setTagDropTarget(null);
    window.setTimeout(() => { suppressTagClick.current = false; }, 0);
  }
  function moveTag(source: string, target: string, side: "before" | "after") {
    if (!ready || source === target) return;
    const order = reorderFavorites(filterTags.map((tag) => tag.key), source, target, side);
    setSettings((previous) => ({ ...previous, tagOrder: order }));
    const label = filterTags.find((tag) => tag.key === source)?.label ?? source;
    setSortNotice(`已调整标签 ${label} 的位置，顺序自动保存。`);
  }

  function removeItem(item: Instrument) {
    const before = settings;
    setSettings((previous) => ({ ...previous, favorites: previous.favorites.filter((id) => id !== item.id), tags: Object.fromEntries(Object.entries(previous.tags).filter(([id]) => id !== item.id)) }));
    toast.success(`已移除 ${item.base}`, { action: { label: "撤销", onClick: () => setSettings((previous) => {
      if (previous.favorites.includes(item.id) || previous.favorites.length >= 200) return previous;
      const favorites = [...previous.favorites];
      favorites.splice(Math.min(before.favorites.indexOf(item.id), favorites.length), 0, item.id);
      return { ...previous, favorites, tags: { ...previous.tags, [item.id]: before.tags[item.id] ?? [] } };
    }) } });
  }
  function saveItem(item: Instrument, tags: string[]) {
    if (!settings.favorites.includes(item.id) && settings.favorites.length >= 200) throw new Error("最多保存 200 个自选");
    const existing = settings.favorites.includes(item.id);
    if (existing && !editor?.instrument) throw new Error("这个交易对已在清单中，请点击列表左侧的编辑按钮修改标签");
    setSettings((previous) => ({ ...previous, favorites: existing ? previous.favorites : [...previous.favorites, item.id], tags: { ...previous.tags, [item.id]: tags }, view: "watchlist" }));
    setSearch(""); setPage(0); setSelectedTags([]); setSelectedId(item.id); setEditor(null);
    toast.success(existing ? `已更新 ${item.base} 的标签` : `已添加 ${item.base}`);
  }
  function exportWatchlist() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(createMarketExport(settings), null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `qidian-markets-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("已导出自选与设置");
  }
  async function importWatchlist(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) return toast.error("自选备份不能超过 1 MB");
    try {
      const imported = parseMarketImport(JSON.parse(await file.text()));
      setSettings(mergeMarketSettings(settings, imported));
      setPage(0); setSelectedTags([]); toast.success("已合并自选、标签并恢复设置");
    } catch (error) { toast.error(error instanceof Error ? error.message : "导入失败"); }
  }

  async function openGitHubBackup() {
    try {
      setGithubSettings(await getGitHubBackupSettings());
      setGithubBackupOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "读取 GitHub 备份设置失败"); }
  }

  return <div className="page-shell flex min-h-dvh flex-col">
    <a href="#market-main" className="skip-link">跳转到行情</a>
    <header className="snap-start border-b border-border/70">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 sm:gap-3" aria-label="栖点首页"><span className="brand-symbol"><Compass className="size-5" strokeWidth={1.5} /></span><span className="text-lg font-semibold tracking-[0.14em]">栖点</span><span className="ml-2 hidden text-[10px] tracking-[0.2em] text-muted-foreground sm:inline">YOUR LITTLE CORNER</span></Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <Button asChild variant="ghost" size="icon" className="sm:w-auto sm:px-2.5"><Link href="/" aria-label="返回导航"><Bookmark /><span className="hidden sm:inline">导航</span></Link></Button>
          <input ref={importRef} type="file" accept=".json,application/json" onChange={importWatchlist} className="hidden" />
          <Button variant="ghost" size="icon-lg" aria-label="切换明暗主题" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" /><Moon className="theme-moon" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-lg" aria-label="导入或导出数据" title="导入或导出数据"><Database /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>浏览器数据</DropdownMenuLabel>
              <DropdownMenuItem disabled={!ready} onSelect={() => importRef.current?.click()}><Upload />导入 JSON</DropdownMenuItem>
              <DropdownMenuItem disabled={!ready} onSelect={exportWatchlist}><Download />导出 JSON</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!ready} onSelect={() => void openGitHubBackup()}><Cloud />GitHub 私有备份</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button size="lg" aria-label="添加股票 / 代币" title="添加股票 / 代币" onClick={() => setEditor({})} disabled={!ready}><Plus data-icon="inline-start" /><span className="hidden sm:inline">添加自选</span></Button>
            <Button size="lg" variant="outline" aria-label={busy ? "正在更新行情" : "刷新行情"} title={busy ? "正在更新行情" : "刷新行情"} onClick={reload} disabled={!ready || busy}><RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : ""} /><span className="hidden sm:inline">{busy ? "正在更新" : "刷新行情"}</span></Button>
          </div>
        </div>
      </div>
    </header>
    <main id="market-main" className="mx-auto w-full max-w-6xl flex-1 px-5 pt-[clamp(2.5rem,7vh,4.5rem)] pb-14 sm:px-8">
      <section className="mb-8 flex flex-col gap-5">
        <p className="flex items-center gap-2 text-xs tracking-widest text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />BINANCE · MARKET WATCH</p>
        <h1 className="text-[clamp(2rem,4.3vw,3.5rem)] leading-tight font-medium tracking-tight">看见市场的每一次脉动<span className="text-primary">。</span></h1>
        <p className="text-sm leading-6 text-muted-foreground">加密货币与 TradFi 永续，留一份自己的观察清单。</p>
      </section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><Check className="size-3.5 text-primary" />浏览器直连 · 无需 API Key · 本地保存</span>
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-primary" checked={settings.autoRefresh} disabled={!ready} onChange={(event) => setSettings((previous) => ({ ...previous, autoRefresh: event.target.checked }))} />每 30 秒刷新 · 后台暂停</label>
      </div>
      <div aria-live="polite" className="space-y-2">
        {storageError && <p role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{storageError}</p>}
        {(["spot", "futures"] as const).filter((source) => errors[source]).map((source) => <div key={source} role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><p>{source === "spot" ? "加密现货" : "永续合约"}：{errors[source]}</p><p className="mt-1 text-xs text-muted-foreground">{snapshots[source] ? `当前展示本地缓存，保存于 ${new Date(snapshots[source]!.fetchedAt).toLocaleString("zh-CN")}。` : "尚无本地缓存，恢复连接后即可查看。"}</p></div></div>)}
      </div>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs" aria-label="行情列表">
        <div className="flex flex-col gap-4 border-b p-4 sm:p-5">
          <h2 className="flex items-center gap-2 px-1 text-sm font-medium"><Star className="size-4 text-primary" />我的自选</h2>
          <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-40 flex-1 sm:max-w-xs"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="搜索交易对" placeholder="搜索自选代码、名称或标签" className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownUp className="size-3.5" /><select aria-label="行情排序" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); clearDrag(); setPage(0); }} className="rounded-md border bg-background p-2 text-foreground"><option value="default">默认排序</option><option value="gainers">涨幅优先</option><option value="losers">跌幅优先</option><option value="volume">成交额优先</option></select></label><span className="ml-auto text-xs text-muted-foreground">{filtered.length} 个交易对</span><div role="group" aria-label="展示方式" className="flex gap-1 rounded-lg border p-1"><Button size="sm" variant="ghost" disabled={!ready} aria-pressed={displayMode === "table"} onClick={() => { clearDrag(); setSettings((previous) => ({ ...previous, displayMode: "table" })); }} className={displayMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground"}><Table2 />表格</Button><Button size="sm" variant="ghost" disabled={!ready} aria-pressed={displayMode === "cards"} onClick={() => { clearDrag(); setSettings((previous) => ({ ...previous, displayMode: "cards" })); }} className={displayMode === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground"}><LayoutGrid />卡片</Button></div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5" role="group" aria-label="标签筛选">
          <Tags className="mr-1 size-4 text-muted-foreground" />
          <button aria-pressed={!activeTags.length} onClick={() => { setSelectedTags([]); setPage(0); }} className={`rounded-md border px-3 py-1.5 text-xs ${!activeTags.length ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>全部标签</button>
          {filterTags.map((tag) => <button key={tag.key} disabled={!ready} draggable={ready} aria-pressed={activeTags.includes(tag.key)} aria-describedby="market-tag-help" title="拖动排序；Alt + ← / → 移动，点击筛选"
            onDragStart={(event) => { tagDragSource.current = tag.key; suppressTagClick.current = true; setDraggingTag(tag.key); setTagDropTarget(null); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tag.key); }}
            onDragOver={(event) => {
              if (!ready || !tagDragSource.current) return;
              event.preventDefault(); event.dataTransfer.dropEffect = "move";
              if (tagDragSource.current === tag.key) { setTagDropTarget(null); return; }
              const bounds = event.currentTarget.getBoundingClientRect();
              const side = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
              setTagDropTarget((previous) => previous?.key === tag.key && previous.side === side ? previous : { key: tag.key, side });
            }}
            onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTagDropTarget((previous) => previous?.key === tag.key ? null : previous); }}
            onDrop={(event) => {
              if (!ready || !tagDragSource.current) return;
              event.preventDefault(); event.stopPropagation();
              const source = tagDragSource.current;
              const bounds = event.currentTarget.getBoundingClientRect();
              clearTagDrag(); moveTag(source, tag.key, event.clientX < bounds.left + bounds.width / 2 ? "before" : "after");
            }}
            onDragEnd={clearTagDrag}
            onKeyDown={(event) => {
              if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault();
              const index = filterTags.findIndex((item) => item.key === tag.key);
              const neighbor = filterTags[index + (event.key === "ArrowLeft" ? -1 : 1)];
              if (neighbor) moveTag(tag.key, neighbor.key, event.key === "ArrowLeft" ? "before" : "after");
            }}
            onClick={(event) => { if (suppressTagClick.current) { event.preventDefault(); return; } setSelectedTags((previous) => previous.includes(tag.key) ? previous.filter((value) => value !== tag.key) : [...previous, tag.key]); setPage(0); }}
            className={`max-w-full cursor-grab truncate rounded-md border px-3 py-1.5 text-xs active:cursor-grabbing ${activeTags.includes(tag.key) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"} ${draggingTag === tag.key ? "opacity-40" : ""} ${tagDropTarget?.key === tag.key ? tagDropTarget.side === "before" ? "shadow-[inset_2px_0_0_var(--primary)]" : "shadow-[inset_-2px_0_0_var(--primary)]" : ""}`}>{tag.label}</button>)}
        </div>
        <p id="market-tag-help" className="sr-only">点击筛选；拖动标签，或按 Alt 加左右方向键调整标签顺序。</p>
        <p id="market-reorder-help" className="border-b px-5 py-2 text-xs text-muted-foreground">{sort === "default" ? displayMode === "cards" ? "拖动卡片调整顺序；也可聚焦代码后按 Alt + ← / → 移动。" : "拖动行或左侧手柄调整顺序，自动保存；也可聚焦手柄后按 ↑ ↓ 移动。" : "切换到默认排序后，可拖动调整自选顺序。"}</p>
        <p role="status" className="sr-only">{sortNotice}</p>
        <div id="market-table" role="region" aria-label="自选行情" className="overflow-x-auto" aria-busy={!ready || busy}>
          {displayMode === "table" ? <table className="w-full text-left text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="py-3 pl-5 font-normal">交易对</th><th className="px-3 py-3 text-right font-normal">最新价 / USDT</th><th className="px-3 py-3 text-right font-normal">24h 涨跌</th><th className="hidden px-3 py-3 text-right font-normal md:table-cell">24h 最高 / 最低</th><th className="hidden px-5 py-3 text-right font-normal sm:table-cell">24h 成交额 / USDT</th><th className="w-10 py-3 pr-3"><span className="sr-only">移除</span></th><th className="w-12 px-3 py-3 font-normal"><span className="sr-only">编辑标签</span></th></tr></thead>
            <tbody>{rows.map((item) => { const quote = quoteFor(item); const cached = !!errors[sourceFor(item.kind)] || now - (snapshots[sourceFor(item.kind)]?.fetchedAt ?? 0) > 90_000; return <tr key={item.id} draggable={canReorder}
              onDragStart={(event) => startItemDrag(event, item.id)}
              onDragOver={(event) => dragOverItem(event, item.id)}
              onDragLeave={(event) => leaveItemDrag(event, item.id)}
              onDrop={(event) => dropItem(event, item.id)}
              onDragEnd={clearDrag}
              className={`border-t border-border/60 transition-colors hover:bg-muted/40 ${selected?.id === item.id ? "bg-primary/5" : ""} ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === item.id ? "opacity-40" : ""} ${dropTarget?.id === item.id ? dropTarget.side === "before" ? "shadow-[inset_0_2px_0_var(--primary)]" : "shadow-[inset_0_-2px_0_var(--primary)]" : ""}`}><td className="py-3 pl-3"><div className="flex items-center gap-2"><Button data-market-drag-handle draggable={canReorder} size="icon-sm" variant="ghost" disabled={!canReorder} aria-label={`调整 ${item.base} ${MARKET_LABELS[item.kind]}顺序`} aria-describedby="market-reorder-help" title="拖动排序，或按 ↑ ↓ 移动" className="cursor-grab text-muted-foreground active:cursor-grabbing disabled:opacity-20" onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); moveWithKeyboard(item.id, event.key === "ArrowUp" ? -1 : 1); } }}><GripVertical className="size-3.5" /></Button><div className="min-w-0"><div className="flex items-center gap-1"><a href={binanceMarketUrl(item)} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={`在 Binance 打开 ${item.symbol} ${MARKET_LABELS[item.kind]}（新标签页）`} title="在 Binance 新标签页打开" className="inline-flex items-center gap-1 rounded font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">{item.base}<span className="text-[10px] font-normal text-muted-foreground">/ USDT</span><ExternalLink className="ml-0.5 size-3 text-muted-foreground" /></a><Button size="icon-xs" variant="ghost" onClick={() => setSelectedId(item.id)} aria-label={`查看 ${item.base} ${MARKET_LABELS[item.kind]}走势`} title="查看本页走势图"><ChartNoAxesCombined className="size-3 text-muted-foreground" /></Button></div><span className="mt-1 block text-[10px] text-muted-foreground">{NAMES[item.base] ?? item.base}</span><div className="mt-1 flex max-w-64 flex-wrap gap-1"><span title="按市场自动归类" className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{MARKET_LABELS[item.kind]}</span>{(settings.tags[item.id] ?? []).map((tag) => <span key={tag} className="max-w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>)}</div></div></div></td><td className="px-3 py-3 text-right font-medium tabular-nums">{number(quote?.price)}{quote && cached && <span className="mt-1 block text-[10px] font-normal text-amber-600 dark:text-amber-400">缓存</span>}</td><td className={`px-3 py-3 text-right tabular-nums ${tone(quote?.change)}`}>{quote ? percent(quote.change) : "—"}</td><td className="hidden px-3 py-3 text-right text-xs tabular-nums md:table-cell">{number(quote?.high)}<span className="mt-1 block text-muted-foreground">{number(quote?.low)}</span></td><td className="hidden px-5 py-3 text-right tabular-nums sm:table-cell">{compact(quote?.volume)}</td><td className="pr-3 text-right"><Button size="icon-sm" variant="ghost" aria-label={`移除 ${item.base} ${MARKET_LABELS[item.kind]}`} onClick={() => removeItem(item)}><Trash2 className="size-3.5 text-muted-foreground" /></Button></td><td className="px-3"><Button size="icon-sm" variant="ghost" aria-label={`编辑 ${item.base} ${MARKET_LABELS[item.kind]}标签`} onClick={() => setEditor({ instrument: item })}><Pencil className="size-3.5" /></Button></td></tr>; })}</tbody>
          </table> : <div role="list" aria-label="行情卡片" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
            {rows.map((item) => {
              const quote = quoteFor(item);
              const snapshot = snapshots[sourceFor(item.kind)];
              const cached = !!quote && (!!errors[sourceFor(item.kind)] || now - (snapshot?.fetchedAt ?? 0) > 90_000);
              return <article key={item.id} role="listitem" aria-label={`${item.base} ${MARKET_LABELS[item.kind]}，最新价格 ${number(quote?.price)} USDT，24 小时涨跌 ${quote ? percent(quote.change) : "暂无数据"}${cached ? "，本地缓存" : ""}`} title={`${MARKET_LABELS[item.kind]}${cached ? " · 本地缓存" : ""}${snapshot ? ` · 获取于 ${time(snapshot.fetchedAt)}` : ""}`} draggable={canReorder}
                onDragStart={(event) => startItemDrag(event, item.id)} onDragOver={(event) => dragOverItem(event, item.id, true)} onDragLeave={(event) => leaveItemDrag(event, item.id)} onDrop={(event) => dropItem(event, item.id, true)} onDragEnd={clearDrag}
                onKeyDown={(event) => { if (canReorder && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); moveWithKeyboard(item.id, event.key === "ArrowLeft" ? -1 : 1); } }}
                className={`min-w-0 rounded-xl border bg-background/60 px-4 py-5 transition-colors hover:border-primary/40 sm:px-5 ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === item.id ? "opacity-40" : ""} ${dropTarget?.id === item.id ? dropTarget.side === "before" ? "shadow-[inset_2px_0_0_var(--primary)]" : "shadow-[inset_-2px_0_0_var(--primary)]" : ""}`}>
                <a href={binanceMarketUrl(item)} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={`在 Binance 打开 ${item.symbol} ${MARKET_LABELS[item.kind]}（新标签页）`} className="inline-flex max-w-full items-baseline gap-1 rounded text-sm font-medium hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"><span className="truncate">{item.base}</span><span className="shrink-0 text-[10px] font-normal text-muted-foreground">/ USDT</span></a>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[clamp(1rem,2vw,1.5rem)] leading-tight font-medium tracking-tight tabular-nums" title={`${number(quote?.price)} USDT`}>{number(quote?.price)}</p>
                  <span title="24h 涨跌幅" aria-label={`24 小时涨跌 ${quote ? percent(quote.change) : "暂无数据"}`} className={`shrink-0 text-xs font-medium tabular-nums ${tone(quote?.change)}`}>{quote ? percent(quote.change) : "—"}</span>
                </div>
              </article>;
            })}
          </div>}
          {!rows.length && <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-5 text-center"><ChartNoAxesCombined className="size-7 text-muted-foreground" /><p className="font-medium">{!ready ? "正在读取自选" : !settings.favorites.length ? "添加第一只股票或代币" : "没有匹配的自选"}</p><p className="text-sm text-muted-foreground">{!settings.favorites.length ? "输入代码，设置标签，开始建立自己的行情清单。" : "尝试其他标签或搜索词。"}</p><Button variant="outline" disabled={!ready} onClick={() => setEditor({})}><Plus />添加股票 / 代币</Button></div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>仅展示手动添加的自选 · USDT 报价</span><div className="flex items-center gap-3"><Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1} / {pages}</span><Button variant="ghost" size="sm" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>
      </section>
      {displayMode === "table" && selected && <section aria-label="交易对走势" className="mt-6 rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold"><a href={binanceMarketUrl(selected)} target="_blank" rel="noopener noreferrer" aria-label={`在 Binance 打开 ${selected.symbol}（新标签页）`} className="inline-flex items-center gap-1.5 rounded hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">{selected.base}<ExternalLink className="size-3.5 text-muted-foreground" /></a></h2><span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">{MARKET_LABELS[selected.kind]}</span></div><div className="mt-3 flex items-baseline gap-3"><span className="text-3xl font-medium tracking-tight tabular-nums">{number(selectedQuote?.price)}</span><span className="text-xs text-muted-foreground">USDT</span><span className={`text-sm tabular-nums ${tone(selectedQuote?.change)}`}>{selectedQuote ? percent(selectedQuote.change) : "—"}</span></div><p className="mt-2 text-xs text-muted-foreground">{selectedSnapshot ? `${selectedCached ? "缓存保存" : "行情获取"}于 ${time(selectedSnapshot.fetchedAt)} · 涨跌幅为滚动 24 小时` : "等待行情数据"}</p></div><div className="flex rounded-lg border p-1" role="group" aria-label="走势周期">{(["5m", "1h", "4h", "1d"] as const).map((value) => <button key={value} onClick={() => setInterval(value)} aria-pressed={interval === value} className={`rounded px-3 py-1.5 text-xs ${interval === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{{ "5m": "5 分", "1h": "1 时", "4h": "4 时", "1d": "日线" }[value]}</button>)}</div></div>
        {chart.points.length > 0 ? <PriceChart key={`${selected.id}:${interval}`} points={chart.points} label={`${selected.base} ${MARKET_LABELS[selected.kind]} ${interval} 走势`} /> : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{chart.loading ? "正在加载走势…" : "暂无走势数据"}</div>}
        <div aria-live="polite" className="mt-4 text-xs leading-5 text-muted-foreground">{chart.error ? <span className="text-amber-700 dark:text-amber-400">走势：{chart.error}{chart.points.length ? "，展示本地缓存。" : "。"}</span> : chart.fetchedAt > 0 ? `${chartCached ? "缓存走势" : "走势获取"}于 ${time(chart.fetchedAt)}${chart.loading ? " · 正在更新" : ""}` : ""}<span className="ml-2">最近 120 根 K 线的收盘价 · 最后一根可能尚未收盘</span></div>
        {selected.kind === "stock-perp" && <p className="mt-4 border-t pt-4 text-xs leading-6 text-muted-foreground">股票永续为 Binance 衍生品报价，以 USDT 计价，不等同于美股交易所现货价格。此分类也可能包含非美国股票及 ETF 标的，具体以上线合约为准。</p>}
      </section>}
      {editor && <MarketItemEditor instrument={editor.instrument} catalog={[...(snapshots.spot?.instruments ?? []), ...(snapshots.futures?.instruments ?? [])]} tags={editor.instrument ? settings.tags[editor.instrument.id] ?? [] : []} knownTags={knownTags} onClose={() => setEditor(null)} onSave={saveItem} />}
      <footer className="mt-7 flex flex-wrap justify-between gap-3 text-xs leading-6 text-muted-foreground"><p>行情由 Binance 提供 · 数据默认保存在当前浏览器</p><p>更换设备或清理浏览器前，请导出自选或手动同步到 GitHub。</p></footer>
    </main>
    <GitHubBackupDialog scope="markets" open={githubBackupOpen} settings={githubSettings} marketSettings={settings} onOpenChange={setGithubBackupOpen} onSettingsSaved={setGithubSettings} onRestored={async (restored) => {
      await writeMarketData("settings", restored);
      setSettings(restored);
      clearDrag(); clearTagDrag(); setSearch(""); setSelectedTags([]); setPage(0); setSelectedId(""); setSort("default"); setSortNotice("");
    }} />
  </div>;
}
