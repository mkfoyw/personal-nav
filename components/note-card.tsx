"use client";

import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, ArrowUp, Ellipsis, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { unlockNote, type NavigationNote, type NoteInput } from "@/lib/notes";
import { SHARED_NOTE_CREDENTIAL } from "@/lib/password-manager";

interface Props {
  note: NavigationNote;
  editable: boolean;
  first: boolean;
  last: boolean;
  onEdit: (unlocked?: { input: NoteInput; password: string }) => void;
  onMove: (direction: -1 | 1) => void;
}

export function NoteCard({ note, editable, first, last, onEdit, onMove }: Props) {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState<{ input: NoteInput; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = unlocked?.input ?? note;
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) { setUnlocked(null); setError(""); }
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setError("");
    try { setUnlocked({ input: await unlockNote(note, password), password }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "解锁失败"); }
    finally { setBusy(false); }
  }
  function edit() {
    changeOpen(false);
    onEdit(unlocked ?? undefined);
  }
  return <>
    <Card role="article" tabIndex={0} aria-label={`查看笔记 ${note.title}`} className="flex h-64 flex-col gap-0 cursor-pointer py-0 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => changeOpen(true)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); changeOpen(true); } }}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 pt-4 pb-2">
      <CardTitle className="flex min-w-0 items-center gap-2 break-words text-base">{note.encrypted && <LockKeyhole className="size-4 shrink-0" />}{note.title}</CardTitle>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label={`上移 ${note.title}`} title="上移" onClick={(event) => { event.stopPropagation(); onMove(-1); }} disabled={!editable || first}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`下移 ${note.title}`} title="下移" onClick={(event) => { event.stopPropagation(); onMove(1); }} disabled={!editable || last}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${note.title}`} title="编辑笔记" onClick={(event) => { event.stopPropagation(); onEdit(); }} disabled={!editable}><Ellipsis /></Button>
      </div>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-4">
      {note.encrypted ? <p className="text-sm text-muted-foreground">输入密码后查看这篇笔记</p> : note.content ? <div className="note-preview markdown-content text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown></div> : <p className="text-sm text-muted-foreground">还没有正文</p>}
      {note.tags.length > 0 && <div className="mt-auto flex flex-wrap gap-1.5 pt-4">{note.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{tag}</span>)}</div>}
    </CardContent>
    </Card>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) changeOpen(nextOpen); }}>
      <DialogContent className="flex h-[min(82dvh,720px)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-3xl leading-tight font-semibold">{visible.title}</DialogTitle>
        </DialogHeader>
        {note.encrypted && !unlocked ? <form onSubmit={unlock} className="flex flex-col gap-3">
          <input id="note-view-username" className="sr-only" name="username" autoComplete="username" readOnly value={note.encrypted.version === 1 ? `qidian-note:${note._id}` : SHARED_NOTE_CREDENTIAL} tabIndex={-1} aria-hidden="true" />
          <Input name="password" type="password" autoComplete="current-password" aria-label={note.encrypted.version === 1 ? "旧笔记密码" : "共用密码"} placeholder={note.encrypted.version === 1 ? "输入旧笔记密码" : "输入共用密码"} required disabled={busy} />
          {note.encrypted.version === 2 && <p className="text-xs text-muted-foreground">密码管理器中请选择 {SHARED_NOTE_CREDENTIAL}；GitHub 令牌是另一条凭据。</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? "正在解锁…" : "解锁笔记"}</Button>
        </form> : <>
          {visible.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{visible.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{tag}</span>)}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            {visible.content ? <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{visible.content}</ReactMarkdown></div> : <p className="text-sm text-muted-foreground">还没有正文</p>}
          </div>
          {editable && <div className="flex justify-end"><Button variant="outline" onClick={edit}>编辑笔记</Button></div>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
