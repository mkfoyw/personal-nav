"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTheme } from "next-themes";
import { Bookmark, Check, CircleAlert, Compass, Database, Download, LayoutGrid, Moon, Plus, RefreshCw, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkCard } from "@/components/link-card";
import { LinkEditor } from "@/components/link-editor";
import { useWebMcp } from "@/hooks/use-web-mcp";
import { importAndMergeLinks, initializeLinks, replaceLinks } from "@/lib/indexed-db";
import { createLinkExport, parseLinkImport } from "@/lib/link-transfer";
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
  const [editor, setEditor] = useState<{ link: NavigationLink | null } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const load = useCallback(async () => {
    try {
      setLinks(await initializeLinks());
      setStatus("online");
      setError("");
    } catch (error) {
      setStatus("offline");
      setError(error instanceof Error ? error.message : "无法打开浏览器存储，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = useCallback((link: NavigationLink) => {
    setLinks((current) => current.some((item) => item._id === link._id) ? current.map((item) => item._id === link._id ? link : item) : [...current, link]);
    setStatus("online");
    setError("");
  }, []);
  useWebMcp(links, status === "online", save);

  const categories = [...new Set(links.flatMap((link) => link.categories))];
  const tabs = [{ value: DEFAULT, label: "默认分组" }, { value: ALL, label: "全部收藏" }, ...categories.map((name) => ({ value: `category:${name}`, label: name }))];
  const activeCategory = tabs.some((tab) => tab.value === category) ? category : DEFAULT;
  const visible = links.filter((link) => activeCategory === ALL || (activeCategory === DEFAULT ? link.isDefault : link.categories.includes(activeCategory.slice(9))));

  function added(link: NavigationLink) {
    save(link);
    if (!editor?.link) setCategory(link.isDefault ? DEFAULT : ALL);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10_000_000) return toast.error("备份文件不能超过 10 MB");
    setTransferBusy(true);
    try {
      const imported = parseLinkImport(JSON.parse(await file.text()));
      const hasOnlyStarterLinks = links.every((link) => link._id.startsWith("starter-"));
      const merged = hasOnlyStarterLinks ? imported : await importAndMergeLinks(imported);
      if (hasOnlyStarterLinks) await replaceLinks(imported);
      setLinks(merged);
      setStatus("online");
      setError("");
      toast.success(`已导入 ${imported.length} 个链接`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败，请检查文件内容");
    } finally { setTransferBusy(false); }
  }

  function exportData() {
    try {
      const content = JSON.stringify(createLinkExport(links), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `qidian-links-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`已导出 ${links.length} 个链接`);
    } catch { toast.error("导出失败，请稍后重试"); }
  }

  return <div className="page-shell flex min-h-dvh flex-col">
    <a href="#main" className="skip-link">跳转到收藏</a>
    <header className="border-b border-border/70">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="栖点首页"><span className="brand-symbol"><Compass className="size-5" strokeWidth={1.5} /></span><span className="text-lg font-semibold tracking-[0.14em]">栖点</span><span className="ml-2 hidden text-[10px] tracking-[0.2em] text-muted-foreground sm:inline">YOUR LITTLE CORNER</span></Link>
        <div className="flex items-center gap-3">
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={importData} />
          <Button variant="ghost" size="icon-lg" aria-label="切换明暗主题" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" /><Moon className="theme-moon" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-lg" aria-label="导入或导出数据" title="导入或导出数据"><Database /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>浏览器数据</DropdownMenuLabel>
              <DropdownMenuItem disabled={transferBusy || status !== "online"} onSelect={() => importRef.current?.click()}><Upload />导入 JSON</DropdownMenuItem>
              <DropdownMenuItem disabled={transferBusy || status !== "online" || !links.length} onSelect={exportData}><Download />导出 JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="lg" onClick={() => setEditor({ link: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />添加链接</Button>
        </div>
      </div>
    </header>

    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-20 sm:px-8 sm:pt-20">
      <section className="mb-12 sm:mb-14" aria-label="欢迎回来">
        <Greeting />
      </section>
      <section aria-label="收藏导航" className="flex flex-col gap-6">
        {status === "offline" && <Alert>
          <CircleAlert /><AlertTitle>浏览器存储暂时不可用</AlertTitle>
          <AlertDescription><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setStatus("loading"); setError(""); void load(); }}><RefreshCw data-icon="inline-start" />重新尝试</Button></AlertDescription>
        </Alert>}

        <Tabs value={activeCategory} onValueChange={setCategory} className="gap-7">
          <div className="max-w-full pb-1"><TabsList variant="line" className="!h-auto w-full flex-wrap justify-start gap-2 py-1" aria-label="分类筛选">
            {tabs.map((tab) => <TabsTrigger className="h-9 flex-none rounded-lg border-border bg-background px-3 py-1.5 shadow-xs after:hidden hover:bg-muted/50 data-active:border-primary data-active:bg-primary/5 data-active:text-primary dark:data-active:border-primary dark:data-active:bg-primary/10" value={tab.value} key={tab.value}>{tab.value === DEFAULT && <LayoutGrid />}{tab.label}</TabsTrigger>)}
          </TabsList></div>
          {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value}>
            <div aria-live="polite" aria-busy={status === "loading"}>
              {status === "loading" && !links.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="正在加载收藏">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}</div>
                : visible.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{visible.map((link) => <LinkCard key={link._id} link={link} onEdit={() => setEditor({ link })} editable={status === "online"} />)}</div>
                  : <Empty className="min-h-64 border border-dashed">
                    <EmptyHeader><EmptyMedia variant="icon"><Bookmark /></EmptyMedia><EmptyTitle>{status === "offline" ? "暂时无法读取收藏" : "这里还很安静"}</EmptyTitle><EmptyDescription>{status === "offline" ? "浏览器存储恢复后，你的收藏会出现在这里。" : "添加一个喜欢的网站，开始构建自己的小天地。"}</EmptyDescription></EmptyHeader>
                    <EmptyContent><Button variant="outline" onClick={() => setEditor({ link: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />添加第一个链接</Button></EmptyContent>
                  </Empty>}
            </div>
          </TabsContent>)}
        </Tabs>
      </section>
    </main>

    <footer className="mx-auto w-full max-w-6xl px-5 pb-7 sm:px-8">
      <Separator className="mb-6" />
      <div className="flex flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">{status === "online" ? <Check className="size-3 text-primary" /> : <span className="size-1.5 rounded-full bg-muted-foreground" />}{status === "online" ? "数据已保存在此浏览器 · IndexedDB" : status === "loading" ? "正在打开浏览器存储" : "浏览器存储不可用"}</span>
        <span className="text-[10px] tracking-[0.18em]">A PLACE FOR YOUR EVERYDAY INTERNET.</span>
      </div>
    </footer>
    {editor && <LinkEditor link={editor.link} onClose={() => setEditor(null)} onSaved={added} onDeleted={(id) => { setLinks((current) => current.filter((link) => link._id !== id)); }} />}
  </div>;
}
