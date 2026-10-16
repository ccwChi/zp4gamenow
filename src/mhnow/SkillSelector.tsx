"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SkillAutocomplete } from "./SkillAutocomplete";
import { SkillGroups } from "./SkillGroups";

/** A compact search field with the same multi-select dialog in both loadout tools. */
export function SkillSelector({ names, selected, onToggle, onClear, visible = true, title = "選擇技能", label = "搜尋技能", popular, children }: {
  names: string[]; selected: string[]; onToggle: (name: string) => void; onClear: () => void;
  visible?: boolean; title?: string; label?: string; popular?: string[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const terms = query.toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const filtered = terms.length ? names.filter((name) => terms.some((term) => name.toLowerCase().includes(term))) : names;

  return <>
    <div className="flex min-w-0 items-center gap-2">
      <SkillAutocomplete names={names} selected={selected} onSelect={(name) => { if (!selected.includes(name)) onToggle(name); }} label={label} />
      {children}
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open && visible} onClick={() => { setQuery(""); setOpen(true); }}
        className="shrink-0 py-2 px-3 rounded-md border border-[#bca77e] bg-white fs-md text-[#62553e]">{title}{selected.length ? `（${selected.length}）` : ""} ▾</button>
    </div>
    {open && visible ? createPortal(<div className="fixed inset-0 z-50 bg-[rgba(20,26,20,.45)] flex items-center justify-center p-5 max-[620px]:p-2"
      onClick={(event) => { event.stopPropagation(); close(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="skill-selection-dialog w-full max-w-[760px] max-h-[86vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_60px_rgba(0,0,0,.25)]"
        onClick={(event) => event.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between py-3 px-4 border-b border-[#e5e7e2]">
          <strong id={titleId} className="fs-lg">{title}（已選 {selected.length}）</strong>
          <button type="button" aria-label={`關閉${title}`} onClick={close} className="w-7 h-7 border-0 rounded-full bg-[#f0f1ed] fs-lg text-[#4b5d50]">×</button>
        </div>
        <div className="shrink-0 flex items-center gap-2 px-4 py-3">
          <input autoFocus aria-label={`${label}（複選）`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋技能" className="min-w-0 flex-1 py-2 px-3 rounded-md border border-[#d8d0bd] fs-md" />
          <button type="button" disabled={!selected.length} onClick={onClear} className="shrink-0 px-3 py-2 rounded-md border border-[#d8d0bd] bg-white fs-md text-[#687168]">清除選擇</button>
        </div>
        <div className="min-h-0 overflow-auto px-4 pb-3">
          <SkillGroups names={filtered} searching={terms.length > 0} columns="wrap" popular={popular} empty={<p className="fs-md text-[#858d86]">找不到符合的技能。</p>}
            renderSkill={(name) => <button key={name} type="button" aria-pressed={selected.includes(name)} onClick={() => onToggle(name)}
              className={`px-3 py-1.5 rounded-md border fs-md ${selected.includes(name) ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#d8d0bd] text-[#39423a]"}`}>{name}</button>} />
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-[#e5e7e2]">
          <button type="button" onClick={close} className="w-full py-2 rounded-lg border-0 bg-[#28352e] text-white fs-md">完成技能選擇</button>
        </div>
      </div>
    </div>, document.body) : null}
  </>;
}
