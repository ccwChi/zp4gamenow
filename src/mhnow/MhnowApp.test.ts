import { describe, expect, it } from "vitest";
import { calculateRange, compareMaterials, driftColor, materialCategory, totalMissing, driftContribution, resolveTarget, rowsInRange, searchSeries, seriesSkills, skillTiers, skillsAtGrade } from "./MhnowApp";

const rows = [
  { grade: "6-3", zenny: 30, materials: [{ name: "甲殼", quantity: 3 }] },
  { grade: "6-4", zenny: 40, materials: [{ name: "甲殼", quantity: 4 }] },
  { grade: "7-1", zenny: 70, materials: [{ name: "逆鱗", quantity: 7 }] },
  { grade: "7-4", zenny: 74, materials: [{ name: "甲殼", quantity: 7 }, { name: "ib", quantity: 3, unknown: true }] },
];

describe("calculateRange", () => {
  it("excludes the current grade and includes the target grade", () => {
    const result = calculateRange(rows, "6-3", "7-4");
    expect(result.zenny).toBe(184);
    expect(result.materials.find((item) => item.name === "甲殼")?.quantity).toBe(11);
    expect(result.materials.find((item) => item.name === "逆鱗")?.quantity).toBe(7);
  });
  it("includes forging when nothing is produced yet", () => {
    expect(calculateRange(rows, "unforged", "6-3").zenny).toBe(30);
  });
  it("keeps the unknown flag so the UI can own up to it", () => {
    expect(calculateRange(rows, "unforged", "7-4").materials.find((item) => item.name === "ib")?.unknown).toBe(true);
  });
  it("returns nothing when the target is below the current grade", () => {
    expect(calculateRange(rows, "7-4", "6-3")).toEqual({ zenny: 0, materials: [] });
  });
});

describe("skillsAtGrade", () => {
  const entries = [
    { skill: "超會心", levels: [{ level: 1, grade: 5 }, { level: 2, grade: 6 }] },
    { skill: "耳塞", levels: [{ level: 1, grade: 8 }] },
  ];
  it("takes the highest level the grade has reached", () => {
    expect(skillsAtGrade(entries, 6)).toEqual({ "超會心": 2 });
    expect(skillsAtGrade(entries, 5)).toEqual({ "超會心": 1 });
  });
  it("grants nothing before the unlock grade", () => {
    expect(skillsAtGrade(entries, 4)).toEqual({});
  });
  it("includes every skill once the target grade is reached", () => {
    expect(skillsAtGrade(entries, 8)).toEqual({ "超會心": 2, "耳塞": 1 });
  });
  it("handles pieces with no skills", () => {
    expect(skillsAtGrade(undefined, 10)).toEqual({});
  });
});



describe("skillTiers", () => {
  it("only lists what changed at each grade", () => {
    const entries = [
      { skill: "破壞王", levels: [{ level: 1, grade: 5 }] },
      { skill: "攻擊守勢", levels: [{ level: 1, grade: 6 }, { level: 2, grade: 8 }] },
    ];
    expect(skillTiers(entries)).toEqual([
      { grade: 5, first: true, slots: 0, changes: [{ name: "破壞王", from: 0, to: 1 }] },
      { grade: 6, first: false, slots: 0, changes: [{ name: "攻擊守勢", from: 0, to: 1 }] },
      { grade: 8, first: false, slots: 0, changes: [{ name: "攻擊守勢", from: 1, to: 2 }] },
    ]);
  });
  it("marks the grade where a slot opens, on its own row when no skill changes there", () => {
    const entries = [{ skill: "攻擊", levels: [{ level: 1, grade: 4 }, { level: 2, grade: 8 }] }];
    expect(skillTiers(entries, [5, 8]).map(({ grade, slots }) => [grade, slots])).toEqual([[4, 0], [5, 1], [8, 1]]);
    // 洞先於第一個技能解鎖時，技能仍算「第一次出現」，顯示 1 而不是 0→1
    expect(skillTiers([{ skill: "攻擊", levels: [{ level: 1, grade: 6 }] }], [5])[1]).toMatchObject({ grade: 6, first: true });
  });
  it("counts two slots opening at the same grade", () => {
    expect(skillTiers([], [8, 8])).toEqual([{ grade: 8, first: true, slots: 2, changes: [] }]);
  });
  it("keeps several skills that unlock at the same grade", () => {
    const entries = [
      { skill: "攻擊", levels: [{ level: 1, grade: 4 }] },
      { skill: "防禦", levels: [{ level: 1, grade: 4 }] },
    ];
    expect(skillTiers(entries)[0].changes).toHaveLength(2);
  });
  it("returns nothing for a piece without skills", () => {
    expect(skillTiers()).toEqual([]);
  });
});

describe("compareMaterials", () => {
  const list = [
    { name: "龍玉碎片", quantity: 1, rare: 6, group: "misc" as const },
    { name: "逆鱗", quantity: 2, rare: 6 },
    { name: "甲殼", quantity: 9, rare: 1 },
    { name: "優質鱗", quantity: 3, rare: 4 },
    { name: "輝龍石", quantity: 5, rare: 3, group: "gather" as const },
    { name: "鐵礦石", quantity: 22, rare: 1, group: "gather" as const },
    { name: "尖爪", quantity: 8, rare: 1, group: "wyvern" as const },
    { name: "利爪", quantity: 4, rare: 1 },
  ];
  it("lists the wyvern item first, then gathered R1 to R3, then monster parts R1 to R6, then the rest", () => {
    expect([...list].sort(compareMaterials).map((item) => item.name)).toEqual(["尖爪", "鐵礦石", "輝龍石", "甲殼", "利爪", "優質鱗", "逆鱗", "龍玉碎片"]);
  });
  it("puts the larger quantity first within the same group and rarity", () => {
    expect(compareMaterials({ name: "甲殼", quantity: 9, rare: 1 }, { name: "利爪", quantity: 4, rare: 1 })).toBeLessThan(0);
  });
  it("is applied to the calculator totals", () => {
    const rows = [{ grade: "6-1", zenny: 0, materials: [{ name: "逆鱗", quantity: 1, rare: 6 }, { name: "尖爪", quantity: 2, rare: 1, group: "wyvern" as const }] }];
    expect(calculateRange(rows, "unforged", "6-1").materials.map((item) => item.name)).toEqual(["尖爪", "逆鱗"]);
  });
});

describe("rowsInRange", () => {
  it("lists every step after the current grade up to the target", () => {
    expect(rowsInRange(rows, "6-3", "7-4").map((row) => row.grade)).toEqual(["6-4", "7-1", "7-4"]);
  });
  it("starts from the forging step when nothing is produced yet", () => {
    expect(rowsInRange(rows, "unforged", "7-1").map((row) => row.grade)).toEqual(["6-3", "6-4", "7-1"]);
  });
  it("adds up to exactly the calculator total", () => {
    const steps = rowsInRange(rows, "unforged", "7-4");
    expect(steps.reduce((sum, row) => sum + row.zenny, 0)).toBe(calculateRange(rows, "unforged", "7-4").zenny);
    const shell = steps.flatMap((row) => row.materials).filter((item) => item.name === "甲殼").reduce((sum, item) => sum + item.quantity, 0);
    expect(calculateRange(rows, "unforged", "7-4").materials.find((item) => item.name === "甲殼")?.quantity).toBe(shell);
  });
  it("returns nothing when the target is not after the current grade", () => {
    expect(rowsInRange(rows, "7-4", "6-3")).toEqual([]);
  });
});

const pick = (skill: string, color = "fire") => ({ skill, color });

describe("driftContribution", () => {
  it("gives one level of each picked skill and adds up repeats", () => {
    expect(driftContribution([pick("攻擊守勢"), pick("攻擊守勢", "event"), pick("看破")], 3)).toEqual({ 攻擊守勢: 2, 看破: 1 });
  });
  it("skips empty slots", () => {
    expect(driftContribution([null, pick("看破")], 2)).toEqual({ 看破: 1 });
  });
  it("ignores picks beyond the armor's slot count", () => {
    expect(driftContribution([pick("攻擊守勢"), pick("看破")], 1)).toEqual({ 攻擊守勢: 1 });
  });
  it("handles a piece with no picks at all", () => {
    expect(driftContribution(undefined, 2)).toEqual({});
  });
});

describe("resolveTarget", () => {
  it("keeps a target that lies after the current grade", () => {
    expect(resolveTarget(rows, { current: "6-3", target: "7-1" })).toBe("7-1");
    expect(resolveTarget(rows, { current: "6-3", target: "7-1" }, true)).toBe("7-1");
  });
  it("counts nothing in the loadout until a target is chosen", () => {
    expect(resolveTarget(rows, { current: "unforged", target: "" }, true)).toBe("");
    expect(calculateRange(rows, "unforged", resolveTarget(rows, { current: "unforged", target: "" }, true))).toEqual({ zenny: 0, materials: [] });
  });
  it("treats a piece already upgraded past its target as done in the loadout", () => {
    expect(resolveTarget(rows, { current: "7-1", target: "6-4" }, true)).toBe("");
  });
  it("still falls back to the next grade in the calculator", () => {
    expect(resolveTarget(rows, { current: "unforged", target: "" })).toBe("6-3");
    expect(resolveTarget(rows, { current: "7-1", target: "6-4" })).toBe("7-4");
  });
});

describe("searchSeries", () => {
  const make = (key: string, name: string, skills: Record<string, { skill: string; levels: { level: number; grade: number }[] }[]>) =>
    ({ key, name, unlock: 1, weaponTypes: [], hasArmor: true, skills, traits: {} });
  const series = [
    make("kulu", "搔鳥", { helm: [{ skill: "鎖定", levels: [{ level: 1, grade: 2 }] }], mail: [{ skill: "攻擊", levels: [{ level: 1, grade: 1 }] }] }),
    make("rathi", "雌火龍", { helm: [{ skill: "攻擊", levels: [{ level: 1, grade: 1 }, { level: 2, grade: 5 }] }] }),
    make("anja", "蠻顎龍", { helm: [{ skill: "攻擊", levels: [{ level: 1, grade: 1 }] }, { skill: "攻擊活化", levels: [{ level: 3, grade: 6 }] }] }),
    make("gara", "攻擊龍", { helm: [] }),
  ];
  const keys = (hits: ReturnType<typeof searchSeries>) => hits.map((hit) => hit.item.key);
  it("returns everything for an empty query", () => {
    expect(keys(searchSeries(series, "  ", "helm"))).toEqual(["kulu", "rathi", "anja", "gara"]);
  });
  it("finds a skill on the slot being edited, highest level first, name-only hits last", () => {
    const hits = searchSeries(series, "攻擊", "helm");
    expect(keys(hits)).toEqual(["anja", "rathi", "gara"]);
    expect(hits[0].skill).toEqual({ name: "攻擊活化", level: 3 });
    expect(hits[2].skill).toBeUndefined();
  });
  it("ignores skills on other slots", () => {
    expect(keys(searchSeries(series, "攻擊", "mail"))).toEqual(["kulu", "gara"]);
  });
  it("only matches names when no slot is given (the calculator)", () => {
    expect(keys(searchSeries(series, "攻擊"))).toEqual(["gara"]);
    expect(keys(searchSeries(series, "鳥"))).toEqual(["kulu"]);
  });
});

describe("seriesSkills", () => {
  const skill = (name: string, level: number) => [{ skill: name, levels: [{ level, grade: 8 }] }];
  const brac = { key: "brac", name: "碎龍", unlock: 5, weaponTypes: ["hammer", "heavy-gun"], hasArmor: true, traits: {},
    skills: { weapon: skill("追擊【爆破】", 1), helm: skill("鎖定", 1) }, weaponSkills: { "heavy-gun": skill("砲術", 1) } };
  it("uses the weapon-type specific skills when the type has them (碎龍重弩 → 砲術)", () => {
    expect(seriesSkills(brac, "weapon", "heavy-gun").map((entry) => entry.skill)).toEqual(["砲術"]);
  });
  it("falls back to the shared weapon skills for other types", () => {
    expect(seriesSkills(brac, "weapon", "hammer").map((entry) => entry.skill)).toEqual(["追擊【爆破】"]);
  });
  it("ignores weapon types for armor slots", () => {
    expect(seriesSkills(brac, "helm", "heavy-gun").map((entry) => entry.skill)).toEqual(["鎖定"]);
  });
  it("lets the weapon picker find a series by a type-specific skill", () => {
    expect(searchSeries([brac], "砲術", "weapon")[0].skill).toEqual({ name: "砲術", level: 1 });
  });
});

describe("driftColor", () => {
  const data = {
    colors: [{ key: "fire", label: "紅", sources: [], skills: [{ name: "破壞王", rare: false, chance: 10 }], commonChance: 5 }],
    common: ["攻擊"],
    events: [{ key: "event-b", label: "B", skills: ["破壞王", "集中"] }],
  };
  it("keeps the color the stone was picked from", () => {
    expect(driftColor({ skill: "破壞王", color: "event" }, data)).toBe("event");
  });
  it("infers a color for old saves: a color's pool first, then common, then mysterious", () => {
    expect(driftColor({ skill: "破壞王", color: "" }, data)).toBe("fire");
    expect(driftColor({ skill: "攻擊", color: "" }, data)).toBe("common");
    expect(driftColor({ skill: "集中", color: "" }, data)).toBe("event");
  });
});

describe("totalMissing", () => {
  const piece = (key: string, current: string, target: string) => ({ key, rows, range: { current, target } });
  it("counts a piece used by several loadouts once, over the widest range", () => {
    const total = totalMissing([piece("helm|kulu::armor", "6-3", "6-4"), piece("helm|kulu::armor", "6-4", "7-1")]);
    expect(total.pieces).toBe(1);
    expect(total.zenny).toBe(110); // 6-4 + 7-1
    expect(total.materials.find((item) => item.name === "逆鱗")?.quantity).toBe(7);
  });
  it("adds up different pieces, and a different slot of the same series is a different piece", () => {
    const total = totalMissing([piece("helm|kulu::armor", "unforged", "6-3"), piece("mail|kulu::armor", "unforged", "6-4")]);
    expect(total.pieces).toBe(2);
    expect(total.materials.find((item) => item.name === "甲殼")?.quantity).toBe(3 + 3 + 4);
  });
  it("skips pieces with no target (不升級) or already past it", () => {
    expect(totalMissing([piece("helm|kulu::armor", "unforged", ""), piece("mail|kulu::armor", "7-1", "6-4")])).toEqual({ zenny: 0, pieces: 0, materials: [] });
  });
});

describe("materialCategory", () => {
  it("splits monster materials by rarity and keeps the other groups", () => {
    expect(materialCategory({ name: "爆鱗龍的鱗", quantity: 1, rare: 2 })).toBe("r2");
    expect(materialCategory({ name: "翼龍的皮", quantity: 1, rare: 1, group: "wyvern" })).toBe("wyvern");
    expect(materialCategory({ name: "ib", quantity: 1 })).toBe("r0");
  });
});

describe("material grouping for the summary", () => {
  it("splits gathered materials by kind", () => {
    expect(materialCategory({ name: "鐵礦石", quantity: 1, rare: 1, group: "gather", sub: "ore" })).toBe("gather-ore");
    expect(materialCategory({ name: "火炎草", quantity: 1, rare: 1, group: "gather", sub: "plant" })).toBe("gather-plant");
    expect(materialCategory({ name: "舊資料", quantity: 1, group: "gather" })).toBe("gather-other");
  });
  it("keeps one monster's parts together, ordered by monster name, before sorting by rarity", () => {
    const names: Record<string, string> = { kulu: "搔鳥", baze: "爆鱗龍" };
    const list = [
      { name: "搔鳥的喙", quantity: 3, rare: 2, monster: "kulu" },
      { name: "爆鱗龍的鱗", quantity: 200, rare: 2, monster: "baze" },
      { name: "搔鳥的皮", quantity: 9, rare: 1, monster: "kulu" },
      { name: "爆鱗龍的尾巴", quantity: 114, rare: 3, monster: "baze" },
      { name: "鐵礦石", quantity: 5, rare: 1, group: "gather" as const, sub: "ore" },
    ];
    const sorted = [...list].sort((a, b) => compareMaterials(a, b, (key) => names[key] ?? key)).map((item) => item.name);
    expect(sorted).toEqual(["鐵礦石", "搔鳥的皮", "搔鳥的喙", "爆鱗龍的鱗", "爆鱗龍的尾巴"]);
  });
});
