import type { Metadata } from "next";
import { MarketDashboard } from "@/components/market-dashboard";

export const metadata: Metadata = { title: "行情 · 栖点", description: "浏览加密货币现货、加密永续与股票、商品等 TradFi 永续行情，自选和缓存仅保存在当前浏览器。" };

export default function MarketsPage() { return <MarketDashboard />; }
