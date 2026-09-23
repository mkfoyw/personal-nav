"use client";

import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createNote, deleteNote, updateNote } from "@/lib/indexed-db";
import type { NavigationNote, NoteInput } from "@/lib/notes";

interface Props {
  note: NavigationNote | null;
  onClose: () => void;
  onSaved: (note: NavigationNote) => void;
  onDeleted: (id: string) => void;
}

export function NoteEditor({ note, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [tags, setTags] = useState(note?.tags.join("，") ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const input: NoteInput = { title, content, tags: tags.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean) };
      const saved = note ? await updateNote(note._id, input) : await createNote(input);
      onSaved(saved);
      toast.success(note ? "笔记已更新" : "笔记已创建");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!note || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteNote(note._id);
      onDeleted(note._id);
      toast.success("笔记已删除");
      onClose();
    } catch (cause) {
      setConfirmDelete(false);
      setError(cause instanceof Error ? cause.message : "删除失败，请重试");
    } finally { setBusy(false); }
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{note ? "编辑笔记" : "新建笔记"}</DialogTitle>
          <DialogDescription>正文支持 Markdown，可预览常用排版、链接、任务列表和表格。</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="note-title">标题</FieldLabel>
              <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这篇笔记起个名字" required maxLength={120} autoComplete="off" disabled={busy} />
            </Field>
            <Field>
              <FieldLabel htmlFor="note-tags">标签</FieldLabel>
              <Input id="note-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="工作，灵感，待读" autoComplete="off" disabled={busy} />
              <FieldDescription>用逗号分隔，笔记页可按标签筛选。</FieldDescription>
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="note-content">正文（Markdown）</FieldLabel>
                <div className="flex gap-1" role="group" aria-label="正文编辑模式">
                  <Button type="button" size="sm" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)} disabled={busy}>编辑</Button>
                  <Button type="button" size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)} disabled={busy}>预览</Button>
                </div>
              </div>
              {preview ? <div className="markdown-content min-h-64 rounded-lg border bg-muted/30 p-4" aria-label="Markdown 预览">
                {content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown> : <p className="text-sm text-muted-foreground">输入正文后即可预览。</p>}
              </div> : <textarea id="note-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder={"# 标题\n\n写下你的想法…\n\n- 支持列表、链接和代码"} maxLength={100_000} disabled={busy} className="min-h-64 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50" />}
            </Field>
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            {note && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 data-icon="inline-start" />删除笔记</Button>}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{busy ? "处理中…" : "保存笔记"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>删除「{note?.title}」？</AlertDialogTitle><AlertDialogDescription>这篇笔记将从当前浏览器中移除。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>保留笔记</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{busy ? "正在删除…" : "确认删除"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
