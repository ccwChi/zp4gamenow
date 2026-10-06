import { useState, type ReactNode } from "react";
import { groupSkills } from "./skillCategories";

/** 技能按鈕放進分類格子時的共用樣式：填滿一格、文字靠左。 */
export const SKILL_CELL = "w-full min-w-0 text-left";

/**
 * 依分類（攻擊／屬性／動作／防禦/耐性／其他）列出技能：每類一個小標題，下面兩欄排列。
 * 每個技能長怎樣（按鈕、選中樣式）由 renderSkill 決定，各個選技能的地方共用同一套分類與順序。
 * 每類標題右邊可以收合；searching（正在輸入搜尋）時全部展開，免得符合的技能被收起來看不到。
 */
export function SkillGroups({ names, renderSkill, empty, searching = false, columns = 2 }: {
  names: Iterable<string>; renderSkill: (name: string) => ReactNode; empty?: ReactNode; searching?: boolean; columns?: 1 | 2 | "wrap";
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = groupSkills(names);
  if (!groups.length) return <>{empty ?? null}</>;
  return <div className="flex flex-col gap-3 w-full">
    {groups.map((group) => {
      const open = searching || !collapsed.includes(group.key);
      return <section key={group.key} aria-label={group.label}>
        <h4 className="m-0 mb-1.5 border-b border-[#d9ddd6]">
          <button type="button" aria-expanded={open} disabled={searching}
            onClick={() => setCollapsed(open ? [...collapsed, group.key] : collapsed.filter((key) => key !== group.key))}
            className="flex items-center justify-between gap-2 w-full p-0 pb-1 border-0 bg-transparent text-left text-[12px] font-bold text-[#687168] cursor-pointer disabled:cursor-default">
            <span>{group.label} <small className="font-normal text-[#8b938c]">{group.skills.length}</small></span>
            {searching ? null : <span className="flex items-center gap-1 font-normal text-[#087b84]">{open ? "收合" : "展開"}
              <span aria-hidden="true" className={open ? "inline-block [transform:rotate(180deg)]" : "inline-block"}>▾</span></span>}
          </button>
        </h4>
        {open ? <div className={columns === "wrap" ? "flex flex-wrap gap-1" : columns === 1 ? "grid grid-cols-1 gap-1" : "grid grid-cols-2 gap-1"}>{group.skills.map((name) => renderSkill(name))}</div> : null}
      </section>;
    })}
  </div>;
}
