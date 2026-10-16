import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { canonicalSkillName } from "./skills";
import { groupSkills } from "./skillCategories";
import { initialBuildState, parseBuildState, serializeBuildState, exportFile, parseImport, defaultStats, gearId } from "./buildStore";
import { decodeBuildShare, encodeBuildShare } from "./buildShare";

it("uses corrected skill names in source data, generated data and elemental categories", () => {
  for (const path of ["data-source/mhn-quest/data.mjs", "data-source/mhn-quest/zh.json", "data-source/mhn-quest/ja.json", "public/mhnow/series-index.json"]) {
    const text = readFileSync(path, "utf8");
    expect(text, path).not.toContain("高速蓄力");
    expect(text, path).toContain("高能強化【雷】");
  }
  const catalog = JSON.parse(readFileSync("public/mhnow/series-index.json", "utf8"));
  expect(catalog.skillLevels["高能強化【雷】"].length).toBeGreaterThan(0);
  expect(catalog.series.some((item: { skills: Record<string, { skill: string }[]> }) => Object.values(item.skills).flat().some((entry) => entry.skill === "高能強化【雷】"))).toBe(true);
  expect(groupSkills(["高能強化【雷】"])).toEqual([{ key: "element", label: "屬性", skills: ["高能強化【雷】"] }]);
});

it("renames older saved drift skills and deduplicates corrected forged skills on load and import", () => {
  const original = initialBuildState();
  const id = gearId("helm", "zino::armor");
  const raw = JSON.parse(serializeBuildState(original));
  raw.builds[0].drifts = { helm: ["高速蓄力【雷】", { skill: "高速蓄力【雷】", color: "yellow" }] };
  raw.forged = { [id]: ["高速蓄力【雷】", "高能強化【雷】"] };
  const restored = parseBuildState(JSON.stringify(raw));
  expect(restored.builds[0].drifts.helm).toEqual([{ skill: "高能強化【雷】", color: "" }, { skill: "高能強化【雷】", color: "yellow" }]);
  expect(restored.forged?.[id]).toEqual(["高能強化【雷】"]);
  const imported = parseImport(JSON.stringify(raw));
  expect("state" in imported && imported.state).toEqual(restored);
  expect(exportFile(restored, defaultStats())).not.toContain("高速蓄力");
});

it("accepts old shared names and normalizes any elemental variants without altering other skills", () => {
  const build = { ...initialBuildState().builds[0], gear: { helm: "zino" }, drifts: { helm: [{ skill: "高速蓄力【雷】", color: "yellow" }] } };
  const decoded = decodeBuildShare(encodeBuildShare(build));
  expect("build" in decoded && decoded.build.drifts.helm?.[0]?.skill).toBe("高能強化【雷】");
  for (const element of ["火", "水", "雷", "冰", "龍"]) expect(canonicalSkillName(`高速蓄力【${element}】`)).toBe(`高能強化【${element}】`);
  expect(canonicalSkillName("完美蓄力解放")).toBe("完美蓄力解放");
});
