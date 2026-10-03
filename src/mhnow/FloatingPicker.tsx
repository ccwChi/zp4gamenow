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

/** 手機（與其他頁面同一個斷點）：視窗固定接近全螢幕，不能拖曳、調整大小，也不記位置。 */
const MOBILE_QUERY = "(max-width: 620px)";

/** 手機版的固定位置：四周留 8px。 */
export function mobileBounds(width: number, height: number): Bounds {
  return { x: 8, y: 8, width: Math.max(1, width - 16), height: Math.max(1, height - 16) };
}

function defaultBounds(): Bounds {
  const width = Math.min(760, window.innerWidth - 32);
  const height = window.innerHeight * 0.8;
  return fitBounds({ x: (window.innerWidth - width) / 2, y: (window.innerHeight - height) / 2, width, height }, window.innerWidth, window.innerHeight);
}

function isBounds(value: unknown): value is Bounds {
  return typeof value === "object" && value !== null && ["x", "y", "width", "height"].every((key) => {
    const number = (value as Record<string, unknown>)[key];
    return typeof number === "number" && Number.isFinite(number);
  });
}

export function FloatingPicker({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [remember, setRemember] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [mobile, setMobile] = useState(false);
  const titleId = useId();
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; bounds: Bounds } | null>(null);
  // 桌機版目前的位置；手機版時先記著，轉回桌機（例如轉橫向）再拿回來。
  const desktop = useRef<Bounds | null>(null);

  useEffect(() => {
    let initial = defaultBounds();
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (isBounds(saved)) {
        initial = fitBounds(saved, window.innerWidth, window.innerHeight);
        setRemember(true);
      }
    } catch { /* Invalid or unavailable storage uses the default window. */ }
    desktop.current = initial;
    const media = window.matchMedia(MOBILE_QUERY);
    const layout = () => {
      setMobile(media.matches);
      if (media.matches) setBounds(mobileBounds(window.innerWidth, window.innerHeight));
      else setBounds(fitBounds(desktop.current ?? defaultBounds(), window.innerWidth, window.innerHeight));
    };
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, []);

  useEffect(() => {
    // 手機版的位置是固定的，不存也不清掉桌機記住的設定。
    if (!bounds || mobile) return;
    desktop.current = bounds;
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds));
      else localStorage.removeItem(STORAGE_KEY);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [bounds, remember, mobile]);

  function start(event: PointerEvent<HTMLElement>, mode: "move" | "resize") {
    if (!bounds || mobile || event.button !== 0) return;
    event.preventDefault();
    gesture.current = { mode, x: event.clientX, y: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    const next = active.mode === "move"
      ? { ...active.bounds, x: active.bounds.x + dx, y: active.bounds.y + dy }
      : { ...active.bounds, width: active.bounds.width + dx, height: active.bounds.height + dy };
    // Keep the top-left corner stable when resizing near the viewport edges.
    if (active.mode === "resize") {
      next.width = Math.min(next.width, window.innerWidth - next.x - 8);
      next.height = Math.min(next.height, window.innerHeight - next.y - 8);
    }
    setBounds(fitBounds(next, window.innerWidth, window.innerHeight));
  }
  const handlers = {
    onPointerMove: move,
    onPointerUp: () => { gesture.current = null; },
    onPointerCancel: () => { gesture.current = null; },
    onLostPointerCapture: () => { gesture.current = null; },
  };

  if (!bounds) return null;
  return <>
    <button type="button" tabIndex={-1} aria-label="點擊背景關閉技能選擇" onClick={onClose}
      className="fixed inset-0 z-40 border-0 bg-[rgba(20,26,20,.45)] cursor-default" />
    <div role="dialog" aria-labelledby={titleId}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
    className="fixed z-40 flex flex-col bg-white border border-[#cfc7b4] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,.25)] overflow-hidden"
    style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}>
    {/* 標題列：桌機版可拖曳標題移動，右邊放「記住大小位置」與「重設視窗」；手機版只有標題與關閉。 */}
    <div className="flex items-center gap-2 pr-2 border-b border-[#e5e7e2] shrink-0">
      {mobile ? <h2 id={titleId} className="flex-1 min-w-0 m-0 p-3 font-bold text-[14px] truncate">{title}</h2>
        : <button id={titleId} onPointerDown={(event) => start(event, "move")} {...handlers}
          onKeyDown={(event) => {
            const offsets: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            const offset = offsets[event.key];
            if (offset) { event.preventDefault(); setBounds(fitBounds({ ...bounds, x: bounds.x + offset[0], y: bounds.y + offset[1] }, window.innerWidth, window.innerHeight)); }
          }} title="拖曳移動視窗；也可聚焦後使用方向鍵" className="flex-1 min-w-0 p-3 text-left font-bold text-[14px] border-0 bg-transparent cursor-move touch-none select-none truncate">{title}</button>}
      {!mobile ? <>
        <label title={storageError ? "瀏覽器無法儲存視窗設定" : "下次打開時沿用現在的大小與位置"}
          className={cx("flex items-center gap-1 shrink-0 text-[12px] cursor-pointer", storageError ? "text-[#b23a30]" : "text-[#5b635c]")}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />記住大小位置{storageError ? "（無法儲存）" : ""}</label>
        <button onClick={() => setBounds(defaultBounds())} className="shrink-0 border border-[#cfc7b4] rounded px-2 py-1 bg-white text-[12px] cursor-pointer">重設視窗</button>
      </> : null}
      <button autoFocus aria-label="關閉技能選擇" onClick={onClose} className="w-8 h-8 shrink-0 rounded-full border-0 cursor-pointer">✕</button>
    </div>
    {/* Size container: children lay out against the window's own size (@container / cqh), not the viewport. */}
    <div className="min-h-0 flex-1 overflow-hidden @container-size"><div className="h-full px-4 py-3 box-border">{children}</div></div>
    {mobile ? null : <div className="h-6 shrink-0 relative">
      <button aria-label="調整視窗大小" title="拖曳調整大小；也可聚焦後使用方向鍵" onPointerDown={(event) => start(event, "resize")} {...handlers}
        onKeyDown={(event) => {
          const offsets: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
          const offset = offsets[event.key];
          if (offset) { event.preventDefault(); setBounds(fitBounds({ ...bounds, width: bounds.width + offset[0], height: bounds.height + offset[1] }, window.innerWidth, window.innerHeight)); }
        }} className="absolute right-0 bottom-0 w-8 h-6 border-0 bg-transparent cursor-nwse-resize touch-none select-none">◢</button>
    </div>}
  </div></>;
}
