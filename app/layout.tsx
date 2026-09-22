import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "栖点 · 个人导航",
  description: "收藏常去的地方，让每一次出发都简单一点。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" suppressHydrationWarning><body><ThemeProvider>{children}<Toaster position="bottom-center" /></ThemeProvider></body></html>;
}
