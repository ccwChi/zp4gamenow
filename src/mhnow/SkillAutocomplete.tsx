"use client";

import { useEffect, useId, useRef, useState } from "react";

/** hint：選單裡每個項目右邊的小字（例如「魔物」「技能」），用來同時搜兩種東西。 */
export function SkillAutocomplete({ names, selected, onSelect, label = "搜尋技能", placeholder = "搜尋並選擇技能", empty = "沒有符合的未選技能。", hint }: {
  names: string[]; selected: string[]; onSelect: (name: string) => void; label?: string;
  placeholder?: string; empty?: string; hint?: (name: string) => string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const term = query.trim().toLowerCase();
  const rank = (name: string) => name.toLowerCase() === term ? 2 : name.toLowerCase().startsWith(term) ? 1 : 0;
  const options = names.filter((name) => !selected.includes(name) && name.toLowerCase().includes(term)).sort((a, b) => rank(b) - rank(a)).slice(0, 20);
  const expanded = open && query.trim().length > 0;
  const activeIndex = active >= 0 && active < options.length ? active : -1;
  const select = (name: string) => { onSelect(name); setQuery(""); setOpen(false); setActive(-1); };
  useEffect(() => { if (expanded && activeIndex >= 0) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" }); }, [expanded, activeIndex]);

  return <div className="relative min-w-0 flex-1">
    <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off" value={query} placeholder={placeholder}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === "Escape") event.stopPropagation(); return; }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && query.trim() && options.length) {
          event.preventDefault(); setOpen(true);
          setActive(event.key === "ArrowDown" ? (activeIndex + 1) % options.length : (activeIndex < 0 ? options.length - 1 : (activeIndex - 1 + options.length) % options.length));
        } else if (event.key === "Enter" && expanded && options.length) {
          event.preventDefault(); select(options[activeIndex < 0 ? 0 : activeIndex]);
        } else if (event.key === "Escape" && expanded) {
          event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
        }
      }} className="box-border w-full py-2 px-3 border border-[#d8d0bd] rounded-md bg-white fs-md" />
    {expanded ? <div ref={list} id={listId} role="listbox" aria-label="技能建議"
      className="absolute top-full left-0 right-0 z-30 mt-1 max-h-[240px] overflow-auto rounded-lg border border-[#d8d0bd] bg-white shadow-lg py-1">
      {options.map((name, index) => <button key={name} type="button" role="option" id={`${listId}-${index}`} aria-selected={activeIndex === index} tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => select(name)}
        className={`flex w-full items-baseline gap-2 px-3 py-2 border-0 text-left fs-md ${activeIndex === index ? "bg-[#eaf7f4] text-[#087b84]" : "bg-white text-[#39423a] hover:bg-[#f5f7f3]"}`}>
        <span className="min-w-0 flex-1 truncate">{name}</span>{hint?.(name) ? <small className="shrink-0 text-[#858d86]">{hint(name)}</small> : null}</button>)}
      {!options.length ? <p role="status" className="m-0 px-3 py-2 fs-md text-[#858d86]">{empty}</p> : null}
    </div> : null}
  </div>;
}
