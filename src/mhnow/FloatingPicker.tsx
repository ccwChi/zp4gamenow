"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

type Bounds = { x: number; y: number; width: number; height: number };
const STORAGE_KEY = "mhnow.skillPicker.window.v1";
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export function fitBounds(bounds: Bounds, width: number, height: number): Bounds {
  const w = Math.min(Math.max(300, bounds.width), Math.max(1, width - 16));
  const h = Math.min(Math.max(240, bounds.height), Math.max(1, height - 16));
  return { width: w, height: h, x: Math.max(8, Math.min(bounds.x, width - w - 8)), y: Math.max(8, Math.min(bounds.y, height - h - 8)) };
}

/** 各視窗「關閉即清除資料」的勾選（預設都不勾＝關閉後資料留著），存在瀏覽器。 */
export type ClearOnClose = { recommend: boolean; skillGear: boolean };
export const CLEAR_ON_CLOSE_KEY = "mhnow.clearOnClose.v1";
export const DEFAULT_CLEAR_ON_CLOSE: ClearOnClose = { recommend: false, skillGear: false };

export function parseClearOnClose(raw: string | null): ClearOnClose {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return { ...DEFAULT_CLEAR_ON_CLOSE };
    const record = value as Record<string, unknown>;
    return { recommend: record.recommend === true, skillGear: record.skillGear === true };
  } catch { return { ...DEFAULT_CLEAR_ON_CLOSE }; }
}

/** 手機（與其他頁面同一個斷點）：視窗固定接近全螢幕，不能拖曳、調整大小，也不記位置。 */
const MOBILE_QUERY = "(max-width: 620px)";

/** 手機版的固定位置：四周留 8px。 */
export function mobileBounds(width: number, height: number): Bounds {
  return { x: 8, y: 8, width: Math.max(1, width - 16), height: Math.max(1, height - 16) };
}

/** CSS zoom scales layout coordinates; pointer and viewport sizes stay in screen CSS pixels. */
function viewport() {
  const scale = Number(getComputedStyle(document.documentElement).getPropertyValue("--app-scale")) || 1;
  return { width: window.innerWidth / scale, height: window.innerHeight / scale, scale };
}

function defaultBounds(preferredWidth = 760, preferredHeightRatio = 0.8): Bounds {
  const view = viewport();
  const width = Math.min(preferredWidth, view.width - 32);
  const height = view.height * preferredHeightRatio;
  return fitBounds({ x: (view.width - width) / 2, y: (view.height - height) / 2, width, height }, view.width, view.height);
}

function isBounds(value: unknown): value is Bounds {
  return typeof value === "object" && value !== null && ["x", "y", "width", "height"].every((key) => {
    const number = (value as Record<string, unknown>)[key];
    return typeof number === "number" && Number.isFinite(number);
  });
}

/** 這次開著網頁期間，桌機版視窗最後的位置（不寫進瀏覽器存檔）。 */
const sessionBounds = new Map<string, Bounds>();

/**
 * open：關閉時只是藏起來（裡面的選擇、結果都留著），要清掉由呼叫端卸載重開。
 * closeOnBackdrop：點背景是否關閉（預設會）。
 * clearOnClose／onClearOnClose：有給 onClearOnClose 就在標題列顯示「關閉即清除資料」勾選框（手機版也顯示）。
 * onClear：有給就在勾選框旁放「清除」按鈕，立刻清掉這個視窗的資料（視窗不關）。
 * preferredWidth／storageKey：不同工具可使用自己的預設寬度與位置記憶。
 */
export function FloatingPicker({ title, onClose, children, open = true, closeOnBackdrop = true, clearOnClose, onClearOnClose, onClear, preferredWidth = 760, preferredHeightRatio = 0.8, storageKey = STORAGE_KEY }: {
  title: string; onClose: () => void; children: ReactNode; open?: boolean; closeOnBackdrop?: boolean;
  clearOnClose?: boolean; onClearOnClose?: (next: boolean) => void; onClear?: () => void;
  preferredWidth?: number; preferredHeightRatio?: number; storageKey?: string;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // 藏起來再打開時，焦點回到關閉鈕（第一次打開由 autoFocus 處理）。
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  const [remember, setRemember] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [mobile, setMobile] = useState(false);
  const titleId = useId();
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; bounds: Bounds } | null>(null);
  // 桌機版目前的位置；手機版時先記著，轉回桌機（例如轉橫向）再拿回來。
  const desktop = useRef<Bounds | null>(null);

  useEffect(() => {
    const view = viewport();
    let initial = defaultBounds(preferredWidth, preferredHeightRatio);
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (isBounds(saved)) {
        initial = fitBounds(saved, view.width, view.height);
        setRemember(true);
      }
    } catch { /* Invalid or unavailable storage uses the default window. */ }
    // 清除資料會重新掛載視窗；這次開著網頁期間拖過的位置沿用，視窗才不會跳回預設位置。
    const previous = sessionBounds.get(storageKey);
    if (previous) initial = fitBounds(previous, view.width, view.height);
    desktop.current = initial;
    const media = window.matchMedia(MOBILE_QUERY);
    const layout = () => {
      const view = viewport();
      setMobile(media.matches);
      if (media.matches) setBounds(mobileBounds(view.width, view.height));
      else setBounds(fitBounds(desktop.current ?? defaultBounds(preferredWidth, preferredHeightRatio), view.width, view.height));
    };
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [preferredWidth, preferredHeightRatio, storageKey]);

  useEffect(() => {
    // 手機版的位置是固定的，不存也不清掉桌機記住的設定。
    if (!bounds || mobile) return;
    desktop.current = bounds;
    sessionBounds.set(storageKey, bounds);
    try {
      if (remember) localStorage.setItem(storageKey, JSON.stringify(bounds));
      else localStorage.removeItem(storageKey);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [bounds, remember, mobile, storageKey]);

  function start(event: PointerEvent<HTMLElement>, mode: "move" | "resize") {
    if (!bounds || mobile || event.button !== 0) return;
    event.preventDefault();
    gesture.current = { mode, x: event.clientX, y: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const view = viewport();
    const dx = (event.clientX - active.x) / view.scale;
    const dy = (event.clientY - active.y) / view.scale;
    const next = active.mode === "move"
      ? { ...active.bounds, x: active.bounds.x + dx, y: active.bounds.y + dy }
      : { ...active.bounds, width: active.bounds.width + dx, height: active.bounds.height + dy };
    // Keep the top-left corner stable when resizing near the viewport edges.
    if (active.mode === "resize") {
      next.width = Math.min(next.width, view.width - next.x - 8);
      next.height = Math.min(next.height, view.height - next.y - 8);
    }
    setBounds(fitBounds(next, view.width, view.height));
  }
  const handlers = {
    onPointerMove: move,
    onPointerUp: () => { gesture.current = null; },
    onPointerCancel: () => { gesture.current = null; },
    onLostPointerCapture: () => { gesture.current = null; },
  };

  if (!bounds) return null;
  // 關閉時整個藏起來（display: none），元件不卸載，裡面的狀態才留得住。
  return <div className={open ? "contents" : "hidden"}>
    {/* 不能點背景關閉時，遮罩仍然擋住後面的頁面。 */}
    {closeOnBackdrop ? <button type="button" tabIndex={-1} aria-label="點擊背景關閉" onClick={onClose}
      className="fixed inset-0 z-40 border-0 bg-[rgba(20,26,20,.45)] cursor-default" />
      : <div aria-hidden="true" className="fixed inset-0 z-40 bg-[rgba(20,26,20,.45)]" />}
    <div role="dialog" aria-labelledby={titleId}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
    className="fixed z-40 flex flex-col bg-white border border-[#cfc7b4] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,.25)] overflow-hidden"
    style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
    {/* 標題列：桌機版可拖曳標題移動，右邊放「記住大小位置」與「重設視窗」；手機版只有標題與關閉。 */}
    <div className="flex items-center gap-2 pr-2 border-b border-[#e5e7e2] shrink-0">
      {mobile ? <h2 id={titleId} className="flex-1 min-w-0 m-0 p-3 font-bold fs-lg truncate">{title}</h2>
        : <button id={titleId} onPointerDown={(event) => start(event, "move")} {...handlers}
          onKeyDown={(event) => {
            const offsets: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            const offset = offsets[event.key];
            if (offset) { event.preventDefault(); const view = viewport(); setBounds(fitBounds({ ...bounds, x: bounds.x + offset[0], y: bounds.y + offset[1] }, view.width, view.height)); }
          }} title="拖曳移動視窗；也可聚焦後使用方向鍵" className="flex-1 min-w-0 p-3 text-left font-bold fs-lg border-0 bg-transparent cursor-move touch-none select-none truncate">{title}</button>}
      {!mobile ? <>
        <label title={storageError ? "瀏覽器無法儲存視窗設定" : "下次打開時沿用現在的大小與位置"}
          className={cx("flex items-center gap-1 shrink-0 fs-md cursor-pointer", storageError ? "text-[#b23a30]" : "text-[#5b635c]")}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />記住大小位置{storageError ? "（無法儲存）" : ""}</label>
        <button onClick={() => setBounds(defaultBounds(preferredWidth, preferredHeightRatio))} className="shrink-0 border border-[#cfc7b4] rounded px-2 py-1 bg-white fs-md cursor-pointer">重設視窗</button>
      </> : null}
      {onClearOnClose ? <label title="勾選後，關閉視窗時清掉這裡的選擇與結果；不勾則下次打開還在"
        className="flex items-center gap-1 shrink-0 fs-md text-[#5b635c] cursor-pointer">
        <input type="checkbox" checked={!!clearOnClose} onChange={(event) => onClearOnClose(event.target.checked)} />關閉即清除資料</label> : null}
      {onClear ? <button onClick={onClear} title="清掉這個視窗目前的選擇與結果"
        className="shrink-0 border-0 rounded px-2 py-1 bg-[#d23c3c] text-white fs-md font-bold cursor-pointer hover:bg-[#b23a30]">清除</button> : null}
      <button ref={closeButton} autoFocus aria-label="關閉" onClick={onClose} className="w-8 h-8 shrink-0 rounded-full border-0 cursor-pointer">✕</button>
    </div>
    {/* Size container: children lay out against the window's own size (@container / cqh), not the viewport. */}
    <div className="min-h-0 flex-1 overflow-hidden @container-size"><div className="h-full px-4 py-3 box-border">{children}</div></div>
    {mobile ? null : <div className="h-6 shrink-0 relative">
      <button aria-label="調整視窗大小" title="拖曳調整大小；也可聚焦後使用方向鍵" onPointerDown={(event) => start(event, "resize")} {...handlers}
        onKeyDown={(event) => {
          const offsets: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
          const offset = offsets[event.key];
          if (offset) { event.preventDefault(); const view = viewport(); setBounds(fitBounds({ ...bounds, width: bounds.width + offset[0], height: bounds.height + offset[1] }, view.width, view.height)); }
        }} className="absolute right-0 bottom-0 w-8 h-6 border-0 bg-transparent cursor-nwse-resize touch-none select-none">◢</button>
    </div>}
  </div></div>;
}
