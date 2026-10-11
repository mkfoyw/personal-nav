import { createLinkExport, parseLibraryImport } from "@/lib/link-transfer";
import { compressBackupJson, decompressBackupJson } from "@/lib/backup-compression";
import type { GitHubBackupSettings } from "@/lib/indexed-db";
import type { NavigationLink } from "@/lib/links";
import type { NavigationNote } from "@/lib/notes";

const API = "https://api.github.com";
const BACKUP_FILE = "qidian-navigation-backup.json.gz";
const LEGACY_BACKUP_FILE = "qidian-navigation-backup.json";

function repositoryPath(repository: string) {
  const parts = repository.trim().split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error("仓库格式应为 owner/repository");
  }
  return parts.map(encodeURIComponent).join("/");
}

function headers(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
  };
}

async function checkedFetch(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...headers(token), ...init?.headers } });
  if (response.ok) return response;
  if (response.status === 401) throw new Error("GitHub 令牌无效或已过期");
  if (response.status === 403) throw new Error("令牌缺少仓库内容读写权限，或已达到 GitHub 请求限制");
  if (response.status === 404) throw new Error("找不到这个私有仓库或备份文件，请检查仓库地址、分支和令牌范围");
  if (response.status === 409) throw new Error("仓库内容刚刚发生变化，请重试同步");
  throw new Error(`GitHub 请求失败（${response.status}）`);
}

async function validatePrivateRepository(settings: GitHubBackupSettings) {
  const path = repositoryPath(settings.repository);
  const response = await checkedFetch(`${API}/repos/${path}`, settings.token);
  const repository = await response.json() as { private?: boolean };
  if (repository.private !== true) throw new Error("这个仓库不是私有仓库；为保护收藏数据，请使用私有仓库");
  return path;
}

async function getBackupFile(settings: GitHubBackupSettings, repository: string, filename: string) {
  const query = new URLSearchParams({ ref: settings.branch });
  const response = await fetch(`${API}/repos/${repository}/contents/${filename}?${query}`, { headers: headers(settings.token) });
  if (response.status === 404) return null;
  if (!response.ok) {
    if (response.status === 401) throw new Error("GitHub 令牌无效或已过期");
    if (response.status === 403) throw new Error("令牌缺少仓库内容读取权限，或已达到 GitHub 请求限制");
    throw new Error(`读取 GitHub 备份失败（${response.status}）`);
  }
  const file = await response.json() as { sha: string; content: string; encoding: string };
  if (file.encoding !== "base64") throw new Error("GitHub 返回了无法识别的备份格式");
  const binary = atob(file.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { sha: file.sha, bytes };
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function uploadLinksToGitHub(settings: GitHubBackupSettings, links: NavigationLink[], notes: NavigationNote[], categoryOrder: string[] = []) {
  const compressed = await compressBackupJson(JSON.stringify(createLinkExport(links, notes, categoryOrder)));
  const repository = await validatePrivateRepository(settings);
  const existing = await getBackupFile(settings, repository, BACKUP_FILE);
  const url = `${API}/repos/${repository}/contents/${BACKUP_FILE}`;
  const body = {
    message: "Update Qidian navigation backup",
    content: encodeBase64(compressed),
    branch: settings.branch,
    ...(existing ? { sha: existing.sha } : {}),
  };
  const response = await checkedFetch(url, settings.token, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return await response.json() as { commit?: { html_url?: string } };
}

export async function downloadLinksFromGitHub(settings: GitHubBackupSettings) {
  const repository = await validatePrivateRepository(settings);
  const compressed = await getBackupFile(settings, repository, BACKUP_FILE);
  const backup = compressed ?? await getBackupFile(settings, repository, LEGACY_BACKUP_FILE);
  if (!backup) throw new Error("这个分支还没有备份文件，请先同步一次");
  let text: string;
  if (compressed) text = await decompressBackupJson(backup.bytes);
  else {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(backup.bytes); }
    catch { throw new Error("GitHub 上的旧版备份不是有效 UTF-8 文本"); }
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("GitHub 上的备份文件不是有效 JSON"); }
  return parseLibraryImport(value);
}
