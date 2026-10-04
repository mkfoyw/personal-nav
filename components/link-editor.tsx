"use client";

import { useState, type FormEvent } from "react";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLink, deleteLink, updateLink } from "@/lib/indexed-db";
import { normalizeLink, parseCategories, type NavigationLink } from "@/lib/links";

interface Props {
  link: NavigationLink | null;
  availableCategories: string[];
  onClose: () => void;
  onSaved: (link: NavigationLink) => void;
  onDeleted: (id: string) => void;
}

export function LinkEditor({ link, availableCategories, onClose, onSaved, onDeleted }: Props) {
  const [isDefault, setIsDefault] = useState(link?.isDefault ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(link?.categories ?? []);
  const [categoryInput, setCategoryInput] = useState("");
  const suggestions = availableCategories.filter((name) => name.toLocaleLowerCase().includes(categoryInput.trim().toLocaleLowerCase()));

  function toggleCategory(name: string) {
    setCategoriesError("");
    if (selectedCategories.includes(name)) {
      setSelectedCategories(selectedCategories.filter((item) => item !== name));
    } else if (selectedCategories.length >= 10) {
      setCategoriesError("最多选择 10 个分类");
    } else {
      setSelectedCategories([...selectedCategories, name]);
      setCategoryInput("");
    }
  }

  function addCategory() {
    if (!categoryInput.trim()) return;
    try {
      setSelectedCategories(parseCategories([...selectedCategories, ...parseCategories(categoryInput)]));
      setCategoryInput("");
      setCategoriesError("");
    } catch (error) { setCategoriesError(error instanceof Error ? error.message : "分类格式无效"); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setCategoriesError("");
    const fields = new FormData(event.currentTarget);
    let input;
    try {
      const categories = categoryInput.trim() ? [...selectedCategories, ...parseCategories(categoryInput)] : selectedCategories;
      input = normalizeLink({ title: fields.get("title"), url: fields.get("url"), categories, note: fields.get("note"), isDefault });
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
              <Field data-invalid={Boolean(categoriesError)}>
                <FieldLabel htmlFor="link-categories">分类</FieldLabel>
                {selectedCategories.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="已选分类">
                  {selectedCategories.map((name) => <button key={name} type="button" onClick={() => toggleCategory(name)} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`移除分类 ${name}`}><span className="truncate">{name}</span><X className="size-3 shrink-0" aria-hidden="true" /></button>)}
                </div>}
                <Input id="link-categories" value={categoryInput} onChange={(event) => { setCategoryInput(event.target.value); setCategoriesError(""); }} placeholder="输入分类，按空格添加" autoComplete="off" aria-invalid={Boolean(categoriesError)} aria-describedby={categoriesError ? "category-error" : undefined} onKeyDown={(event) => {
                  if ((event.key === " " || event.key === "Enter") && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); addCategory(); }
                }} />
                {suggestions.length > 0 && <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="已有分类">
                  {suggestions.map((name) => <button type="button" key={name} aria-pressed={selectedCategories.includes(name)} disabled={!selectedCategories.includes(name) && selectedCategories.length >= 10} onClick={() => toggleCategory(name)} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-primary/40 aria-pressed:text-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring">{selectedCategories.includes(name) && <Check className="size-3 shrink-0" aria-hidden="true" />}<span className="truncate">{name}</span></button>)}
                </div>}
                {categoriesError && <FieldError id="category-error">{categoriesError}</FieldError>}
              </Field>
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
