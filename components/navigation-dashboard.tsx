"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTheme } from "next-themes";
import { Bookmark, Check, CircleAlert, Compass, Database, Download, Cloud, CodeXml, LayoutGrid, Moon, NotebookPen, Plus, RefreshCw, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkCard } from "@/components/link-card";
import { LinkEditor } from "@/components/link-editor";
import { NoteCard } from "@/components/note-card";
import { NoteEditor } from "@/components/note-editor";
import { GitHubBackupDialog } from "@/components/github-backup-dialog";
import { useWebMcp } from "@/hooks/use-web-mcp";
import { getGitHubBackupSettings, initializeLinks, listNotes, replaceLibraryData, saveNoteOrder, type GitHubBackupSettings } from "@/lib/indexed-db";
import { createLinkExport, mergeImportedLinks, mergeImportedNotes, parseLibraryImport } from "@/lib/link-transfer";
import type { NavigationLink } from "@/lib/links";
import type { NavigationNote } from "@/lib/notes";

const DEFAULT = "view:default";
const ALL = "view:all";
const NOTE_DEFAULT = "view:notes-default";
const NOTE_ALL = "view:notes-all";

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
  </div>;
}

export function NavigationDashboard() {
  const [links, setLinks] = useState<NavigationLink[]>([]);
  const [notes, setNotes] = useState<NavigationNote[]>([]);
  const [noteTag, setNoteTag] = useState(NOTE_DEFAULT);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState("");
  const [category, setCategory] = useState(DEFAULT);
  const [editor, setEditor] = useState<{ link: NavigationLink | null } | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ note: NavigationNote | null } | null>(null);
  const [githubBackupOpen, setGithubBackupOpen] = useState(false);
  const [githubSettings, setGithubSettings] = useState<GitHubBackupSettings | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const load = useCallback(async () => {
    try {
      const [savedLinks, savedNotes, savedGitHubSettings] = await Promise.all([initializeLinks(), listNotes(), getGitHubBackupSettings()]);
      setLinks(savedLinks);
      setNotes(savedNotes);
      setGithubSettings(savedGitHubSettings);
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
  const noteTags = [...new Set(notes.flatMap((note) => note.tags))];
  const activeNoteTag = noteTag === NOTE_DEFAULT || noteTag === NOTE_ALL || (noteTag.startsWith("tag:") && noteTags.includes(noteTag.slice(4))) ? noteTag : NOTE_DEFAULT;
  const visibleNotes = notes.filter((note) => activeNoteTag === NOTE_ALL || (activeNoteTag === NOTE_DEFAULT ? note.isDefault !== false : note.tags.includes(activeNoteTag.slice(4))));

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
      const imported = parseLibraryImport(JSON.parse(await file.text()));
      const hasOnlyStarterLinks = links.every((link) => link._id.startsWith("starter-"));
      const nextLinks = hasOnlyStarterLinks ? imported.links : mergeImportedLinks(links, imported.links);
      const nextNotes = hasOnlyStarterLinks && notes.length === 0 ? imported.notes : mergeImportedNotes(notes, imported.notes);
      await replaceLibraryData(nextLinks, nextNotes);
      setLinks(nextLinks);
      setNotes(nextNotes);
      setStatus("online");
      setError("");
      toast.success(`已导入 ${imported.links.length} 个链接和 ${imported.notes.length} 篇笔记`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败，请检查文件内容");
    } finally { setTransferBusy(false); }
  }

  function exportData() {
    try {
      const content = JSON.stringify(createLinkExport(links, notes), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `qidian-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`已导出 ${links.length} 个链接和 ${notes.length} 篇笔记`);
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
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={status !== "online"} onSelect={() => setGithubBackupOpen(true)}><Cloud />GitHub 私有备份</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Button size="lg" onClick={() => setEditor({ link: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />添加链接</Button>
            <Button size="lg" variant="outline" onClick={() => setNoteEditor({ note: null })} disabled={status !== "online"}><NotebookPen data-icon="inline-start" />添加笔记</Button>
          </div>
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
          {tabs.map((tab) => <TabsContent key={tab.value} value={tab.value} className="min-h-[16rem]">
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

        <section aria-label="笔记" className="flex flex-col gap-5 border-t border-border/70 pt-7 sm:pt-9">
          <Tabs value={activeNoteTag} onValueChange={setNoteTag}>
            <TabsList variant="line" className="!h-auto w-full flex-wrap justify-start gap-2 py-1" aria-label="笔记标签筛选">
              {[{ value: NOTE_DEFAULT, label: "默认分组" }, { value: NOTE_ALL, label: "全部笔记" }, ...noteTags.map((tag) => ({ value: `tag:${tag}`, label: tag }))].map((tab) => <TabsTrigger className="h-9 flex-none rounded-lg border-border bg-background px-3 py-1.5 shadow-xs after:hidden hover:bg-muted/50 data-active:border-primary data-active:bg-primary/5 data-active:text-primary dark:data-active:border-primary dark:data-active:bg-primary/10" value={tab.value} key={tab.value}>{tab.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div aria-live="polite" aria-busy={status === "loading"}>
            {status === "loading" && !notes.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="正在加载笔记">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
              : visibleNotes.length ? <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleNotes.map((note, index) => <NoteCard key={note._id} note={note} editable={status === "online"} first={index === 0} last={index === visibleNotes.length - 1} onEdit={() => setNoteEditor({ note })} onMove={(direction) => {
                const target = index + direction;
                if (target < 0 || target >= visibleNotes.length) return;
                const ids = notes.map((item) => item._id);
                const currentIndex = ids.indexOf(note._id);
                const targetIndex = ids.indexOf(visibleNotes[target]._id);
                [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex], ids[currentIndex]];
                void saveNoteOrder(ids).then(setNotes).catch((error) => toast.error(error instanceof Error ? error.message : "排序保存失败"));
              }} />)}</div>
                : <Empty className="min-h-52 border border-dashed"><EmptyHeader><EmptyMedia variant="icon"><NotebookPen /></EmptyMedia><EmptyTitle>{notes.length ? "这个标签下还没有笔记" : "还没有笔记"}</EmptyTitle><EmptyDescription>{notes.length ? "选择其他标签，或为笔记添加这个标签。" : "把想法、清单或资料记下来，支持 Markdown 格式。"}</EmptyDescription></EmptyHeader>{!notes.length && <EmptyContent><Button variant="outline" onClick={() => setNoteEditor({ note: null })} disabled={status !== "online"}><Plus data-icon="inline-start" />新建第一篇笔记</Button></EmptyContent>}</Empty>}
          </div>
        </section>
      </section>
    </main>

    <footer className="mx-auto w-full max-w-6xl px-5 pb-7 sm:px-8">
      <Separator className="mb-6" />
      <div className="flex flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">{status === "online" ? <Check className="size-3 text-primary" /> : <span className="size-1.5 rounded-full bg-muted-foreground" />}{status === "online" ? "数据已保存在此浏览器 · IndexedDB" : status === "loading" ? "正在打开浏览器存储" : "浏览器存储不可用"}</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="text-[10px] tracking-[0.18em]">A PLACE FOR YOUR EVERYDAY INTERNET.</span>
          <a href="https://github.com/mkfoyw/personal-nav" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 py-1 transition-colors hover:text-foreground" aria-label="在新标签页打开 personal-nav 的 GitHub 仓库"><CodeXml className="size-3.5" aria-hidden="true" />GitHub</a>
        </div>
      </div>
    </footer>
    <GitHubBackupDialog
      open={githubBackupOpen}
      settings={githubSettings}
      links={links}
      notes={notes}
      onOpenChange={setGithubBackupOpen}
      onSettingsSaved={setGithubSettings}
      onRestored={(restoredLinks, restoredNotes) => { setLinks(restoredLinks); setNotes(restoredNotes); setStatus("online"); setError(""); setCategory(DEFAULT); }}
    />
    {editor && <LinkEditor link={editor.link} onClose={() => setEditor(null)} onSaved={added} onDeleted={(id) => { setLinks((current) => current.filter((link) => link._id !== id)); }} />}
    {noteEditor && <NoteEditor note={noteEditor.note} existingTags={noteTags} onClose={() => setNoteEditor(null)} onSaved={(note) => { setNotes((current) => current.some((item) => item._id === note._id) ? current.map((item) => item._id === note._id ? note : item) : [...current, note]); }} onDeleted={(id) => { setNotes((current) => current.filter((note) => note._id !== id)); }} />}
  </div>;
}
