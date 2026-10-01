# MHNow

## GitHub Pages 部署

首次設定：

1. 在 GitHub 建立空的 repository（不要勾選建立 README）。公開 repository 的原始碼也能被搜尋；網站的 noindex 不會隱藏 GitHub repository。
2. 在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 在本機執行下列指令，把網址換成你的 repository：

```powershell
git add .
git commit -m "Set up site and GitHub Pages deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

之後更新只需 commit 再 `git push`；推送到 `main` 或 `master` 會自動建置與部署。到 **Actions → Deploy GitHub Pages** 查看進度，完成後在 **Settings → Pages** 取得網址。

Workflow 會用 `npm ci` 安裝套件，再將 Next.js 匯出成靜態網站 `out/`。網址前綴由 Pages 設定自動取得，支援 repository 子路徑與根網域。部署使用已提交的 `public/mhnow/` 資料；修改資料來源後，先執行 `npm run data:mhnow` 並提交產物。

一般本機開發仍使用 `npm run dev`。若要驗證 Pages 建置（PowerShell）：

```powershell
$env:GITHUB_PAGES = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/YOUR_REPOSITORY"
npm run build
Remove-Item Env:GITHUB_PAGES
Remove-Item Env:NEXT_PUBLIC_BASE_PATH
```

靜態輸出應使用靜態檔案伺服器預覽，並掛載到上述子路徑；不要用 `npm start` 預覽 `out/`。

## 避免搜尋引擎收錄

所有頁面透過根 layout 輸出 `noindex, nofollow, noarchive`。刻意不以 robots.txt 禁止爬取，讓搜尋引擎能讀取 noindex；也不要在帳號主站的 robots.txt 封鎖此專案路徑。

這是對遵守規則的搜尋引擎提出不收錄要求，**不是存取權限控制**。別人仍可轉傳或猜到網址，圖片與 JSON 也仍是公開檔案。不要公開貼出連結或提交 sitemap；如果需要只有指定的人能看，必須改用具有登入／存取控制的部署方式。已被收錄的網址要等搜尋引擎重新爬取；必要時使用 Google Search Console 申請暫時移除。

參考：[GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Google noindex 說明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。

## 待確認事項

1. **未知素材代碼**：`series/*.json` 有 8,554 筆素材顯示為代碼而非名稱（`ib`/`ic`/`id`/`ie` 等），
   需要在遊戲內實際確認。
2. **古龍種與活動系列的素材解析錯誤**：`scripts/mhn-quest-resolve.mjs` 以固定索引
   `refs[2..5]` 對應代碼 `b`–`e`，但 `matSeries` 長度從 2 到 33 不等。
   8 個古龍種系列（長度 4）與 10 個活動系列（無 matSeries）因此解不出素材。
