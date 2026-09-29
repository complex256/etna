// Opening a dump hosted as static files: the demo catalog behind a stand-in web server that
// supports HEAD and Range requests, described by its etna.json.
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { buildDemoFiles } from "../../src/demo";
import { Dump, findBrands, setDump } from "../../src/lib/dump";
import { parseTiff } from "../../src/lib/format/tiff";
import { dumpUrl, MemoryDir, RemoteDir } from "../../src/lib/fs";
import { buildManifest, MANIFEST_NAME } from "../../src/lib/manifest";
import { Parts } from "../../src/lib/tables";

const BASE = "https://files.example.test/dumps/PQ/";

describe("hosted dump", () => {
  const requests: string[] = [];
  let files: Map<string, Uint8Array>;

  beforeAll(async () => {
    files = await buildDemoFiles();
    const manifest = JSON.stringify(await buildManifest(MemoryDir.from(files)));
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = String(input);
      const range = new Headers(init?.headers).get("range");
      requests.push(
        `${init?.method ?? "GET"} ${url.slice(BASE.length)}${range ? ` ${range}` : ""}`,
      );
      if (!url.startsWith(BASE)) return new Response(null, { status: 404 });
      const rel = decodeURIComponent(url.slice(BASE.length));
      if (rel === MANIFEST_NAME) return new Response(manifest);
      const body = files.get(`PQ/${rel}`);
      if (!body) return new Response(null, { status: 404, statusText: "Not Found" });
      const headers = { "content-length": String(body.length) };
      if (init?.method === "HEAD") return new Response(null, { headers });
      const m = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
      if (m)
        return new Response(body.slice(+m[1], +m[2] + 1) as Uint8Array<ArrayBuffer>, {
          status: 206,
        });
      return new Response(body as Uint8Array<ArrayBuffer>, { headers });
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("turns links into folder URLs", () => {
    expect(dumpUrl("https://host/a/AU")).toBe("https://host/a/AU/");
    expect(dumpUrl(" ipfs://bafyExample/AU ")).toBe("https://ipfs.io/ipfs/bafyExample/AU/");
    expect(() => dumpUrl("ftp://nope")).toThrow("https://");
  });

  it("opens the dump and reads it over HTTP", async () => {
    const root = await RemoteDir.open(BASE);
    const brands = await findBrands(root);
    expect(brands.map((b) => [b.name, b.data.name])).toEqual([["PQ", "Data1"]]);
    const d = new Dump(brands[0].name, brands[0].brandDir, brands[0].data);
    await d.init();
    await d.setLanguage("EN");
    setDump(d);
    expect(d.model("RDW", "PQC")?.name).toBe("Pipsqueak Coupe");
    const cat = await d.catalog("RDW", 1);
    expect(cat.plates).toHaveLength(11);

    // Image folders are not listed: files there are found by name with a HEAD request.
    const g = cat.plates[5].graphic;
    const tif = await (await (await d.brandDir!.dir("Bilder"))!.dir("PQ0"))!.file(`${g}.tif`);
    expect(requests).toContain(`HEAD Bilder/PQ0/${g}.tif`);
    expect(parseTiff(new Uint8Array(await tif!.arrayBuffer())).hotspots).toHaveLength(4);
    expect(await (await d.brandDir!.dir("Bilder"))!.file("missing.tif")).toBeNull();

    // Keyed tables read the definition, a page of the index and the record: three requests.
    requests.length = 0;
    expect(d.text((await Parts.master("PQ0302011"))!.A1)).toBe("rear wheel");
    expect(requests.map((r) => r.replace(/\d+-\d+$/, "…"))).toEqual([
      "GET Data1/stamm.fdt",
      "GET Data1/stamm.pnt bytes=…",
      "GET Data1/STAMM.BIN bytes=…",
    ]);
  });

  it("explains a missing manifest", async () => {
    await expect(RemoteDir.open("https://elsewhere.example.test/x/")).rejects.toThrow(
      "make manifest",
    );
  });
});
