/**
 * 畫面大小：CSS 先給一個基準（手機 .9、桌機 .72），再乘上一個倍率得到最後的 --app-scale。
 *
 * 固定一個數字不夠用：同一個 1920 的螢幕，Windows 顯示縮放 125% 時網頁只有 1536 CSS px，
 * 100% 時卻有 1920 CSS px，同樣的版面在後者看起來就小一號。所以預設倍率改成看「視窗有多寬」，
 * 寬的畫面放大一點；使用者自己選過就一律聽他的（存在這台瀏覽器裡）。
 */
export const APP_SCALE_KEY = "mhnow.appScale.v1";

/** 手機（620px 以下）與桌機的基準，跟 globals.css 的 --app-scale 預設值一致。 */
export const baseScale = (desktop: boolean) => desktop ? 0.72 : 0.9;

/** 可以選的倍率；"auto" 是依畫面寬度自動。 */
export const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4] as const;
export type AppScale = number | "auto";

/**
 * 自動倍率：1536 CSS px（1920 螢幕開 125%）當基準不放大，更寬的畫面才往上加。
 * 手機與一般筆電寬度維持 1，不會因為視窗變窄就把字縮掉。
 */
export function autoFactor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (width >= 2200) return 1.4;
  if (width >= 1700) return 1.25;
  return 1;
}

export function parseAppScale(raw: string | null): AppScale {
  if (raw === "auto") return "auto";
  const value = Number(raw);
  return SCALE_STEPS.includes(value as (typeof SCALE_STEPS)[number]) ? value : "auto";
}

/** 最後要寫進 --app-scale 的數字。 */
export function effectiveScale(scale: AppScale, width: number, desktop: boolean): number {
  return baseScale(desktop) * (scale === "auto" ? autoFactor(width) : scale);
}
