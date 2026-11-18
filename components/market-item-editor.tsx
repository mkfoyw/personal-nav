"use client";

import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MARKET_LABELS, normalizeMarketTags, type Instrument } from "@/lib/markets";

export function MarketItemEditor({ instrument, catalog, tags, knownTags, onClose, onSave }: {
  instrument?: Instrument;
  catalog: Instrument[];
  tags: string[];
  knownTags: string[];
  onClose: () => void;
  onSave: (instrument: Instrument, tags: string[]) => void;
}) {
  const [code, setCode] = useState(instrument?.base ?? "");
  const [chosen, setChosen] = useState<Instrument | undefined>(instrument);
  const [tagInput, setTagInput] = useState(tags.join("，"));
  const [error, setError] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionsId = useId();
  const query = code.trim().toUpperCase().replace(/[\s/]/g, "");
  const rank = (item: Instrument) => item.base === query || item.symbol === query ? 0 : item.base.startsWith(query) ? 1 : 2;
  const matches = catalog.filter((item) => !query || item.symbol.includes(query)).sort((a, b) => rank(a) - rank(b) || a.base.localeCompare(b.base) || a.kind.localeCompare(b.kind));
  const expanded = !instrument && suggestionsOpen;
  const active = Math.min(activeIndex, matches.length - 1);
  const exactMatches = matches.filter((item) => item.base === query || item.symbol === query);
  const match = instrument ?? chosen ?? (exactMatches.length === 1 ? exactMatches[0] : undefined);
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${suggestionsId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, query, suggestionsId]);
  function complete(item: Instrument) {
    setCode(item.base);
    setChosen(item);
    setSuggestionsOpen(false);
    setActiveIndex(0);
    setError("");
  }
  function handleCodeKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveIndex(matches.length ? !expanded ? event.key === "ArrowDown" ? 0 : matches.length - 1 : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0);
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      if (matches[active]) complete(matches[active]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setSuggestionsOpen(false);
    } else if (event.key === "Tab") setSuggestionsOpen(false);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!match) return setError(exactMatches.length > 1 ? "该代码有多个市场，请从补全列表中选择要添加的现货或永续合约。" : "请从补全列表中选择已上线的 USDT 交易对；若列表未加载，请关闭后刷新重试。");
    try { onSave(match, normalizeMarketTags(tagInput.split(/[,，、\n]/))); }
    catch (error) { setError(error instanceof Error ? error.message : "保存失败"); }
  }
  function appendTag(tag: string) {
    const values = tagInput.split(/[,，、\n]/).map((value) => value.trim()).filter(Boolean);
    if (!values.includes(tag)) setTagInput([...values, tag].join("，"));
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" onEscapeKeyDown={(event) => { if (expanded) { event.preventDefault(); setSuggestionsOpen(false); } }}>
      <DialogHeader><DialogTitle>{instrument ? `编辑 ${instrument.base} 标签` : "添加股票或代币"}</DialogTitle><DialogDescription>{instrument ? "为条目设置多个标签，方便按主题筛选。" : "输入代码搜索全部市场，从列表选择即可添加。传统资产使用永续合约报价。"}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="market-code">股票或代币代码</Label>
          <div className="relative">
            <Input id="market-code" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? suggestionsId : undefined} aria-activedescendant={expanded && active >= 0 ? `${suggestionsId}-${active}` : undefined} aria-describedby={!instrument ? `${suggestionsId}-help` : undefined} autoFocus={!instrument} disabled={!!instrument} maxLength={40} autoComplete="off" spellCheck={false} placeholder="搜索全部市场，如 BTC、XAU、NVDA" value={code} onFocus={() => { setSuggestionsOpen(true); setActiveIndex(Math.max(0, matches.findIndex((item) => item.id === chosen?.id))); }} onBlur={() => setSuggestionsOpen(false)} onKeyDown={handleCodeKey} onChange={(event) => { setCode(event.target.value); setChosen(undefined); setSuggestionsOpen(true); setActiveIndex(0); setError(""); }} />
            {expanded && <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
              <div className="max-h-52 overflow-y-auto p-1" id={suggestionsId} role="listbox" aria-label="股票或代币补全建议">
                {matches.map((item, index) => <button type="button" role="option" tabIndex={-1} id={`${suggestionsId}-${index}`} key={item.id} aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onClick={() => complete(item)} onPointerMove={() => setActiveIndex(index)} className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${active === index ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><span className="min-w-0"><span className="block truncate font-medium">{item.base}</span><span className="block text-[10px] text-muted-foreground">{item.symbol}</span></span><span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">{MARKET_LABELS[item.kind]}</span></button>)}
              </div>
              {!matches.length && <p role="status" className="px-3 py-3 text-xs text-muted-foreground">{catalog.length ? "未找到匹配的交易对。" : "等待交易对列表加载，请稍后重试。"}</p>}
            </div>}
          </div>
          {!instrument && <p id={`${suggestionsId}-help`} className="text-xs text-muted-foreground">↑ ↓ 选择，回车补全；候选项会标明现货或永续市场。</p>}
          {match && <p className="text-xs text-primary">{match.symbol} · {MARKET_LABELS[match.kind]}{instrument ? "" : " · 可以添加"}</p>}
        </div>
        <div className="grid gap-2"><Label htmlFor="market-tags">标签</Label><Input id="market-tags" autoFocus={!!instrument} value={tagInput} maxLength={300} placeholder="例如：AI，长期关注，科技" onChange={(event) => { setTagInput(event.target.value); setError(""); }} /><p className="text-xs text-muted-foreground">市场标签自动归类；可用逗号分隔添加最多 10 个自定义标签。</p>{knownTags.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="已有标签">{knownTags.map((tag) => <button key={tag} type="button" onClick={() => appendTag(tag)} className="max-w-full truncate rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">{tag}</button>)}</div>}</div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit">{instrument ? "保存标签" : "添加到清单"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
