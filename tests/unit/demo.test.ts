// The built-in demo catalog, read back with the viewer's own data layer: proves the encoders in
// src/demo/writer.ts write what src/lib/format decodes.
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { buildDemoFiles, DEMO_BRAND, DEMO_VIN } from "../../src/demo";
import { navGroups, navPicture, navRefs, paintData } from "../../src/lib/catalogData";
import { Dump, findBrands, setDump, type Catalog } from "../../src/lib/dump";
import { parseTiff } from "../../src/lib/format/tiff";
import { MemoryDir } from "../../src/lib/fs";
import {
  Codes,
  CrossRef,
  ModelCodes,
  Notes,
  Parts,
  PR,
  VehicleCodes,
  WhereUsed,
} from "../../src/lib/tables";
import { plateLabel, plateTitle } from "../../src/lib/text";
import { plateFits, type VehicleData } from "../../src/lib/vehicleFilter";
import { decodeVin } from "../../src/lib/vin";

describe("demo catalog", () => {
  let d: Dump;
  let cat: Catalog;
  let files: Map<string, Uint8Array>;

  beforeAll(async () => {
    files = await buildDemoFiles();
    const brands = await findBrands(MemoryDir.from(files));
    expect(brands.map((b) => b.name)).toEqual([DEMO_BRAND]);
    d = new Dump(brands[0].name, brands[0].brandDir, brands[0].data);
    await d.init();
    await d.setLanguage("EN");
    setDump(d);
    cat = await d.catalog("RDW", 1);
  });

  it("stays small", () => {
    const total = [...files.values()].reduce((a, b) => a + b.length, 0);
    expect(total).toBeLessThan(3_000_000);
  });

  it("has the vehicle index, texts and main groups", () => {
    expect(d.markets).toEqual(["RDW", "USA"]);
    const m = d.model("RDW", "PQC")!;
    expect(m.name).toBe("Pipsqueak Coupe");
    expect(m.catalogs.map((c) => [c.year, c.kat, c.types])).toEqual([
      [2025, 1, ["PC1"]],
      [2024, 1, ["PC1"]],
    ]);
    expect(d.hgNames["1"]).toBe("Body");
    expect(d.hgNames["6"]).toBe("Accessories");
  });

  it("decodes the catalog", () => {
    expect(cat.plates.map(plateLabel)).toEqual([
      "101-01",
      "101-10",
      "201-01",
      "202-01",
      "301-01",
      "302-01",
      "401-01",
      "501-01",
      "502-01",
      "601-01",
      "602-01",
    ]);
    const roof = cat.plates[3];
    expect(plateTitle(roof)).toEqual({
      title: "Roof and pillars",
      remark: "Not on open-top cars",
      model: "PR:RF1",
    });
    const shell = cat.plates[0].rows.filter((r) => r.AC);
    expect(shell[0].AC.trimEnd()).toBe("PQ0101011");
    expect(shell[0].C0).toEqual(["RD1"]);
    expect(shell.find((r) => r.AE === "3")!.DD).toEqual(["8"]);
    expect(cat.plates[0].nav.map((id) => d.text(id))).toEqual(["Body shell"]);
  });

  it("draws illustrations with hotspots and thumbnails", async () => {
    const plate = cat.plates[5];
    const bilder = await d.brandDir!.dir("Bilder");
    const tif = await (await bilder!.dir("PQ0"))!.file(`${plate.graphic}.tif`);
    const img = parseTiff(new Uint8Array(await tif!.arrayBuffer()));
    expect([img.width, img.height]).toEqual([1400, 1000]);
    expect(img.hotspots.map((h) => h.label)).toEqual(["1", "2", "3", "4"]);
    expect(img.bits.some((b) => b !== 0)).toBe(true);
    const png = await (await (await d.brandDir!.dir("minis"))!.dir("PQ0"))!.file(
      `${plate.graphic}.png`,
    );
    expect([...new Uint8Array(await png!.arrayBuffer()).subarray(1, 4)]).toEqual([
      0x50, 0x4e, 0x47,
    ]);
  });

  it("has a graphic navigation picture with labelled areas", async () => {
    const groups = navGroups(await navRefs(1));
    expect(groups).toEqual([{ ref: "PQC", pr: [], types: ["PC1"] }]);
    const pic = await navPicture("PQC", "2");
    expect(pic!.width).toBe(1500);
    expect(new Set(pic!.labels.map((l) => d.text(l.id)))).toContain("Push handle");
    expect(pic!.labels).toHaveLength(11);
  });

  it("looks up the part master, prices, notes and supersessions", async () => {
    expect(d.text((await Parts.master("PQ0302011"))!.A1)).toBe("rear wheel");
    expect((await Parts.price("PQ0302011"))!.amount).toBeGreaterThan(0);
    const old = await Parts.master("PQ0401021");
    expect(old!.B0[0].B1.trimEnd()).toBe("PQ0401021A");
    expect((await Parts.searchMaster("PQ04010")).length).toBe(6);
    expect((await Notes.plate(1, cat.plates[5].key, "RDW"))!.text).toMatch(/^Tighten the hub caps/);
    expect((await Notes.part("PQ0302011", "RDW"))!.text).toMatch(/^Puncture-proof/);
  });

  it("has equipment codes, vehicle codes, paint and cross-references", async () => {
    const pr = await PR.load();
    expect(pr.code.get("HN1")).toEqual({ family: "HRN", text: "Squeaky horn" });
    expect(pr.family.get("PSH")).toBe("Push handle");
    expect([...(await VehicleCodes.forCatalog("RDW", 1)).engines.keys()]).toEqual(["LEG2"]);
    expect((await ModelCodes.forCatalog("RDW", 1)).map((m) => m.code)).toEqual([
      "PC1RA1",
      "PC1RB1",
    ]);
    expect((await Codes.load("RDW")).engines[0].code).toBe("LEG2");
    expect((await paintData("RDW")).vg).toHaveLength(4);
    expect(await WhereUsed.candidates("PQ0101031", "RDW")).toEqual([
      { kat: 1, plates: ["10101", "10110", "20201", "40101", "50201"] },
    ]);
    const screw = (await Parts.master("PQ0101031"))!.A1;
    expect((await CrossRef.uses(screw, "RDW"))[0].plates).toHaveLength(5);
  });

  it("filters by vehicle data", async () => {
    const prInfo = await PR.load();
    const f: VehicleData = {
      mkb: "",
      gkb: "",
      pr: { ROF: "RF0", PSH: "PS0", TEL: "TP1" },
      hide: false,
      sticker: null,
    };
    const fitting = cat.plates
      .filter((p) => plateFits(p, { f, prInfo, active: true }))
      .map(plateLabel);
    expect(fitting).not.toContain("202-01");
    expect(fitting).not.toContain("502-01");
    expect(fitting).toContain("602-01");
  });

  it("decodes the demo VIN", async () => {
    const v = await decodeVin(DEMO_VIN, "RDW", d.models);
    expect(v.years).toEqual([2024]);
    expect(v.hits.map((h) => [h.model.code, h.cat.kat])).toEqual([["PQC", 1]]);
    expect(v.otherMarkets).toEqual(["USA"]);
  });
});
