// Pure logic: URL mapping, part-number formatting, and the vehicle-data rules.
import { describe, expect, it } from "vite-plus/test";
import type { PrInfo } from "../../src/lib/tables";
import { fmtPart, normPos, plateKeyLabel } from "../../src/lib/text";
import {
  emptyVehicleData,
  headerMatches,
  rowMatches,
  type VehicleData,
} from "../../src/lib/vehicleFilter";
import { locationToState, stateToLocation, STATE_KEYS, type AppState } from "../../src/urlState";

const state = (patch: Partial<AppState>): AppState =>
  ({ ...Object.fromEntries(STATE_KEYS.map((k) => [k, null])), ...patch }) as AppState;

/** Resolve a location the way the router does, from the path patterns in routes.ts. */
function resolve(loc: { path: string; query: Record<string, unknown> }) {
  const patterns: [string, RegExp, string[]][] = [
    ["home", /^\/$/, []],
    ["partsList", /^\/([^/]+)\/parts-list$/, ["market"]],
    ["description", /^\/([^/]+)\/description\/([^/]+)$/, ["market", "ts"]],
    ["codes", /^\/([^/]+)\/codes\/([^/]+)$/, ["market", "codes"]],
    ["search", /^\/([^/]+)\/search$/, ["market"]],
    ["plate", /^\/([^/]+)\/catalog\/([^/]+)\/plate\/([^/]+)$/, ["market", "kat", "plate"]],
    ["graphic", /^\/([^/]+)\/catalog\/([^/]+)\/graphic\/([^/]+)$/, ["market", "kat", "nav"]],
    ["paint", /^\/([^/]+)\/catalog\/([^/]+)\/paint$/, ["market", "kat"]],
    [
      "equipment",
      /^\/([^/]+)\/catalog\/([^/]+)\/equipment(?:\/([^/]+))?$/,
      ["market", "kat", "equip"],
    ],
    ["catalog", /^\/([^/]+)\/catalog\/([^/]+)$/, ["market", "kat"]],
    ["vehicles", /^\/([^/]+)$/, ["market"]],
  ];
  for (const [name, re, keys] of patterns) {
    const m = re.exec(loc.path);
    if (!m) continue;
    const params: Record<string, string> = {};
    keys.forEach((k, i) => m[i + 1] !== undefined && (params[k] = decodeURIComponent(m[i + 1])));
    const query = Object.fromEntries(Object.entries(loc.query).map(([k, v]) => [k, String(v)]));
    return locationToState({ name, params, query });
  }
  throw new Error(`no route for ${loc.path}`);
}

describe("URL state", () => {
  const cases: Partial<AppState>[] = [
    {},
    { market: "USA" },
    { market: "USA", model: "8W5" },
    { market: "USA", model: "8W5", year: "2018", kat: "849", hg: "8" },
    { market: "USA", kat: "849", hg: "8", plate: "85771" },
    { market: "USA", kat: "849", plate: "85771", part: "8W0857805" },
    { market: "USA", kat: "849", nav: "2", navref: "A4B9:ER1" },
    { market: "USA", kat: "849", paint: "1" },
    { market: "USA", kat: "849", equip: "1" },
    { market: "USA", kat: "849", equip: "KS1" },
    { market: "USA", kat: "849", q: "seat belt" },
    { market: "RDW", codes: "gearbox", code: "SUZ" },
    { market: "RDW", ts: "24164", kat: "673" },
    { market: "RDW", list: "1", kat: "673", plate: "10061" },
  ];
  it.each(cases)("round-trips %o", (patch) => {
    expect(resolve(stateToLocation(state(patch)))).toEqual(state(patch));
  });
  it("builds readable paths", () => {
    expect(
      stateToLocation(state({ market: "USA", kat: "849", plate: "85771 ", year: "2018" })),
    ).toEqual({
      path: "/USA/catalog/849/plate/85771",
      query: { year: "2018" },
    });
    expect(stateToLocation(state({ market: "USA", kat: "849", q: "CYMC" })).path).toBe(
      "/USA/search",
    );
  });
  it("drops the padding of illustration keys", () => {
    expect(resolve({ path: "/USA/catalog/849/plate/85771 ", query: {} }).plate).toBe("85771");
  });
});

describe("formatting", () => {
  it("formats part numbers", () => {
    expect(fmtPart("8W0857805   ")).toBe("8W0 857 805");
    expect(fmtPart("8W0857805A GLE")).toBe("8W0 857 805 A GLE");
    expect(fmtPart("N  10632402")).toBe("N  106 324 02");
    expect(fmtPart("")).toBe("");
  });
  it("normalizes positions and illustration keys", () => {
    expect(normPos(" (1) ")).toBe("1");
    expect(plateKeyLabel("85771 ")).toBe("857-71");
  });
});

// PR codes with their families, as PRSTAM would define them.
const prInfo: PrInfo = {
  code: new Map(
    Object.entries({
      GP0: "PAM",
      GP1: "PAM",
      "3ND": "HIS",
      "3NT": "HIS",
      ER1: "RCO",
      ER2: "RCO",
      EZ1: "RCO",
      EL0: "ELA",
      KS0: "HUD",
      KS1: "HUD",
    }).map(([code, family]) => [code, { family, text: code }]),
  ),
  family: new Map(),
};
const vd = (pr: Record<string, string>, mkb = ""): VehicleData => ({
  ...emptyVehicleData(),
  pr,
  mkb,
});

describe("illustration conditions", () => {
  it("treats ',' as or inside '+' as and", () => {
    expect(headerMatches(["PR:GP0+3NT"], vd({ PAM: "GP0", HIS: "3NT" }), prInfo)).toBe(true);
    expect(headerMatches(["PR:GP0+3NT"], vd({ PAM: "GP1", HIS: "3NT" }), prInfo)).toBe(false);
    expect(headerMatches(["PR:GP0+3NT"], vd({ PAM: "GP0", HIS: "3ND" }), prInfo)).toBe(false);
  });
  it("only rules out on families the vehicle data decides", () => {
    expect(headerMatches(["PR:GP0+3NT"], vd({ PAM: "GP0" }), prInfo)).toBe(true);
    expect(headerMatches(["PR:GP1+1XA"], vd({}), prInfo)).toBe(true);
  });
  it("joins code lists continued on the next line", () => {
    expect(headerMatches(["PR:ER1,ER2,", "EZ1+EL0"], vd({ RCO: "EZ1" }), prInfo)).toBe(true);
    expect(headerMatches(["PR:ER1,ER2,", "EZ1+EL0"], vd({ RCO: "ER3" }), prInfo)).toBe(false);
  });
  it("checks engine codes", () => {
    const md = ["4-cylinder+", "Petrol eng.+", "CVLA,DRXA"];
    expect(headerMatches(md, vd({}, "CYRB"), prInfo)).toBe(false);
    expect(headerMatches(md, vd({}, "DRXA"), prInfo)).toBe(true);
    expect(headerMatches(["Diesel eng.+", "PR:GP0"], vd({ PAM: "GP0" }), prInfo)).toBe(true);
  });
});

describe("part rows", () => {
  const row = { C0: ["KS1"], HG: ["CYMC"], C3: ["SUZ"] };
  it("matches PR, engine and gearbox codes", () => {
    expect(rowMatches(row, vd({ HUD: "KS1" }), prInfo)).toBe(true);
    expect(rowMatches(row, vd({ HUD: "KS0" }), prInfo)).toBe(false);
    expect(rowMatches(row, vd({}, "CVKB"), prInfo)).toBe(false);
    expect(rowMatches(row, { ...vd({}), gkb: "SNK SUZ" }, prInfo)).toBe(true);
    expect(rowMatches(row, { ...vd({}), gkb: "SNK" }, prInfo)).toBe(false);
  });
});
