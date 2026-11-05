import { describe, expect, it } from "vitest";
import driftstones from "../../public/mhnow/driftstones.json";
import { driftPickOptions, searchDriftSkills, type DriftSearchData } from "./driftSearch";

const data: DriftSearchData = {
  colors: [
    { key: "fire", label: "火", commonChance: 3, skills: [{ name: "火屬性攻擊強化", rare: false, chance: 5 }, { name: "超會心", rare: true, chance: 10 }] },
    { key: "water", label: "水", commonChance: 4, skills: [{ name: "超會心", rare: false, chance: 6 }] },
  ],
  common: ["攻擊"],
  events: [{ key: "event-a", label: "神秘A", skills: ["超會心", "攻擊力"], rare: ["超會心"] }],
};

describe("searchDriftSkills", () => {
  it("matches characters in order even when they are not adjacent", () => {
    expect(searchDriftSkills(data, "火強").map((hit) => hit.name)).toEqual(["火屬性攻擊強化"]);
    expect(searchDriftSkills(data, "強火")).toEqual([]);
  });

  it("lists every stone that can produce the skill", () => {
    expect(searchDriftSkills(data, "超會心")[0].stones.map((stone) => [stone.tab, stone.rare, stone.chance])).toEqual([
      ["fire", true, 10], ["water", false, 6], ["event", true, undefined],
    ]);
  });

  it("lists common skills under each color with that color's chance", () => {
    expect(searchDriftSkills(data, "攻擊")[0]).toMatchObject({ name: "攻擊", stones: [{ key: "fire", chance: 3 }, { key: "water", chance: 4 }] });
  });

  it("ranks exact and adjacent matches first and ignores empty input", () => {
    expect(searchDriftSkills(data, "攻擊").map((hit) => hit.name)).toEqual(["攻擊", "攻擊力", "火屬性攻擊強化"]);
    expect(searchDriftSkills(data, "  ")).toEqual([]);
  });

  it("offers one pick per color, merging common and event stones", () => {
    const options = (name: string) => driftPickOptions(data, searchDriftSkills(data, name)[0]).map((option) => option.color);
    expect(options("超會心")).toEqual(["fire", "water", "event"]);
    expect(options("攻擊")).toEqual(["common"]);
  });

  it("finds skills in the real data", () => {
    expect(searchDriftSkills(driftstones, "爆破屬性").length).toBeGreaterThan(0);
  });
});
