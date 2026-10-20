/**
 * 驗證用的 build：輸出到 .next-verify，不碰 `npm run dev` 正在用的 .next。
 * 直接跑 `npm run build` 會清掉並重建 .next，開著的 dev server 會噴
 * 「ENOENT: ... _buildManifest.js.tmp.xxx」而且熱重載失效，得重開才會好。
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-verify" },
});
process.exit(result.status ?? 1);
