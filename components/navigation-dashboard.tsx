"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowUpRight, Bookmark, Check, CircleAlert, Compass, LayoutGrid, Moon, Plus, RefreshCw, Search, Sun, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkCard } from "@/components/link-card";
import { LinkEditor } from "@/components/link-editor";
import { useWebMcp } from "@/hooks/use-web-mcp";
import { api } from "@/lib/client-api";
import type { NavigationLink } from "@/lib/links";

const DEFAULT = "view:default";
const ALL = "view:all";

function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);
  const hour = now?.getHours() ?? 12;
  const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  return <div className="flex flex-col gap-5">
    <p className="flex items-center gap-2 text-xs tracking-widest text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />{now ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(now) : "每一天，都是新的出发"}</p>
    <h1 className="text-[clamp(2rem,4.3vw,3.5rem)] leading-tight font-medium tracking-tight">{now ? greeting : "你好"}，<br className="sm:hidden" />去想去的地方<span className="text-primary">。</span></h1>
    <p className="text-sm text-muted-foreground">收藏常去的地方，把时间留给重要的事。</p>
  </div>;
}

export function NavigationDashboard() {
  const [links, setLinks] = useState<NavigationLink[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState("");
  const [category, setCategory] = useState(DEFAULT);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ link: NavigationLink | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api<{ links: NavigationLink[] }>("/links", { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : undefined });
      setLinks(result.links);
      setStatus("online");
    } catch (error) {
      if (signal?.aborted) return;
      setStatus("offline");
      setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "连接超时，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !editor) {
        event.preventDefault(); searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [editor]);

  const save = useCallback((link: NavigationLink) => {
    setLinks((current) => current.some((item) => item._id === link._id) ? current.map((item) => item._id === link._id ? link : item) : [...current, link]);
    setStatus("online");
    setError("");
  }, []);
  useWebMcp(links, status === "online", save);

  const categories = [...new Set(links.flatMap((link) => link.categories))];
  const tabs = [{ value: DEFAULT, label: "默认分组" }, { value: ALL, label: "全部收藏" }, ...categories.map((name) => ({ value: `category:${name}`, label: name }))];
  const activeCategory = tabs.some((tab) => tab.value === category) ? category : DEFAULT;
  const selectedLabel = tabs.find((tab) => tab.value === activeCategory)?.label;
  const term = query.trim().toLocaleLowerCase();
  const visible = links.filter((link) => {
    const matchCategory = activeCategory === ALL || (activeCategory === DEFAULT ? link.isDefault : link.categories.includes(activeCategory.slice(9)));
    return matchCategory && (!term || [link.title, link.url, link.note, ...link.categories].join(" ").toLocaleLowerCase().includes(term));
  });

  function added(link: NavigationLink) {
    save(link);
    setQuery("");
    if (!editor?.link) setCategory(link.isDefault ? DEFAULT : ALL);
  }

  return <div className="page-shell flex min-h-dvh flex-col">
    <a href="#main" className="skip-link">跳转到收藏</a>
    <header className="border-b border-border/70">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="栖点首页"><span className="brand-symbol"><Compass className="size-5" strokeWidth={1.5} /></span><span className="text-lg font-semibold tracking-[0.14em]">栖点</span><span className="ml-2 hidden text-[10px] tracking-[0.2em] text-muted-foreground sm:inline">YOUR LITTLE CORNER</span></Link>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-lg" aria-label="切换明暗主题" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" /><Moon className="theme-moon" /></Button>
          <Button size="lg" onClick={() => setEditor({ link: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />添加链接</Button>
        </div>
      </div>
    </header>

    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-20 sm:px-8 sm:pt-20">
      <section className="mb-12 flex items-end justify-between gap-8 sm:mb-14" aria-label="欢迎回来">
        <Greeting />
        <div className="hidden items-center gap-3 pb-1 text-muted-foreground lg:flex"><ArrowUpRight className="size-10" strokeWidth={1} /><span className="text-xs leading-relaxed">小小的入口<br />大大的世界</span></div>
      </section>

      <section aria-label="收藏导航" className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5"><Bookmark className="size-4 text-primary" /><h2 className="text-sm font-medium">我的收藏</h2><Badge variant="secondary">{links.length}</Badge></div>
          <InputGroup className="h-10 sm:max-w-80">
            <InputGroupInput ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、网址或分类…" aria-label="搜索收藏" onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} />
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupAddon align="inline-end">{query ? <InputGroupButton size="icon-xs" aria-label="清空搜索" onClick={() => setQuery("")}><X /></InputGroupButton> : <kbd className="hidden text-[10px] sm:block">⌘ K</kbd>}</InputGroupAddon>
          </InputGroup>
        </div>

        {status === "offline" && <Alert>
          <CircleAlert /><AlertTitle>收藏库暂时未连接</AlertTitle>
          <AlertDescription><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setStatus("loading"); setError(""); void load(); }}><RefreshCw data-icon="inline-start" />重新连接</Button></AlertDescription>
        </Alert>}

        <Tabs value={activeCategory} onValueChange={setCategory} className="gap-7">
          <div className="max-w-full overflow-x-auto pb-1"><TabsList variant="line" aria-label="分类筛选">
            {tabs.map((tab) => <TabsTrigger value={tab.value} key={tab.value}>{tab.value === DEFAULT && <LayoutGrid />}{tab.label}</TabsTrigger>)}
          </TabsList></div>
          {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value}>
            <div aria-live="polite" aria-busy={status === "loading"}>
              {status === "loading" && !links.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="正在加载收藏">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-60 rounded-xl" />)}</div>
                : visible.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible.map((link) => <LinkCard key={link._id} link={link} onEdit={() => setEditor({ link })} editable={status === "online"} />)}</div>
                  : <Empty className="min-h-64 border border-dashed">
                    <EmptyHeader><EmptyMedia variant="icon">{term ? <Search /> : <Bookmark />}</EmptyMedia><EmptyTitle>{status === "offline" ? "等待与你的收藏重逢" : term ? "没有找到相关收藏" : "这里还很安静"}</EmptyTitle><EmptyDescription>{status === "offline" ? "连接恢复后，你的收藏会出现在这里。" : term ? "试试其他关键词，或查看全部收藏。" : "添加一个喜欢的网站，开始构建自己的小天地。"}</EmptyDescription></EmptyHeader>
                    <EmptyContent>{term ? <Button variant="outline" onClick={() => { setQuery(""); setCategory(ALL); }}>查看全部收藏</Button> : <Button variant="outline" onClick={() => setEditor({ link: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />添加第一个链接</Button>}</EmptyContent>
                  </Empty>}
            </div>
          </TabsContent>)}
        </Tabs>
        <p className="text-xs text-muted-foreground" role="status">{status === "loading" ? "正在整理你的收藏…" : `${selectedLabel} · ${visible.length} 个链接${term ? ` · 搜索「${query.trim()}」` : ""}`}</p>
      </section>
    </main>

    <footer className="mx-auto w-full max-w-6xl px-5 pb-7 sm:px-8">
      <Separator className="mb-6" />
      <div className="flex flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">{status === "online" ? <Check className="size-3 text-primary" /> : <span className="size-1.5 rounded-full bg-muted-foreground" />}{status === "online" ? "收藏已连接 · 数据保存在本机" : status === "loading" ? "正在连接收藏库" : "收藏库离线"}</span>
        <span className="text-[10px] tracking-[0.18em]">A PLACE FOR YOUR EVERYDAY INTERNET.</span>
      </div>
    </footer>
    {editor && <LinkEditor link={editor.link} onClose={() => setEditor(null)} onSaved={added} onDeleted={(id) => { setLinks((current) => current.filter((link) => link._id !== id)); }} />}
  </div>;
}
