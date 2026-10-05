import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { recommendBuilds, RECOMMEND_SLOTS, type RecommendSeries, type RecommendDrifts } from "./recommendBuilds";

const entry = (skill: string, level: number, grade = 1) => ({ skill, levels: [{ level, grade }] });
const stones: RecommendDrifts = { colors: [{ key: "white", skills: [{ name: "攻擊" }] }], common: [], events: [] };
function fixture(): RecommendSeries[] {
  return [
    { key: "weapon", name: "武器", hasArmor: false, weaponTypes: ["bow", "hammer"], skills: { weapon: [entry("攻擊", 1)] }, weaponSkills: { bow: [entry("集中", 1)] } },
    ...RECOMMEND_SLOTS.map((slot) => ({ key: slot, name: slot, hasArmor: true, weaponTypes: [], skills: { [slot]: [entry("攻擊", 1)] }, slots: { [slot]: [5] } })),
  ];
}
const options = { weapon: "weapon::bow", grade: 10, required: { "攻擊": 5 }, includeDrifts: false };

describe("recommended loadouts", () => {
  it("returns full armor sets, weapon-specific skills and keeps input unchanged", async () => {
    const series = fixture();
    const before = JSON.stringify(series);
    const { recommendations, truncated } = await recommendBuilds(series, stones, options);
    expect(truncated).toBe(false);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].skills).toEqual({ "集中": 1, "攻擊": 5 });
    expect(recommendations[0].build.gear).toEqual({ weapon: "weapon::bow", ...Object.fromEntries(RECOMMEND_SLOTS.map((slot) => [slot, slot])) });
    expect(recommendations[0].stoneCount).toBe(0);
    expect(JSON.stringify(series)).toBe(before);
  });

  it("allocates missing levels only to unlocked, existing drift slots", async () => {
    const result = await recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, required: { "攻擊": 8 } });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].stoneCount).toBe(3);
    expect(result.recommendations[0].skills["攻擊"]).toBe(8);
    for (const picks of Object.values(result.recommendations[0].build.drifts)) {
      expect(picks.length).toBeLessThanOrEqual(1);
      for (const pick of picks) expect(pick).toEqual({ skill: "攻擊", color: "white" });
    }
    expect((await recommendBuilds(fixture(), stones, { ...options, required: { "攻擊": 6 } })).recommendations).toEqual([]);
    expect((await recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, grade: 4, required: { "攻擊": 6 } })).recommendations).toEqual([]);
  });

  it("does not create skills absent from the drift pool or duplicate a slot", async () => {
    const result = await recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, required: { "絕對迴避【SP】": 1 } });
    expect(result.recommendations).toEqual([]);
    const missingPart = fixture().filter((item) => item.key !== "mail");
    expect((await recommendBuilds(missingPart, stones, { ...options, required: { "集中": 1 } })).recommendations).toEqual([]);
  });

  it("counts shared drift capacity across different required skills", async () => {
    const moreStones = { ...stones, common: ["集中"] };
    const result = await recommendBuilds(fixture(), moreStones, { ...options, includeDrifts: true, required: { "攻擊": 8, "集中": 4 } });
    expect(result.recommendations).toEqual([]); // Six missing levels cannot fit into five slots.
  });

  it("honors grade unlocks and excludes style-specific skills", async () => {
    const series = fixture();
    series[1].skills.helm = [entry("攻擊", 1, 8), { ...entry("特殊技能", 1), style: 10 }];
    expect((await recommendBuilds(series, stones, { ...options, grade: 7 })).recommendations).toEqual([]);
    expect((await recommendBuilds(series, stones, { ...options, required: { "特殊技能": 1 } })).recommendations).toEqual([]);
  });

  it("returns distinct alternatives in ascending stone count", async () => {
    const series = fixture();
    series.push({ key: "alt", name: "替代頭", hasArmor: true, weaponTypes: [], skills: { helm: [] }, slots: { helm: [5] } });
    const result = await recommendBuilds(series, stones, { ...options, includeDrifts: true });
    expect(result.recommendations.map((item) => item.stoneCount)).toEqual([0, 1]);
    expect(new Set(result.recommendations.map((item) => JSON.stringify(item.build.gear))).size).toBe(2);
  });

  it("distinguishes a bounded search from proven infeasibility and supports cancellation", async () => {
    const result = await recommendBuilds(fixture(), stones, { ...options, nodeLimit: 1 });
    expect(result.truncated).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(recommendBuilds(fixture(), stones, { ...options, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await expect(recommendBuilds(fixture(), stones, { ...options, weapon: "weapon::invalid" })).rejects.toThrow("武器");
  });

  it("finds actual SP-evasion armor and preserves all required levels in current data", async () => {
    const data: { series: RecommendSeries[] } = JSON.parse(readFileSync("public/mhnow/series-index.json", "utf8"));
    const driftData: RecommendDrifts = JSON.parse(readFileSync("public/mhnow/driftstones.json", "utf8"));
    const weapon = data.series.find((item) => item.weaponTypes.includes("bow"))!;
    const result = await recommendBuilds(data.series, driftData, { weapon: `${weapon.key}::bow`, grade: 10, required: { "絕對迴避【SP】": 3 }, includeDrifts: true });
    expect(result.recommendations.length).toBeGreaterThan(1);
    for (const item of result.recommendations) {
      expect(item.skills["絕對迴避【SP】"]).toBeGreaterThanOrEqual(3);
      for (const slot of RECOMMEND_SLOTS) {
        const armor = data.series.find((entry) => entry.key === item.build.gear[slot])!;
        expect(armor.skills[slot] !== undefined || armor.slots?.[slot] !== undefined).toBe(true);
        expect(item.build.drifts[slot].length).toBeLessThanOrEqual(armor.slots?.[slot]?.length ?? 0);
      }
    }
  });
});
