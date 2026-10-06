import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { recommendBuilds, swapPiece, RECOMMEND_SLOTS, type RecommendSeries, type RecommendDrifts } from "./recommendBuilds";

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
  it("supplies all requested drift-only levels even when native armor already meets the target", async () => {
    const result = await recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, driftOnly: ["攻擊"] });
    expect(result.recommendations).toHaveLength(1);
    const item = result.recommendations[0];
    expect(item.stoneCount).toBe(5);
    expect(item.skills["攻擊"]).toBe(10);
    expect(Object.values(item.build.drifts).flat().map((pick) => pick?.skill)).toEqual(Array(5).fill("攻擊"));
    expect(item.skills["集中"]).toBe(1);
  });

  it("shares capacity between drift-only skills and ordinary skill deficits", async () => {
    const result = await recommendBuilds(fixture(), { ...stones, common: ["集中"] }, {
      ...options, includeDrifts: true, driftOnly: ["攻擊"], required: { "攻擊": 5, "集中": 2 },
    });
    expect(result.recommendations).toEqual([]);
    const mixed = await recommendBuilds(fixture(), { ...stones, common: ["集中"] }, {
      ...options, includeDrifts: true, driftOnly: ["攻擊"], required: { "攻擊": 4, "集中": 2 },
    });
    expect(mixed.recommendations[0].stoneCount).toBe(5);
    expect(mixed.recommendations[0].skills).toEqual({ "攻擊": 9, "集中": 2 });
  });

  it("locks a slot to a chosen piece and grade, with only the holes unlocked at that grade", async () => {
    const series = fixture();
    const result = await recommendBuilds(series, stones, { ...options, required: { "攻擊": 7 }, includeDrifts: true, fixed: { helm: { key: "helm", grade: 4 } } });
    const item = result.recommendations[0];
    expect(item.build.gear.helm).toBe("helm");
    expect(item.build.drifts.helm).toEqual([]);
    expect(item.stoneCount).toBe(2);
    expect(item.alternatives.helm).toBeUndefined();
    await expect(recommendBuilds(series, stones, { ...options, fixed: { helm: { key: "nope", grade: 4 } } })).rejects.toThrow("找不到指定的");
  });

  it("rejects unavailable drift-only skills and disabled stones, and respects locked slots", async () => {
    await expect(recommendBuilds(fixture(), stones, { ...options, driftOnly: ["攻擊"] })).rejects.toThrow("開啟允許漂流石");
    await expect(recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, required: { "集中": 1 }, driftOnly: ["集中"] })).rejects.toThrow("沒有「集中」");
    const locked = await recommendBuilds(fixture(), stones, { ...options, includeDrifts: true, driftOnly: ["攻擊"], grade: 4 });
    expect(locked.recommendations).toEqual([]);
    const removed = await recommendBuilds(fixture(), stones, { ...options, driftOnly: ["已移除技能"] });
    expect(removed.recommendations[0].stoneCount).toBe(0);
  });

  it("finds Focus 5 entirely from drifts alongside SP evasion using current data", async () => {
    const data: { series: RecommendSeries[] } = JSON.parse(readFileSync("public/mhnow/series-index.json", "utf8"));
    const driftData: RecommendDrifts = JSON.parse(readFileSync("public/mhnow/driftstones.json", "utf8"));
    const weapon = data.series.find((item) => item.weaponTypes.includes("bow"))!;
    const result = await recommendBuilds(data.series, driftData, {
      weapon: `${weapon.key}::bow`, grade: 10, required: { "集中": 5, "絕對迴避【SP】": 1 }, includeDrifts: true, driftOnly: ["集中"],
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const item of result.recommendations) {
      expect(Object.values(item.build.drifts).flat().filter((pick) => pick?.skill === "集中")).toHaveLength(5);
      expect(item.skills["絕對迴避【SP】"]).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns full armor sets, weapon-specific skills and keeps input unchanged", async () => {
    const series = fixture();
    const before = JSON.stringify(series);
    const { recommendations } = await recommendBuilds(series, stones, options);
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
    series.push({ key: "alt", name: "替代頭", hasArmor: true, weaponTypes: [], skills: { helm: [] }, slots: { helm: [5, 5] } });
    const result = await recommendBuilds(series, stones, { ...options, includeDrifts: true });
    expect(result.recommendations.map((item) => item.stoneCount)).toEqual([0, 1]);
    expect(new Set(result.recommendations.map((item) => JSON.stringify(item.build.gear))).size).toBe(2);
  });

  it("supports cancellation and rejects invalid weapons", async () => {
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

  it("drops strictly worse pieces and avoids levels beyond the skill cap", async () => {
    const series = fixture().map((item) => item.hasArmor ? { ...item, skills: { [item.key]: [entry("攻擊", 2)] } } : item);
    for (const slot of RECOMMEND_SLOTS) series.push({ key: `plain-${slot}`, name: "無技能", hasArmor: true, weaponTypes: [], skills: { [slot]: [] } });
    const { recommendations } = await recommendBuilds(series, stones, { ...options, maxLevels: { "攻擊": 5 } });
    expect(recommendations).toHaveLength(1);
    // 每件 2 級，要 5 級至少三件：6 級只浪費 1 級，其餘兩件換成無技能的防具。
    expect(recommendations[0].skills["攻擊"]).toBe(6);
    expect(recommendations[0].overflow).toBe(1);
    expect(Object.values(recommendations[0].build.gear).filter((key) => key.startsWith("plain-"))).toHaveLength(2);
  });

  it("also lists a build whose extra level is unavoidable, after the one with less waste", async () => {
    // 手、腳各給集中 2（共 4），要 5 級：身體一定要穿，給 1 的剛好 5，給 2 的變 6 但強度一樣。
    const plain = (slot: string) => ({ key: `plain-${slot}`, name: "無技能", hasArmor: true, weaponTypes: [], skills: { [slot]: [] } });
    const series: RecommendSeries[] = [
      { key: "weapon", name: "武器", hasArmor: false, weaponTypes: ["hammer"], skills: { weapon: [] } },
      { key: "g", name: "手", hasArmor: true, weaponTypes: [], skills: { gloves: [entry("集中", 2)] } },
      { key: "gr", name: "腳", hasArmor: true, weaponTypes: [], skills: { greaves: [entry("集中", 2)] } },
      { key: "m1", name: "身1", hasArmor: true, weaponTypes: [], skills: { mail: [entry("集中", 1)] } },
      { key: "m2", name: "身2", hasArmor: true, weaponTypes: [], skills: { mail: [entry("集中", 2)] } },
      plain("helm"), plain("belt"),
    ];
    const { recommendations } = await recommendBuilds(series, stones, { weapon: "weapon::hammer", grade: 10, required: { "集中": 5 }, maxLevels: { "集中": 5 }, includeDrifts: false });
    expect(recommendations.map((item) => [item.build.gear.mail, item.skills["集中"], item.overflow])).toEqual([["m1", 5, 0], ["m2", 6, 1]]);
    // 換裝也找得到：身體集中 1 ↔ 集中 2 互為替代品；拿掉就不夠 5 級的手、腳沒有替代品。
    expect(recommendations[0].alternatives).toEqual({ mail: ["m2"] });
    expect(recommendations[1].alternatives).toEqual({ mail: ["m1"] });
    const swapped = swapPiece(recommendations[0], "mail", "m2", series, { grade: 10, required: { "集中": 5 }, maxLevels: { "集中": 5 } });
    expect([swapped.build.gear.mail, swapped.skills["集中"], swapped.overflow]).toEqual(["m2", 6, 1]);
  });

  it("does not offer a swap that changes the drift stones or the number of slots", async () => {
    const series: RecommendSeries[] = [
      { key: "weapon", name: "武器", hasArmor: false, weaponTypes: ["hammer"], skills: { weapon: [] } },
      ...RECOMMEND_SLOTS.map((slot) => ({ key: slot, name: slot, hasArmor: true, weaponTypes: [], skills: { [slot]: [entry("攻擊", 1)] }, slots: { [slot]: [5] } })),
      // 攻擊 2 但沒有洞：要求技能夠了，可是少一個洞，空洞數不同。
      { key: "helm-noslot", name: "無洞頭", hasArmor: true, weaponTypes: [], skills: { helm: [entry("攻擊", 2)] } },
    ];
    const { recommendations } = await recommendBuilds(series, stones, { weapon: "weapon::hammer", grade: 10, required: { "攻擊": 5 }, maxLevels: { "攻擊": 5 }, includeDrifts: true });
    expect(recommendations[0].build.gear.helm).toBe("helm");
    expect(recommendations[0].alternatives.helm ?? []).not.toContain("helm-noslot");
  });

  it("merges interchangeable pieces into one recommendation", async () => {
    const series = fixture();
    series.push({ key: "twin", name: "同款頭", hasArmor: true, weaponTypes: [], skills: { helm: [entry("攻擊", 1), entry("麻痺耐性", 1)] }, slots: { helm: [5] } });
    const { recommendations } = await recommendBuilds(series, stones, options);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].build.gear.helm).toBe("helm");
    expect(recommendations[0].alternatives).toEqual({ helm: ["twin"] });
    const swapped = swapPiece(recommendations[0], "helm", "twin", series, options);
    expect(swapped.build.gear.helm).toBe("twin");
    expect(swapped.alternatives).toEqual({ helm: ["helm"] });
    expect(swapped.skills).toEqual({ ...recommendations[0].skills, "麻痺耐性": 1 });
    expect(swapPiece(swapped, "helm", "helm", series, options).skills).toEqual(recommendations[0].skills);
  });

  it("prefers common drift stones over rare ones at the same stone count", async () => {
    const series = fixture();
    series.push({ key: "guard", name: "防禦頭", hasArmor: true, weaponTypes: [], skills: { helm: [entry("防禦", 1)] }, slots: { helm: [5] } });
    const mixed: RecommendDrifts = { colors: [{ key: "white", skills: [{ name: "攻擊", rare: true }] }], common: ["防禦"], events: [] };
    const { recommendations } = await recommendBuilds(series, mixed, { ...options, includeDrifts: true, required: { "攻擊": 6, "防禦": 1 } });
    expect(recommendations.map((item) => [item.build.gear.helm, item.stoneCount, item.rareStones])).toEqual([["helm", 2, 1], ["guard", 2, 2]]);
    expect(recommendations[0].build.drifts.mail).toEqual([{ skill: "防禦", color: "common" }]);
  });

  it("treats normal skills of mixed mystery stones as non-rare", async () => {
    const mystery: RecommendDrifts = { colors: [], common: [], events: [{ skills: ["SP技能威力提升", "攻擊"], rare: ["SP技能威力提升"] }, { skills: ["看破"] }] };
    const result = await recommendBuilds(fixture(), mystery, { ...options, includeDrifts: true, required: { "攻擊": 6, "看破": 1 } });
    expect(result.recommendations[0].stoneCount).toBe(2);
    expect(result.recommendations[0].rareStones).toBe(1);
  });

  it("ranks bonus skills after the stone count", async () => {
    const series = fixture();
    series.push({ key: "sharp", name: "看破頭", hasArmor: true, weaponTypes: [], skills: { helm: [entry("攻擊", 1), entry("看破", 2)] } });
    const { recommendations } = await recommendBuilds(series, stones, { ...options, bonus: ["看破"] });
    expect(recommendations.map((item) => [item.build.gear.helm, item.bonus])).toEqual([["sharp", 2]]);
    const plain = await recommendBuilds(series, stones, { ...options, includeDrifts: true, bonus: ["看破"] });
    expect(plain.recommendations.map((item) => item.build.gear.helm)).toEqual(["sharp", "helm"]);
  });
});
