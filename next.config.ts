import type { NextConfig } from "next";

// NEXT_DIST_DIR 讓驗證用的 build 輸出到別的資料夾（例如 .next-verify），
// 才不會在 `npm run dev` 開著時覆寫它正在用的 .next。
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: process.env.GITHUB_PAGES === "true" ? "export" : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  // 每次 build（含 dev 重啟）換一個版本號，資料檔網址會帶上它，避免新程式讀到瀏覽器快取的舊資料。
  env: { NEXT_PUBLIC_DATA_VERSION: Date.now().toString(36) },
};
export default nextConfig;
