"use client";

import { WEAPON_ELEMENTS, WEAPON_ELEMENT_COLORS, WEAPON_ELEMENT_NAMES } from "./weaponElements";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** 依武器屬性篩魔物：單選，再點一次取消。全站的選魔物都用這一列。 */
export function ElementFilter({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <div role="group" aria-label="武器屬性" className="flex flex-wrap items-center gap-1">
    <span className="fs-sm text-[#858d86]">武器屬性</span>
    {WEAPON_ELEMENTS.map((element) => {
      const on = value === element;
      return <button key={element} type="button" aria-pressed={on} onClick={() => onChange(on ? "" : element)}
        style={on ? { backgroundColor: WEAPON_ELEMENT_COLORS[element], borderColor: WEAPON_ELEMENT_COLORS[element] } : { color: WEAPON_ELEMENT_COLORS[element] }}
        className={cx("px-2 py-0.5 rounded-full border fs-sm cursor-pointer", on ? "text-white font-bold" : "border-[#e0e3df] bg-white")}>{WEAPON_ELEMENT_NAMES[element]}</button>;
    })}
    {value ? <button type="button" onClick={() => onChange("")} className="border-0 bg-transparent fs-sm text-[#858d86] cursor-pointer">清除</button> : null}
  </div>;
}
