export const linkColors = {
  blue: "海蓝", violet: "紫罗兰", cyan: "青绿", pink: "玫红",
  amber: "琥珀", red: "珊瑚红", slate: "石墨", indigo: "靛蓝",
} as const;

export type LinkColor = keyof typeof linkColors;
export interface LinkInput {
  title: string;
  url: string;
  categories: string[];
  category: string;
  note: string;
  color: LinkColor;
  isDefault: boolean;
}
export interface NavigationLink extends LinkInput {
  _id: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class InputError extends Error {}

export function parseCategories(value: string | string[]): string[] {
  const categories = [...new Set((Array.isArray(value) ? value : value.split(/[,，、]/))
    .map((item) => item.trim()).filter(Boolean))];
  if (categories.length > 10) throw new InputError("最多添加 10 个分类");
  if (categories.some((item) => item.length > 30)) throw new InputError("每个分类不能超过 30 个字符");
  return categories.length ? categories : ["其他"];
}

export function normalizeLink(value: unknown): LinkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("请求格式无效");
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    if (input[key] !== undefined && typeof input[key] !== "string") throw new InputError(`${key} 必须是文本`);
    const result = ((input[key] as string | undefined) || "").trim();
    if (required && !result) throw new InputError(key === "title" ? "名称不能为空" : "网址不能为空");
    if (result.length > max) throw new InputError(`${key === "title" ? "名称" : key === "note" ? "备注" : "网址"}过长`);
    return result;
  };
  const title = text("title", 80, true);
  const rawUrl = text("url", 4096, true);
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new InputError("请输入有效的 http(s) 地址"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new InputError("仅支持 http(s) 地址");
  const rawCategories = input.categories ?? input.category ?? "其他";
  if (typeof rawCategories !== "string" && !(Array.isArray(rawCategories) && rawCategories.every((item) => typeof item === "string"))) {
    throw new InputError("分类格式无效");
  }
  const categories = parseCategories(rawCategories as string | string[]);
  if (input.isDefault !== undefined && typeof input.isDefault !== "boolean") throw new InputError("默认分组设置无效");
  const color = input.color ?? "blue";
  if (typeof color !== "string" || !Object.hasOwn(linkColors, color)) throw new InputError("请选择有效的色彩");
  return { title, url: url.href, categories, category: categories[0], note: text("note", 120), color: color as LinkColor, isDefault: input.isDefault === true };
}

export const defaultLinks: LinkInput[] = [
  { title: "ChatGPT", url: "https://chatgpt.com", categories: ["AI 工具", "效率"], note: "思考、写作与创造", color: "blue" },
  { title: "GitHub", url: "https://github.com", categories: ["开发"], note: "代码与项目", color: "violet" },
  { title: "Notion", url: "https://notion.so", categories: ["效率"], note: "知识与计划", color: "slate" },
  { title: "Figma", url: "https://figma.com", categories: ["设计"], note: "界面与原型", color: "pink" },
  { title: "Linear", url: "https://linear.app", categories: ["效率", "开发"], note: "任务与协作", color: "indigo" },
  { title: "哔哩哔哩", url: "https://bilibili.com", categories: ["灵感"], note: "视频与学习", color: "cyan" },
  { title: "即刻", url: "https://okjike.com", categories: ["灵感"], note: "发现有趣的人", color: "amber" },
  { title: "少数派", url: "https://sspai.com", categories: ["阅读", "效率"], note: "效率与生活方式", color: "red" },
].map((link) => ({ ...link, color: link.color as LinkColor, category: link.categories[0], isDefault: true }));
