import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { activeSkills, damageIndex, effectTable, SKILL_EFFECTS } from "./damage";
import { recommendBuilds, RECOMMEND_SLOTS, type RecommendSeries } from "./recommendBuilds";

const data: { skillLevels: Record<string, string[]>; series: RecommendSeries[] } = JSON.parse(readFileSync("public/mhnow/series-index.json", "utf8"));
const table = effectTable(data.skillLevels);
const raw = { atk: 1000, ele: 0, element: "white", crit: 0 };
const caps = Object.fromEntries(Object.entries(data.skillLevels).map(([skill, levels]) => [skill, levels.length]));
const damage = (native: Record<string, number>, drift: Record<string, number> = {}, weapon = raw, conditions = ["連擊"]) =>
  damageIndex(native, drift, weapon, table, new Set(activeSkills(table, weapon.element, conditions)), caps);

describe("damage index", () => {
  it("reads every listed skill's numbers from the current descriptions", () => {
    for (const skill of Object.keys(SKILL_EFFECTS)) if (data.skillLevels[skill]) expect(table[skill], skill).toBeDefined();
  });

  it("adds gear attack after the attack multiplier and smelted attack before it", () => {
    expect(damage({})).toBe(1000);
    expect(damage({ "攻擊": 5 })).toBe(1300);
    expect(damage({ "攻擊": 5, "連擊": 5 })).toBeCloseTo(1000 * 1.3 + 300);
    expect(damage({ "連擊": 5 }, { "攻擊": 5 })).toBeCloseTo(1300 * 1.3);
    // 攻擊．境界 needs 攻擊 Lv5 in total, wherever the levels come from.
    expect(damage({ "攻擊．境界": 1, "攻擊": 4 })).toBe(1200);
    expect(damage({ "攻擊．境界": 1, "攻擊": 4 }, { "攻擊": 1 })).toBe(1450);
  });

  it("uses expected critical damage, crit multiplier upgrades and negative affinity", () => {
    expect(damage({ "看破": 5 })).toBeCloseTo(1000 * (0.4 * 1.25 + 0.6));
    expect(damage({ "看破": 5, "超會心": 5 })).toBeCloseTo(1000 * (0.4 * 1.5 + 0.6));
    expect(damage({ "蠻力": 5 })).toBeCloseTo(1500 * (1 - 0.3 * 0.25));
  });

  it("adds element only for elemental weapons and boosts weapon element on crits", () => {
    const fire = { atk: 1000, ele: 500, element: "fire", crit: 100 };
    expect(damage({}, {}, fire)).toBeCloseTo(1500 * 1.25);
    expect(damage({ "火屬性攻擊強化": 1, "會心擊【屬性】": 1 }, {}, fire)).toBeCloseTo((1000 + 500 * 1.3 + 50) * 1.25);
    expect(damage({ "水屬性攻擊強化": 5 }, {}, fire)).toBeCloseTo(1500 * 1.25);
    expect(damage({}, {}, { ...fire, element: "poison" })).toBeCloseTo(1000 * 1.25);
  });

  it("only counts conditional skills that are checked", () => {
    expect(damage({ "連擊": 5 }, {}, raw, [])).toBe(1000);
    expect(damage({ "連擊．境界": 2, "連擊": 5 })).toBeCloseTo(1000 * 1.4);
    expect(damage({ "完美巧擊": 5 }, {}, raw, ["完美巧擊"])).toBeCloseTo(1600);
  });
});

describe("maximum damage recommendations", () => {
  const entry = (skill: string, level: number) => ({ skill, levels: [{ level, grade: 1 }] });
  const fixture = (): RecommendSeries[] => [
    { key: "weapon", name: "武器", hasArmor: false, weaponTypes: ["bow"], skills: { weapon: [] }, weaponElement: "white", weaponStats: { white: { atk: Array(10).fill(1000) } } },
    ...RECOMMEND_SLOTS.map((slot) => ({ key: slot, name: slot, hasArmor: true, weaponTypes: [], skills: { [slot]: [entry("攻擊", 1)] } })),
    ...RECOMMEND_SLOTS.map((slot) => ({ key: `holed-${slot}`, name: slot, hasArmor: true, weaponTypes: [], skills: { [slot]: [] }, slots: { [slot]: [1] } })),
  ];
  const stones = { colors: [{ key: "white", skills: [{ name: "攻擊" }, { name: "看破" }] }], common: [], events: [] };
  const options = { weapon: "weapon::bow", grade: 10, required: {}, includeDrifts: true, maxLevels: caps, damage: { skillLevels: data.skillLevels, conditions: [] } };

  it("works without required skills and smelts the free slots for the most damage", async () => {
    const { recommendations } = await recommendBuilds(fixture(), stones, options);
    const top = recommendations[0];
    // Five smelted attack levels (before the multiplier) beat five native ones; nothing beats them here.
    expect(top.damage).toBe(1300);
    expect(Object.values(top.build.gear).filter((key) => key.startsWith("holed-"))).toHaveLength(5);
    expect(Object.values(top.build.drifts).flat().map((pick) => pick?.skill)).toEqual(Array(5).fill("攻擊"));
    expect(recommendations.map((item) => item.damage)).toEqual([...recommendations.map((item) => item.damage)].sort((a, b) => b - a));
  });

  it("still requires the chosen skills and rejects weapons without stats", async () => {
    const { recommendations } = await recommendBuilds(fixture(), stones, { ...options, required: { "看破": 2 } });
    for (const item of recommendations) expect(item.skills["看破"]).toBeGreaterThanOrEqual(2);
    const series = fixture();
    delete series[0].weaponStats;
    await expect(recommendBuilds(series, stones, options)).rejects.toThrow("數值");
  });
});
