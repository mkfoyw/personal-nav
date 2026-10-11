"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { rotateNoteKey } from "@/lib/indexed-db";
import type { NavigationNote } from "@/lib/notes";
import { offerToSaveNotePassword, SHARED_NOTE_CREDENTIAL } from "@/lib/password-manager";

interface Props {
  open: boolean;
  notes: NavigationNote[];
  currentPassword: string;
  onOpenChange: (open: boolean) => void;
  onRotated: (notes: NavigationNote[], password: string) => void;
}

export function NoteKeyRotationDialog(props: Props) {
  return <NoteKeyRotationDialogContent key={String(props.open)} {...props} />;
}

function NoteKeyRotationDialogContent({ open, notes, currentPassword, onOpenChange, onRotated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const encryptedCount = notes.filter((note) => note.encrypted?.version === 2).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("new-password") ?? "");
    setBusy(true); setError("");
    try {
      if (password !== formData.get("confirm-password")) throw new Error("两次输入的新密码不一致");
      const rotated = await rotateNoteKey(currentPassword, password);
      onRotated(rotated, password);
      void offerToSaveNotePassword(password);
      onOpenChange(false);
      toast.success(`已迁移 ${encryptedCount} 篇加密笔记`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "迁移失败，笔记保持原样"); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>更换加密笔记共用密码</DialogTitle>
        <DialogDescription>将 {encryptedCount} 篇加密笔记一起解密并用新密码重新加密。普通笔记不会改变。</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <input className="sr-only" name="username" autoComplete="username" readOnly value={SHARED_NOTE_CREDENTIAL} tabIndex={-1} aria-hidden="true" />
        <FieldGroup>
          <Field><FieldLabel htmlFor="rotation-new-password">新共用密码</FieldLabel><Input id="rotation-new-password" name="new-password" type="password" autoComplete="new-password" minLength={12} required disabled={busy} /><FieldDescription>至少 12 个字符，且与当前共用密码不同。</FieldDescription></Field>
          <Field><FieldLabel htmlFor="rotation-confirm-password">确认新密码</FieldLabel><Input id="rotation-confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={12} required disabled={busy} /></Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground">迁移成功后请重新导出或同步备份。旧备份和 GitHub 历史版本仍需旧密码，请妥善保留。</p>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy ? "正在迁移全部笔记…" : `迁移 ${encryptedCount} 篇笔记`}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
