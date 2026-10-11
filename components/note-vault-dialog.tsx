"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { unlockNote, type NavigationNote } from "@/lib/notes";
import { offerToSaveNotePassword, SHARED_NOTE_CREDENTIAL } from "@/lib/password-manager";

interface Props {
  open: boolean;
  notes: NavigationNote[];
  onOpenChange: (open: boolean) => void;
  onUnlocked: (password: string) => void;
}

export function NoteVaultDialog(props: Props) {
  return <NoteVaultDialogContent key={String(props.open)} {...props} />;
}

function NoteVaultDialogContent({ open, notes, onOpenChange, onUnlocked }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const existing = notes.find((note) => note.encrypted?.version === 2);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    setBusy(true);
    setError("");
    try {
      if (existing) await unlockNote(existing, password);
      else {
        if (password.length < 12) throw new Error("共用密码至少需要 12 个字符");
        if (password !== formData.get("confirmation")) throw new Error("两次输入的密码不一致");
      }
      onUnlocked(password);
      if (!existing) void offerToSaveNotePassword(password);
      onOpenChange(false);
      toast.success(existing ? "加密笔记已解锁" : "共用密码已设置");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "密码验证失败"); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{existing ? "解锁加密笔记" : "设置加密笔记共用密码"}</DialogTitle>
        <DialogDescription>{existing ? "输入一次共用密码，即可在本页会话中查看、编辑和新增加密笔记。" : "所有新加密笔记使用这一个密码。设置后本页会话保持解锁。"}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <input id="vault-username" className="sr-only" name="username" autoComplete="username" readOnly value={SHARED_NOTE_CREDENTIAL} tabIndex={-1} aria-hidden="true" />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="vault-password">共用密码</FieldLabel>
            <Input id="vault-password" name="password" type="password" autoComplete={existing ? "current-password" : "new-password"} required minLength={existing ? undefined : 12} disabled={busy} />
            <FieldDescription>密码管理器中的用户名是 {SHARED_NOTE_CREDENTIAL}；GitHub 令牌是另一条凭据。</FieldDescription>
          </Field>
          {!existing && <Field><FieldLabel htmlFor="vault-confirmation">确认共用密码</FieldLabel><Input id="vault-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} disabled={busy} /></Field>}
        </FieldGroup>
        <p className="text-xs text-muted-foreground">刷新页面后需要再次解锁；本站不会把共用密码写入 IndexedDB。</p>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy ? "处理中…" : existing ? "解锁" : "设置密码"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
