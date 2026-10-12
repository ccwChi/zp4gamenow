import { describe, expect, it } from "vitest";
import { popularSkills } from "./popularSkills";

describe("popularSkills", () => {
  it("drops element skills that do not match the weapon element", () => {
    const all = popularSkills("bow");
    expect(all).toContain("冰屬性攻擊強化");
    const blast = popularSkills("bow", "blast");
    expect(blast).not.toContain("冰屬性攻擊強化");
    expect(blast).not.toContain("龍屬性攻擊強化");
    expect(popularSkills("bow", "ice")).toContain("冰屬性攻擊強化");
    expect(popularSkills("bow", "ice")).not.toContain("龍屬性攻擊強化");
  });

  it("keeps non-element skills and returns nothing for unknown weapon types", () => {
    expect(popularSkills("bow", "blast")).toContain("集中");
    expect(popularSkills("nope")).toEqual([]);
  });
});
