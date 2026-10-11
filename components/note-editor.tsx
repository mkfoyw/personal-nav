"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, LockKeyhole, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createNote, deleteNote, updateNote } from "@/lib/indexed-db";
import { unlockNote, type NavigationNote, type NoteInput } from "@/lib/notes";
import { offerToSaveNotePassword, SHARED_NOTE_CREDENTIAL } from "@/lib/password-manager";

interface Props {
  note: NavigationNote | null;
  hasSharedKey: boolean;
  initialUnlock?: { input: NoteInput; password: string };
  existingTags: string[];
  onClose: () => void;
  onSaved: (note: NavigationNote) => void;
  onDeleted: (id: string) => void;
}

export function NoteEditor({ note, hasSharedKey, initialUnlock, existingTags, onClose, onSaved, onDeleted }: Props) {
  const [draftId] = useState(() => crypto.randomUUID());
  const [locked, setLocked] = useState(Boolean(note?.encrypted && !initialUnlock));
  const [protectedNote, setProtectedNote] = useState(Boolean(note?.encrypted));
  const [password, setPassword] = useState(initialUnlock?.password ?? "");
  const [title, setTitle] = useState(initialUnlock?.input.title ?? (note?.encrypted ? "" : note?.title ?? ""));
  const [content, setContent] = useState(initialUnlock?.input.content ?? (note?.encrypted ? "" : note?.content ?? ""));
  const [tags, setTags] = useState(initialUnlock?.input.tags ?? (note?.encrypted ? [] : note?.tags ?? []));
  const [tagInput, setTagInput] = useState("");
  const [isDefault, setIsDefault] = useState(initialUnlock?.input.isDefault ?? (note?.encrypted ? true : note?.isDefault ?? true));
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLegacyNote = note?.encrypted?.version === 1;
  const unlockCredential = isLegacyNote ? `qidian-note:${note._id}` : SHARED_NOTE_CREDENTIAL;

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note?.encrypted || busy) return;
    const enteredPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setError("");
    try {
      const input = await unlockNote(note, enteredPassword);
      setPassword(enteredPassword);
      setTitle(input.title);
      setContent(input.content);
      setTags(input.tags);
      setIsDefault(input.isDefault);
      setLocked(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解锁失败"); }
    finally { setBusy(false); }
  }

  function addTag(value: string) {
    const tag = value.trim();
    if (!tag) return;
    if (!tags.includes(tag)) setTags((current) => [...current, tag]);
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(tagInput);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const savePassword = note?.encrypted ? password : String(formData.get("password") ?? "");
      const sharedPassword = isLegacyNote && hasSharedKey ? String(formData.get("shared-password") ?? "") : undefined;
      if (protectedNote && !note?.encrypted && !hasSharedKey && savePassword !== formData.get("password-confirm")) throw new Error("两次输入的密码不一致");
      if (protectedNote && savePassword.length < 12) throw new Error("密码至少需要 12 个字符");
      const input: NoteInput = { title, content, tags, isDefault };
      const saved = note
        ? await updateNote(note._id, input, protectedNote ? savePassword : note.encrypted ? null : undefined, protectedNote ? sharedPassword : undefined)
        : await createNote(input, protectedNote ? savePassword : undefined, draftId);
      if (protectedNote && !hasSharedKey) void offerToSaveNotePassword(savePassword);
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
          <DialogTitle>{locked ? "解锁笔记" : note ? "编辑笔记" : "新建笔记"}</DialogTitle>
          <DialogDescription>{locked ? isLegacyNote ? "这篇旧版笔记需要原密码；保存时会迁移到共用密钥。" : "输入加密笔记的共用密码后查看和编辑。" : "正文支持 Markdown，可预览常用排版、链接、任务列表和表格。"}</DialogDescription>
        </DialogHeader>
        {locked ? <form onSubmit={unlock} className="flex flex-col gap-4">
          <input id="note-unlock-username" className="sr-only" name="username" autoComplete="username" readOnly value={unlockCredential} tabIndex={-1} aria-hidden="true" />
          <Field><FieldLabel htmlFor="note-unlock-password">{isLegacyNote ? "旧笔记密码" : "共用密码"}</FieldLabel><Input id="note-unlock-password" name="password" type="password" autoComplete="current-password" required disabled={busy} />{!isLegacyNote && <FieldDescription>在浏览器密码管理器中选择 {SHARED_NOTE_CREDENTIAL}，不要选择 GitHub 令牌。</FieldDescription>}</Field>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy ? "正在解锁…" : "解锁"}</Button></DialogFooter>
        </form> : <form onSubmit={save} className="flex flex-col gap-5">
          <FieldGroup>
            <Field orientation="horizontal">
              <div className="flex-1"><FieldLabel htmlFor="note-protected">加密这篇笔记</FieldLabel><FieldDescription>仅这篇笔记的标题、标签和正文会加密；新备份中也保持密文。旧备份不会自动改写，忘记密码后无法恢复。</FieldDescription></div>
              <Switch id="note-protected" checked={protectedNote} onCheckedChange={setProtectedNote} disabled={busy} />
            </Field>
            {protectedNote && <Field>
              <input id="note-credential-username" className="sr-only" name="username" autoComplete="username" readOnly value={SHARED_NOTE_CREDENTIAL} tabIndex={-1} aria-hidden="true" />
              {note?.encrypted ? isLegacyNote ? <>
                <FieldDescription>这篇旧版笔记已解锁。保存后会改用加密笔记的共用密钥。</FieldDescription>
                {hasSharedKey && <><FieldLabel htmlFor="note-shared-password">共用密码</FieldLabel><Input id="note-shared-password" name="shared-password" type="password" autoComplete="current-password" required disabled={busy} /></>}
                {!hasSharedKey && <FieldDescription>原密码将成为共用密码。其他旧版加密笔记需要逐篇打开并保存以迁移。</FieldDescription>}
              </> : <FieldDescription className="flex items-center gap-2"><LockKeyhole className="size-4" />已用共用密码解锁；保存后继续使用同一密钥。</FieldDescription> : <>
                <FieldLabel htmlFor="note-password">{hasSharedKey ? "共用密码" : "设置加密笔记共用密码"}</FieldLabel>
                <Input id="note-password" name="password" type="password" autoComplete={hasSharedKey ? "current-password" : "new-password"} required minLength={12} disabled={busy} />
                {!hasSharedKey && <><FieldLabel htmlFor="note-password-confirm">确认共用密码</FieldLabel><Input id="note-password-confirm" name="password-confirm" type="password" autoComplete="new-password" required minLength={12} disabled={busy} /></>}
                <FieldDescription>{hasSharedKey ? `选择密码管理器中的 ${SHARED_NOTE_CREDENTIAL}，不要选择 GitHub 令牌。` : `只需设置一次。保存到浏览器密码管理器时使用 ${SHARED_NOTE_CREDENTIAL} 作为用户名，与 GitHub 令牌分开。`}</FieldDescription>
              </>}
            </Field>}
            <Field>
              <FieldLabel htmlFor="note-title">标题</FieldLabel>
              <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这篇笔记起个名字" required maxLength={120} autoComplete="off" disabled={busy} />
            </Field>
            <Field>
              <FieldLabel htmlFor="note-tags">标签</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => <button key={tag} type="button" className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground hover:bg-accent" onClick={() => setTags((current) => current.filter((item) => item !== tag))} aria-label={`移除标签 ${tag}`} disabled={busy}>{tag}<span className="ml-1.5 opacity-60">×</span></button>)}
              </div>
              <Input id="note-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={handleTagKeyDown} placeholder="输入标签后按回车" autoComplete="off" disabled={busy} />
              <FieldDescription>按回车添加新标签，或点击已有标签快速添加。</FieldDescription>
              {existingTags.filter((tag) => !tags.includes(tag)).length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="已有标签">
                {existingTags.filter((tag) => !tags.includes(tag)).map((tag) => <Button key={tag} type="button" size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" onClick={() => addTag(tag)} disabled={busy}>{tag}</Button>)}
              </div>}
            </Field>
            {!protectedNote && <Field orientation="horizontal">
              <div className="flex-1">
                <FieldLabel htmlFor="note-default">显示在默认分组</FieldLabel>
                <FieldDescription>打开笔记列表时，默认先显示这篇笔记。</FieldDescription>
              </div>
              <Switch id="note-default" checked={isDefault} onCheckedChange={setIsDefault} disabled={busy} />
            </Field>}
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
        </form>}
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
