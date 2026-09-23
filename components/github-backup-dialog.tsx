"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { downloadLinksFromGitHub, uploadLinksToGitHub } from "@/lib/github-sync";
import { clearGitHubBackupSettings, replaceLinks, saveGitHubBackupSettings, type GitHubBackupSettings } from "@/lib/indexed-db";
import type { NavigationLink } from "@/lib/links";

interface Props {
  open: boolean;
  settings: GitHubBackupSettings | null;
  links: NavigationLink[];
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: (settings: GitHubBackupSettings | null) => void;
  onRestored: (links: NavigationLink[]) => void;
}

export function GitHubBackupDialog({ open, settings, links, onOpenChange, onSettingsSaved, onRestored }: Props) {
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRepository(settings?.repository ?? "");
    setBranch(settings?.branch || "main");
    setToken(settings?.token ?? "");
    setError("");
  }, [open, settings]);

  function currentSettings(): GitHubBackupSettings {
    const normalized = { repository: repository.trim(), branch: branch.trim(), token: token.trim() };
    if (!normalized.repository) throw new Error("请输入私有仓库地址");
    if (!normalized.branch) throw new Error("请输入仓库分支");
    if (!normalized.token) throw new Error("请输入 fine-grained access token");
    return normalized;
  }

  async function persistSettings() {
    const value = currentSettings();
    await saveGitHubBackupSettings(value);
    onSettingsSaved(value);
    return value;
  }

  async function save() {
    setError("");
    try {
      await persistSettings();
      toast.success("GitHub 备份设置已保存到此浏览器");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "设置保存失败");
    }
  }

  async function forgetSettings() {
    setError("");
    try {
      await clearGitHubBackupSettings();
      setRepository("");
      setBranch("main");
      setToken("");
      onSettingsSaved(null);
      toast.success("已清除当前浏览器保存的 GitHub 令牌");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清除设置失败");
    }
  }

  async function sync() {
    setBusy(true);
    setError("");
    try {
      const value = await persistSettings();
      await uploadLinksToGitHub(value, links);
      toast.success(`已同步 ${links.length} 个收藏到 GitHub`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败，请稍后重试");
    } finally { setBusy(false); }
  }

  async function restore() {
    setBusy(true);
    setError("");
    setConfirmRestore(false);
    try {
      const value = await persistSettings();
      const restored = await downloadLinksFromGitHub(value);
      await replaceLinks(restored);
      onRestored(restored);
      toast.success(`已从 GitHub 恢复 ${restored.length} 个收藏`);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败，请稍后重试");
    } finally { setBusy(false); }
  }

  return <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>GitHub 私有备份</DialogTitle>
          <DialogDescription>把当前浏览器的收藏保存到你的私有仓库，也可以从仓库恢复。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-repository">私有仓库</FieldLabel>
            <Input id="github-repository" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="用户名/仓库名" autoComplete="off" />
            <FieldDescription><a href="https://github.com/new" target="_blank" rel="noopener noreferrer">创建私有仓库</a>时勾选 README，生成初始分支后填写 owner/repository。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="github-branch">分支</FieldLabel>
            <Input id="github-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" autoComplete="off" />
          </Field>
          <Field>
            <FieldLabel htmlFor="github-token">Fine-grained access token</FieldLabel>
            <Input id="github-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="github_pat_…" autoComplete="new-password" />
            <FieldDescription>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">创建令牌</a>时，只选这个仓库，并授予 Contents 读写权限。令牌保存在当前浏览器的 IndexedDB 中，仅用于直连 GitHub。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground">备份文件：<span className="font-mono">qidian-navigation-backup.json</span>。恢复会替换当前浏览器的收藏。</p>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter className="-mx-4 -mb-4 flex-col-reverse sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void save()} disabled={busy}>保存设置</Button>
            {settings && <Button type="button" variant="ghost" onClick={() => void forgetSettings()} disabled={busy}>清除本机令牌</Button>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setConfirmRestore(true)} disabled={busy}>{busy ? "处理中…" : "从 GitHub 恢复"}</Button>
            <Button type="button" onClick={() => void sync()} disabled={busy || !links.length}>{busy ? "正在同步…" : "同步到 GitHub"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>从 GitHub 恢复收藏？</AlertDialogTitle>
          <AlertDialogDescription>当前浏览器里的收藏会被仓库备份完整替换。建议先将当前收藏同步到 GitHub。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void restore(); }}>确认恢复</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
