"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/client-api";
import type { NavigationLink } from "@/lib/links";

type ModelContext = {
  registerTool: (tool: Record<string, unknown>) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
};

export function useWebMcp(links: NavigationLink[], online: boolean, onAdd: (link: NavigationLink) => void) {
  const current = useRef({ links, online, onAdd });
  useEffect(() => { current.current = { links, online, onAdd }; }, [links, online, onAdd]);
  useEffect(() => {
    const context = (navigator as Navigator & { modelContext?: ModelContext }).modelContext
      ?? (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const tools = [{
      name: "list_navigation_links", title: "列出导航链接", description: "读取当前个人导航中的全部链接及连接状态。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => ({ online: current.current.online, links: current.current.links.map((link) => ({
        id: link._id, title: link.title, url: link.url, categories: link.categories, note: link.note, isDefault: link.isDefault,
      })) }),
    }, {
      name: "add_navigation_link", title: "添加导航链接", description: "将一个 http(s) 链接保存到本机 MongoDB，并刷新页面。",
      inputSchema: {
        type: "object", properties: {
          title: { type: "string", minLength: 1, maxLength: 80 }, url: { type: "string", format: "uri" },
          categories: { type: "array", items: { type: "string", minLength: 1, maxLength: 30 }, minItems: 1, maxItems: 10, uniqueItems: true },
          note: { type: "string", maxLength: 120 }, isDefault: { type: "boolean" },
        }, required: ["title", "url"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: Record<string, unknown>) => {
        if (!current.current.online) throw new Error("收藏库尚未连接，请先重试连接");
        const payload = await api<{ link: NavigationLink }>("/links", { method: "POST", body: JSON.stringify({ ...input, color: "blue", isDefault: input.isDefault !== false }) });
        current.current.onAdd(payload.link);
        return { id: payload.link._id, title: payload.link.title, saved: true };
      },
    }];
    for (const tool of tools) {
      try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Optional browser API. */ }
    }
    return () => { for (const tool of tools) context.unregisterTool?.(tool.name); };
  }, []);
}
