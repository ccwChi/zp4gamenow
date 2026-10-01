import { describe, expect, it } from "vitest";
// 素材代碼解析在轉檔腳本用的解析模組裡（純 JS，沒有型別宣告）。
// @ts-expect-error TS7016
import { costRowFor, gatherKindOf, materialPath, tablesFor } from "../../scripts/mhn-quest-resolve.mjs";

// 只放測試用得到的欄位：一般系列、古龍系列、有別名的系列。
const data = {
  weaponType: ["bow", "great-sword"],
  itemType: { plain: ["b", "g", "2", ""], aliased: ["b", "g", "1", "other"], bowAlias: ["c", "g", "2", "bowmon"] },
  default: { "weaponCost-cheap": { 3: { 1: [1] } } },
  costType: { 5: { 1: ["z", "a"] } },
  forgeArmorCost: { 5: [10, 1] },
  armorCost: { 5: { 1: [10, 1] } },
  forgeWeaponCost: { 5: [10, 1] },
  weaponCost: { 5: { 1: [10, 1] } },
  set: {
    plain: {},
    elder: { elder: 1 },
    aliased: { itemType: { bow: "bowAlias" } },
    cheap: { forge: { weapon: "weaponCost-cheap" } },
    "nested-forge": { forge: { armor: "g5ArmorCost" } },
  },
  g5ArmorCost: { 5: { 1: [3000, 4], 2: [1, 1] } },
};

describe("materialPath", () => {
  it("sends a to a1 for armor and a2 for weapons", () => {
    expect(materialPath(data, "plain", "belt", "a")).toBe("plain/a1");
    expect(materialPath(data, "plain", "great-sword", "a")).toBe("plain/a2");
  });
  it("reads c as the monster's own c, except on elder dragons where it is the c1 / c2 hide and bone", () => {
    expect(materialPath(data, "plain", "belt", "c")).toBe("plain/c");
    expect(materialPath(data, "elder", "belt", "c")).toBe("elder/c1");
    expect(materialPath(data, "elder", "great-sword", "c")).toBe("elder/c2");
  });
  it("maps f* to the series' own f, and f / g through the alias table", () => {
    expect(materialPath(data, "plain", "belt", "f*")).toBe("plain/f");
    expect(materialPath(data, "plain", "belt", "f")).toBe("f/b");
    expect(materialPath(data, "plain", "belt", "g")).toBe("g/g");
  });
  it("flips the ore / bone group for H", () => {
    expect(materialPath(data, "plain", "belt", "ha")).toBe("h2/a");
    expect(materialPath(data, "plain", "belt", "Ha")).toBe("h1/a");
    expect(materialPath(data, "aliased", "belt", "ha")).toBe("h1/a");
  });
  it("points i at another series, and omits the item when the series has no alias", () => {
    expect(materialPath(data, "plain", "belt", "ib")).toBeNull();
    expect(materialPath(data, "aliased", "belt", "ib")).toBe("other/b");
    expect(materialPath(data, "aliased", "belt", "ia")).toBe("other/a1");
  });
  it("lets a weapon type use its own alias entry", () => {
    expect(materialPath(data, "aliased", "bow", "f")).toBe("f/c");
    expect(materialPath(data, "aliased", "great-sword", "f")).toBe("f/b");
  });
  it("handles full paths and the dragon-jewel pair", () => {
    expect(materialPath(data, "plain", "belt", "alloy-armor/b")).toBe("alloy-armor/b");
    expect(materialPath(data, "plain", "belt", "l")).toBe("l");
    expect(materialPath(data, "plain", "belt", "z")).toBeUndefined();
  });
});

describe("tablesFor", () => {
  it("finds hyphenated tables in the default export instead of falling back", () => {
    const tables = tablesFor(data, "cheap", "great-sword");
    expect(tables.forge).toBe(data.default["weaponCost-cheap"]);
    expect(tables.approximate).toBe(false);
  });
  it("flags a table that exists nowhere as approximate", () => {
    const missing = { ...data, set: { x: { forge: { weapon: "winter-25-weapon-cost" } } } };
    expect(tablesFor(missing, "x", "great-sword").approximate).toBe(true);
  });
  it("does not mistake forge.armor (a cost table name) for a type table", () => {
    expect(tablesFor(data, "nested-forge", "armor").forgeType).toBe(data.costType);
  });
});

describe("costRowFor", () => {
  it("takes level 1 when the forge table is split by level", () => {
    const tables = tablesFor(data, "nested-forge", "armor");
    expect(costRowFor(tables, 5, "1", true).costRow).toEqual([3000, 4]);
  });
  it("reads a flat forge row and an upgrade row as they are", () => {
    const tables = tablesFor(data, "plain", "armor");
    expect(costRowFor(tables, 5, "1", true).costRow).toEqual([10, 1]);
    expect(costRowFor(tables, 5, "1", false).costRow).toEqual([10, 1]);
  });
});

describe("gatherKindOf", () => {
  it("sorts gathered items into ore, bone, plant, bug, mushroom and rare", () => {
    expect(["h2/a", "h1/c", "g/a", "g/i", "g/f", "g/d", "f/b"].map(gatherKindOf)).toEqual(["ore", "bone", "plant", "plant", "bug", "mushroom", "rare"]);
  });
  it("leaves monster parts alone", () => {
    expect(gatherKindOf("kulu/b")).toBeUndefined();
    expect(gatherKindOf(undefined)).toBeUndefined();
  });
});
