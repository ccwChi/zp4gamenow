import { describe, expect, it } from "vitest";
// 換算規則在轉檔腳本用的解析模組裡（純 JS，沒有型別宣告）。
// @ts-expect-error TS7016
import { groupOf, rarityOf } from "../../scripts/mhn-quest-resolve.mjs";

describe("rarityOf", () => {
  it("maps the monster-specific letters b to e onto R2 to R5", () => {
    expect(["b", "c", "d", "e"].map(rarityOf)).toEqual([2, 3, 4, 5]);
  });
  it("gives the primary drop and the herbs R1", () => {
    expect(["a", "a1", "a2", "g", "j"].map(rarityOf)).toEqual([1, 1, 1, 1, 1]);
  });
  it("rates the rare group and the dragon-jewel pair as mhn.quest does", () => {
    expect(rarityOf("f")).toBe(3);
    expect(rarityOf("F")).toBe(3);
    expect(rarityOf("f*")).toBe(6);
    expect(rarityOf("f1")).toBe(6);
    expect(rarityOf("l")).toBe(6); // 龍玉碎片
    expect(rarityOf("m")).toBe(6); // 貴龍石
  });
  it("takes the second letter for the ore and bone groups", () => {
    expect(["ha", "hb", "hc"].map(rarityOf)).toEqual([1, 2, 3]);
  });
  it("only reads the part after the slash for full paths", () => {
    expect(rarityOf("alloy-armor/b")).toBe(2);
  });
  it("has no rarity for Zenny", () => {
    expect(rarityOf("z")).toBeUndefined();
  });
});

describe("groupOf", () => {
  it("puts the wyvern hide and claw in their own group", () => {
    expect(groupOf("j")).toBe("wyvern");
  });
  it("treats crystals, herbs, ore and bone as gathered", () => {
    expect(["f", "F", "g", "ha", "Hb"].map(groupOf)).toEqual(["gather", "gather", "gather", "gather", "gather"]);
  });
  it("sets refinement materials and the dragon jewel apart from both", () => {
    expect(["k", "l", "m"].map(groupOf)).toEqual(["misc", "misc", "misc"]);
  });
  it("leaves monster-specific materials ungrouped, including the series' own f", () => {
    expect(["a", "b", "e", "f*", "f1", "ib", "alloy-armor/b"].map(groupOf)).toEqual(Array(7).fill(undefined));
  });
});
