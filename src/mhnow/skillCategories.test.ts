import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SKILL_CATEGORIES, groupSkills } from "./skillCategories";

it("groups skills by category in the listed order, putting unknown ones last under 其他", () => {
  expect(groupSkills(["團結力", "新技能", "防禦", "集中", "火屬性攻擊強化", "弱點特效", "攻擊"])).toEqual([
    { key: "attack", label: "攻擊", skills: ["攻擊", "弱點特效"] },
    { key: "element", label: "屬性", skills: ["火屬性攻擊強化"] },
    { key: "action", label: "動作", skills: ["集中"] },
    { key: "defense", label: "防禦/耐性", skills: ["防禦"] },
    { key: "other", label: "其他", skills: ["團結力", "新技能"] },
  ]);
  expect(groupSkills([])).toEqual([]);
});

it("treats ・ and ． before 境界 as the same skill", () => {
  expect(groupSkills(["攻擊・境界"])[0]).toEqual({ key: "attack", label: "攻擊", skills: ["攻擊・境界"] });
});

it("uses the exact skill names from the data, and only event skills fall back to 其他", () => {
  const data = JSON.parse(readFileSync("public/mhnow/series-index.json", "utf8"));
  const listed = new Set(SKILL_CATEGORIES.flatMap((category) => category.skills));
  const names = new Set<string>(Object.keys(data.skillLevels));
  for (const item of data.series) for (const list of [...Object.values(item.skills), ...Object.values(item.weaponSkills ?? {})] as { skill: string }[][]) for (const entry of list) names.add(entry.skill);
  // 活動限定技能不在分類表裡，放在「其他」最後；其他技能都要有分類，避免資料改名後默默掉進「其他」。
  const events = ["新年快樂", "MrBeast挑戰！", "氣球衝撞", "彩蛋爆發", "急速勁泳【2025】", "熱情盛夏【2025】"];
  expect([...names].filter((name) => !listed.has(name) && !events.includes(name))).toEqual([]);
});
