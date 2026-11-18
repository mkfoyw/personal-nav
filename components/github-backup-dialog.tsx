"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { downloadLinksFromGitHub, downloadMarketsFromGitHub, uploadLinksToGitHub, uploadMarketsToGitHub } from "@/lib/github-sync";
import { clearGitHubBackupSettings, replaceLibraryData, saveGitHubBackupSettings, type GitHubBackupSettings } from "@/lib/indexed-db";
import type { NavigationLink } from "@/lib/links";
import type { NavigationNote } from "@/lib/notes";
import type { MarketSettings } from "@/lib/markets";

interface CommonProps {
  open: boolean;
  settings: GitHubBackupSettings | null;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: (settings: GitHubBackupSettings | null) => void;
}

type Props = CommonProps & ({
  scope?: "navigation";
  links: NavigationLink[];
  notes: NavigationNote[];
  categoryOrder: string[];
  onRestored: (links: NavigationLink[], notes: NavigationNote[], categoryOrder?: string[]) => void;
} | {
  scope: "markets";
  marketSettings: MarketSettings;
  onRestored: (settings: MarketSettings) => Promise<void>;
});

export function GitHubBackupDialog(props: Props) {
  return <GitHubBackupDialogContent key={String(props.open)} {...props} />;
}

function GitHubBackupDialogContent(props: Props) {
  const { open, settings, onOpenChange, onSettingsSaved } = props;
  const isMarkets = props.scope === "markets";
  const [repository, setRepository] = useState(settings?.repository ?? "");
  const [branch, setBranch] = useState(settings?.branch || "main");
  const [token, setToken] = useState(settings?.token ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const repositoryUrl = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.trim())
    ? `https://github.com/${repository.trim().split("/").map(encodeURIComponent).join("/")}`
    : undefined;

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
      if (props.scope === "markets") {
        await uploadMarketsToGitHub(value, props.marketSettings);
        toast.success(`已压缩同步 ${props.marketSettings.favorites.length} 个自选及标签、顺序和设置到 GitHub`);
      } else {
        await uploadLinksToGitHub(value, props.links, props.notes, props.categoryOrder);
        toast.success(`已同步 ${props.links.length} 个链接和 ${props.notes.length} 篇笔记到 GitHub`);
      }
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
      if (props.scope === "markets") {
        const restored = await downloadMarketsFromGitHub(value);
        await props.onRestored(restored);
        toast.success(`已从 GitHub 恢复 ${restored.favorites.length} 个自选及标签、顺序和设置`);
      } else {
        const restored = await downloadLinksFromGitHub(value);
        await replaceLibraryData(restored.links, restored.notes, restored.categoryOrder);
        props.onRestored(restored.links, restored.notes, restored.categoryOrder);
        toast.success(`已从 GitHub 恢复 ${restored.links.length} 个链接和 ${restored.notes.length} 篇笔记`);
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败，请稍后重试");
    } finally { setBusy(false); }
  }

  return <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isMarkets ? "行情 · GitHub 私有备份" : "GitHub 私有备份"}</DialogTitle>
          <DialogDescription>{isMarkets ? "把自选、标签、自选与标签顺序、展示方式和刷新设置压缩后保存到私有仓库，也可以从仓库恢复。压缩不会加密数据。" : "把当前浏览器的链接、分组顺序和 Markdown 笔记压缩后保存到私有仓库，也可以从仓库恢复。加密笔记保持密文；压缩不会加密其他数据。"}</DialogDescription>
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
        <p className="text-xs text-muted-foreground">{isMarkets ? <>备份文件：{repositoryUrl ? <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" title="在新标签页打开备份仓库" className="rounded font-mono text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary">qidian-markets-backup.json.gz</a> : <span className="font-mono" title="填写私有仓库后可点击打开">qidian-markets-backup.json.gz</span>}。与导航页共用仓库和令牌设置，使用独立文件。恢复会替换本机行情自选与设置；实时行情、走势缓存和令牌不随备份上传。</> : <>新备份文件：<span className="font-mono">qidian-navigation-backup.json.gz</span>。可恢复旧版 .json 备份；恢复会替换当前浏览器的链接、笔记和备份中的分组顺序。</>}</p>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter className="-mx-4 -mb-4 flex-col-reverse sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void save()} disabled={busy}>保存设置</Button>
            {settings && <Button type="button" variant="ghost" onClick={() => void forgetSettings()} disabled={busy}>清除本机令牌</Button>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setConfirmRestore(true)} disabled={busy}>{busy ? "处理中…" : "从 GitHub 恢复"}</Button>
            <Button type="button" onClick={() => void sync()} disabled={busy || (props.scope !== "markets" && !props.links.length && !props.notes.length)}>{busy ? "正在同步…" : "同步到 GitHub"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>从 GitHub 恢复数据？</AlertDialogTitle>
          <AlertDialogDescription>{isMarkets ? "当前浏览器的行情自选、标签、顺序和展示设置会被仓库备份完整替换。建议先导出当前自选备份。" : "当前浏览器里的链接和笔记会被仓库备份完整替换。建议先将当前数据同步到 GitHub。"}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void restore(); }}>确认恢复</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
