import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
  title: "MHNow 裝備素材圖鑑",
  description: "查詢魔物獵人 Now 裝備、技能與累積升級素材。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
