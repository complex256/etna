// Decodes a real dump with the viewer's own data layer. Set DUMP to a brand folder (the one
// containing Data1/Data2, Bilder, …); without it these tests are skipped.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { navGroups, navPicture, navRefs } from "../../src/lib/catalogData";
import { Dump, findBrands, setDump, type Catalog } from "../../src/lib/dump";
import { parseTiff } from "../../src/lib/format/tiff";
import { Parts, PR, WhereUsed } from "../../src/lib/tables";
import { plateLabel, plateTitle } from "../../src/lib/text";
import { plateFits, type VehicleData } from "../../src/lib/vehicleFilter";
import { decodeVin } from "../../src/lib/vin";
import { NodeDir } from "./nodeDir";

const root = process.env.DUMP?.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
const usable = !!root && fs.existsSync(root);

describe.skipIf(!usable)("real dump", () => {
  let d: Dump;
  let usa: Catalog | null = null;

  beforeAll(async () => {
    const brands = await findBrands(new NodeDir(path.resolve(root!)));
    expect(brands.length).toBeGreaterThan(0);
    const b = brands[0];
    d = new Dump(b.name, b.brandDir, b.data);
    await d.init();
    await d.setLanguage("EN");
    setDump(d);
    // USA catalog 849 (model year 2018) is used throughout; any USA catalog otherwise.
    const kats = d.models
      .filter((m) => m.market === "USA")
      .flatMap((m) => m.catalogs.map((c) => c.kat));
    const kat = kats.includes(849) ? 849 : kats[0];
    if (kat) usa = await d.catalog("USA", kat);
  }, 120_000);

  it("reads the vehicle index, languages and texts", () => {
    expect(d.models.length).toBeGreaterThan(100);
    expect(d.markets).toContain("RDW");
    expect(d.languages.map((l) => l.code)).toContain("EN");
    expect(Object.keys(d.hgNames).length).toBeGreaterThan(5);
  });

  it("decodes a catalog into illustrations and part rows", () => {
    expect(usa).not.toBeNull();
    const c = usa!;
    expect(c.plates.length).toBeGreaterThan(100);
    expect(c.plates.reduce((a, p) => a + p.rows.filter((r) => r.AC).length, 0)).toBeGreaterThan(
      1000,
    );
    expect(plateTitle(c.plates[0]).title).not.toBe("");
  });

  it("decodes an illustration with hotspots", async () => {
    const plate = usa!.plates.find((p) => p.graphic)!;
    const bilder = await d.brandDir!.dir("Bilder");
    const f = await (await bilder!.dir(plate.graphic.slice(0, 3)))!.file(`${plate.graphic}.tif`);
    const img = parseTiff(new Uint8Array(await f!.arrayBuffer()));
    expect(img.width).toBeGreaterThan(500);
    expect(img.bits.some((b) => b !== 0)).toBe(true);
    expect(img.hotspots.length).toBeGreaterThan(0);
  });

  it("decodes a graphic navigation picture with labels", async () => {
    const groups = navGroups(await navRefs(usa!.kat));
    if (!groups.length) return;
    const pic = await navPicture(groups[0].ref, "2");
    expect(pic).not.toBeNull();
    expect(pic!.labels.length).toBeGreaterThan(5);
  });

  it("looks up the part master, PR texts and where-used", async () => {
    const pn = usa!.plates
      .flatMap((p) => p.rows)
      .find((r) => r.AC && /^[0-9A-Z]{3}\d{6}/.test(r.AC))!.AC as string;
    const master = await Parts.master(pn);
    expect(master?.A0.trimEnd()).toBe(pn.trimEnd());
    expect((await PR.load()).code.size).toBeGreaterThan(1000);
    expect((await WhereUsed.candidates(pn, "USA")).length).toBeGreaterThan(0);
  });

  it("applies illustration conditions from vehicle data", async () => {
    if (usa?.kat !== 849) return;
    const prInfo = await PR.load();
    const codes = ["KS1", "9VS", "KA6", "8T8", "GP1", "3NT", "4A4"];
    const pr = Object.fromEntries(codes.map((c) => [prInfo.code.get(c)!.family, c]));
    const f: VehicleData = { mkb: "", gkb: "", pr, hide: false, sticker: null };
    // Illustrations tagged with the graphic-navigation area "Rear seats".
    const rearSeats = usa.plates.filter((p) =>
      p.nav.some((id) => d.text(id).replace(/\n/g, " ") === "Rear seats"),
    );
    expect(rearSeats.length).toBe(14);
    const fitting = rearSeats
      .filter((p) => plateFits(p, { f, prInfo, active: true }))
      .map(plateLabel);
    expect(fitting).toEqual(["857-70", "857-72", "885-25", "885-75", "885-81", "885-86", "963-10"]);
  });

  it("decodes a VIN to its catalog", async () => {
    const v = await decodeVin("ZZZZZZF41JA000500", "USA", d.models);
    expect(v.years).toEqual([2018]);
    expect(v.hits.map((h) => h.cat.kat)).toContain(849);
  });
});
