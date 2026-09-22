"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLink, deleteLink, updateLink } from "@/lib/indexed-db";
import { linkColors, normalizeLink, type NavigationLink } from "@/lib/links";

interface Props {
  link: NavigationLink | null;
  onClose: () => void;
  onSaved: (link: NavigationLink) => void;
  onDeleted: (id: string) => void;
}

export function LinkEditor({ link, onClose, onSaved, onDeleted }: Props) {
  const [color, setColor] = useState(link?.color || "blue");
  const [isDefault, setIsDefault] = useState(link?.isDefault ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setCategoriesError("");
    const fields = new FormData(event.currentTarget);
    let input;
    try {
      input = normalizeLink({ title: fields.get("title"), url: fields.get("url"), categories: fields.get("categories"), note: fields.get("note"), color, isDefault });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请检查输入内容";
      if (message.includes("分类")) setCategoriesError(message);
      else setError(message);
      return;
    }
    setBusy(true);
    try {
      const saved = link ? await updateLink(link._id, input) : await createLink(input);
      onSaved(saved);
      toast.success(link ? "链接已更新" : "链接已收藏");
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!link || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteLink(link._id);
      onDeleted(link._id);
      toast.success("链接已删除");
      onClose();
    } catch (error) {
      setConfirmDelete(false);
      setError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{link ? "编辑链接" : "收藏一个新的入口"}</DialogTitle>
          <DialogDescription>{link ? "让你的收藏保持井井有条。" : "把常用的网站放在这里，下次出发更轻松。"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          <FieldSet disabled={busy}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="link-title">名称</FieldLabel>
                <Input id="link-title" name="title" defaultValue={link?.title} placeholder="例如：我的工作台" required maxLength={80} autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-url">网址</FieldLabel>
                <Input id="link-url" name="url" defaultValue={link?.url} placeholder="https://example.com" type="url" required maxLength={4096} autoComplete="url" />
              </Field>
              <FieldGroup className="sm:flex-row">
                <Field data-invalid={Boolean(categoriesError)}>
                  <FieldLabel htmlFor="link-categories">分类</FieldLabel>
                  <Input id="link-categories" name="categories" defaultValue={link?.categories.join("，")} placeholder="效率，AI 工具" aria-invalid={Boolean(categoriesError)} aria-describedby="category-help" />
                  <FieldDescription id="category-help">用逗号分隔，最多 10 个。</FieldDescription>
                  {categoriesError && <FieldError>{categoriesError}</FieldError>}
                </Field>
                <Field className="sm:max-w-36">
                  <FieldLabel htmlFor="link-color">标识色彩</FieldLabel>
                  <Select value={color} onValueChange={(value) => setColor(value as keyof typeof linkColors)} disabled={busy}>
                    <SelectTrigger id="link-color" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      {Object.entries(linkColors).map(([value, label]) => <SelectItem key={value} value={value}><span className="color-dot" data-color={value} />{label}</SelectItem>)}
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="link-note">备注（选填）</FieldLabel>
                <Input id="link-note" name="note" defaultValue={link?.note} placeholder="一句话描述它的用途" maxLength={120} />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="link-default">显示在默认分组</FieldLabel>
                  <FieldDescription>打开首页时，优先看到这个链接。</FieldDescription>
                </FieldContent>
                <Switch id="link-default" checked={isDefault} onCheckedChange={setIsDefault} disabled={busy} />
              </Field>
            </FieldGroup>
          </FieldSet>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            {link && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 data-icon="inline-start" />删除链接</Button>}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{busy ? "处理中…" : "保存链接"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{link?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>这个链接将从你的收藏中移除。需要时，你可以重新添加。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>保留链接</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{busy ? "正在删除…" : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
