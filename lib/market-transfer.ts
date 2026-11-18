import { parseSettings, type MarketSettings } from "@/lib/markets";

export function createMarketExport(settings: MarketSettings) {
  return { app: "qidian-markets", version: 1, settings: parseSettings(settings) };
}

export function parseMarketImport(value: unknown): MarketSettings {
  if (!value || typeof value !== "object" || !("app" in value) || value.app !== "qidian-markets" || !("version" in value) || value.version !== 1 || !("settings" in value)) {
    throw new Error("请选择行情页导出的自选备份");
  }
  return parseSettings(value.settings);
}
