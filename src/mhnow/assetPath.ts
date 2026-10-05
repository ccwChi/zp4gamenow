/** Public assets need the repository prefix when hosted on GitHub Pages. */
export function assetPath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//")
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`
    : path;
}

/**
 * 資料檔（series-index.json 等）網址後面加上這次 build 的版本號。
 * 程式檔每次 build 檔名都會變，資料檔不會；不加的話瀏覽器可能拿新程式配舊快取的資料
 * （例如舊資料沒有武器數值，就會誤報「這把武器沒有數值資料」）。
 */
export function dataPath(path: string, version = process.env.NEXT_PUBLIC_DATA_VERSION): string {
  return version ? `${assetPath(path)}?v=${version}` : assetPath(path);
}
