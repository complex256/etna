// The demo catalog: a made-up ride-on toy car, the "Pipsqueak Coupe", written in the same formats
// as a real dump (see ./writer.ts), so the whole viewer runs on it. Built on demand in the browser.
import * as draw from "./drawings";
import { packBits, Raster, thumbnail } from "./raster";
import {
  writeNumIndex,
  writePng,
  writePnt,
  writeTable,
  writeTiff,
  writeZgd,
  type FieldSpec,
  type Row,
  type TableSpec,
} from "./writer";

export const DEMO_BRAND = "PQ";
/** A VIN the demo's chassis ranges decode (type PC, model year 2024). */
export const DEMO_VIN = "ETNZZZPC1RA000042";

/* ---------------- texts ---------------- */

class Texts {
  private ids = new Map<string, number>();
  private next = 10001;
  id(s: string) {
    let id = this.ids.get(s);
    if (!id) {
      id = this.next++;
      this.ids.set(s, id);
    }
    return id;
  }
  entries() {
    return [...this.ids].map(([text, id]) => ({ id, text }));
  }
}

/* ---------------- catalog content ---------------- */

interface Part {
  pos: string;
  pn: string;
  text: string;
  qty?: string;
  remark?: string;
  /** Model data, one line each. */
  model?: string[];
  pr?: string[];
  /** Built from / up to, YYMM. */
  from?: number;
  to?: number;
}
interface PlateSpec {
  hgug: string;
  no: string;
  title: string;
  remark?: string;
  /** The illustration's own condition (header model data). */
  model?: string[];
  nav: string[];
  parts: Part[];
  draw(r: Raster, co: (label: string, at: [number, number], to: [number, number]) => void): void;
}

const pn = (hgug: string, n: string, suffix = "") => `PQ0${hgug}${n}${suffix}`;
const colours = (
  base: Omit<Part, "pn" | "pr" | "model">,
  hgug: string,
  n: string,
  names: [string, string, string],
): Part[] =>
  (["RD1", "PK1", "BL1"] as const).map((code, i) => ({
    ...base,
    pn: pn(hgug, n + String(i + 1)),
    text: `${base.text} ${names[i]}`,
    pr: [code],
    model: [`PR:${code}`],
  }));

const PLATES: PlateSpec[] = [
  {
    hgug: "101",
    no: "01",
    title: "Body shell",
    nav: ["Body shell"],
    parts: [
      ...colours({ pos: "1", text: "body shell", qty: "1" }, "101", "01", ["red", "pink", "blue"]),
      { pos: "2", pn: pn("101", "021"), text: "fuel cap (pretend)", qty: "1" },
      { pos: "3", pn: pn("101", "031"), text: "self-tapping screw 4x16", qty: "8" },
      { pos: "4", pn: pn("101", "041"), text: "cup holder", qty: "1", remark: "on the rear shelf" },
    ],
    draw(r, co) {
      draw.bodyShell(r, 640, 500);
      draw.fuelCap(r, 1130, 250);
      draw.screw(r, 300, 800);
      draw.screw(r, 380, 800);
      draw.cupHolder(r, 1120, 760);
      co("1", [470, 180], [560, 330]);
      co("2", [1280, 170], [1150, 240]);
      co("3", [190, 760], [290, 800]);
      co("4", [1280, 680], [1160, 730]);
    },
  },
  {
    hgug: "101",
    no: "10",
    title: "Bumpers and lights",
    nav: ["Lights", "Body shell"],
    parts: [
      { pos: "1", pn: pn("101", "101"), text: "front bumper", qty: "1" },
      { pos: "2", pn: pn("101", "111"), text: "rear bumper", qty: "1" },
      {
        pos: "3",
        pn: pn("101", "121"),
        text: "headlight, clicking",
        qty: "2",
        pr: ["LT1"],
        model: ["PR:LT1"],
      },
      {
        pos: "3",
        pn: pn("101", "122"),
        text: "headlight sticker",
        qty: "2",
        pr: ["LT0"],
        model: ["PR:LT0"],
      },
      { pos: "4", pn: pn("101", "031"), text: "self-tapping screw 4x16", qty: "4" },
    ],
    draw(r, co) {
      draw.bumper(r, 700, 280, 760);
      draw.bumper(r, 700, 700, 620);
      draw.headlight(r, 330, 490);
      draw.headlight(r, 1070, 490);
      draw.screw(r, 1230, 800);
      co("1", [700, 150], [700, 258]);
      co("2", [700, 860], [700, 722]);
      co("3", [520, 490], [372, 490]);
      co("4", [1330, 740], [1245, 800]);
    },
  },
  {
    hgug: "201",
    no: "01",
    title: "Doors",
    nav: ["Doors", "Body shell"],
    parts: [
      { pos: "1", pn: pn("201", "011"), text: "door, left", qty: "1" },
      { pos: "2", pn: pn("201", "012"), text: "door, right", qty: "1" },
      { pos: "3", pn: pn("201", "021"), text: "hinge pin", qty: "4" },
      { pos: "4", pn: pn("201", "031"), text: "door latch", qty: "2", remark: "gentle click" },
    ],
    draw(r, co) {
      draw.door(r, 420, 470);
      draw.door(r, 980, 470, true);
      draw.pin(r, 650, 280);
      draw.pin(r, 750, 280);
      draw.latch(r, 690, 780);
      co("1", [230, 260], [360, 400]);
      co("2", [1170, 260], [1040, 400]);
      co("3", [700, 120], [705, 240]);
      co("4", [880, 860], [740, 790]);
    },
  },
  {
    hgug: "202",
    no: "01",
    title: "Roof and pillars",
    remark: "Not on open-top cars",
    model: ["PR:RF1"],
    nav: ["Roof", "Body shell"],
    parts: [
      ...colours({ pos: "1", text: "roof", qty: "1" }, "202", "01", [
        "yellow",
        "lilac",
        "white",
      ]).map((p) => ({ ...p, pr: [...p.pr!, "RF1"], model: [`${p.model![0]}+RF1`] })),
      { pos: "2", pn: pn("202", "021"), text: "front pillar", qty: "2", pr: ["RF1"] },
      { pos: "3", pn: pn("202", "031"), text: "rear pillar", qty: "2", pr: ["RF1"] },
      { pos: "4", pn: pn("101", "031"), text: "self-tapping screw 4x16", qty: "8" },
    ],
    draw(r, co) {
      draw.roof(r, 700, 330);
      for (const x of [420, 580]) draw.pillar(r, x, 690, 260);
      for (const x of [820, 980]) draw.pillar(r, x, 690, 260);
      draw.screw(r, 1220, 800);
      co("1", [700, 130], [700, 245]);
      co("2", [300, 560], [406, 620]);
      co("3", [1110, 560], [994, 620]);
      co("4", [1330, 740], [1235, 800]);
    },
  },
  {
    hgug: "301",
    no: "01",
    title: "Front casters",
    nav: ["Wheels"],
    parts: [
      { pos: "1", pn: pn("301", "011"), text: "caster wheel, complete", qty: "2" },
      { pos: "2", pn: pn("301", "021"), text: "caster bolt", qty: "2" },
    ],
    draw(r, co) {
      draw.caster(r, 460, 460);
      draw.caster(r, 940, 460);
      draw.screw(r, 700, 780);
      co("1", [700, 280], [520, 420]);
      co("2", [860, 860], [715, 800]);
    },
  },
  {
    hgug: "302",
    no: "01",
    title: "Rear wheels and axle",
    nav: ["Wheels"],
    parts: [
      { pos: "1", pn: pn("302", "011"), text: "rear wheel", qty: "2", remark: "puncture-proof" },
      { pos: "2", pn: pn("302", "021"), text: "rear axle", qty: "1" },
      { pos: "3", pn: pn("302", "031"), text: "hub cap", qty: "2" },
      { pos: "4", pn: pn("302", "041"), text: "axle cap", qty: "2" },
    ],
    draw(r, co) {
      draw.wheel(r, 330, 520, 190);
      draw.wheel(r, 1070, 520, 190);
      draw.axle(r, 700, 520, 440);
      draw.hubcap(r, 330, 160, 70);
      draw.hubcap(r, 1070, 160, 70);
      draw.plug(r, 700, 800);
      co("1", [150, 820], [300, 690]);
      co("2", [700, 400], [700, 510]);
      co("3", [520, 130], [400, 150]);
      co("4", [860, 860], [715, 810]);
    },
  },
  {
    hgug: "401",
    no: "01",
    title: "Steering wheel and horn",
    nav: ["Steering"],
    parts: [
      { pos: "1", pn: pn("401", "011"), text: "steering wheel", qty: "1" },
      {
        pos: "2",
        pn: pn("401", "021", "A"),
        text: "horn button, squeaky",
        qty: "1",
        pr: ["HN1"],
        model: ["PR:HN1"],
        remark: "squeakier since 03/24",
        from: 2403,
      },
      {
        pos: "2",
        pn: pn("401", "022"),
        text: "horn cover, plain",
        qty: "1",
        pr: ["HN0"],
        model: ["PR:HN0"],
      },
      { pos: "3", pn: pn("401", "031"), text: "steering column", qty: "1" },
      { pos: "4", pn: pn("401", "041"), text: "ignition key (toy)", qty: "1" },
      { pos: "5", pn: pn("101", "031"), text: "self-tapping screw 4x16", qty: "1" },
    ],
    draw(r, co) {
      draw.steeringWheel(r, 560, 360, 200);
      draw.hornButton(r, 1060, 300, true);
      draw.column(r, 560, 780, 300);
      draw.toyKey(r, 1060, 700);
      draw.screw(r, 250, 780);
      co("1", [230, 210], [380, 300]);
      co("2", [1240, 190], [1090, 280]);
      co("3", [760, 820], [580, 800]);
      co("4", [1250, 820], [1110, 710]);
      co("5", [130, 700], [240, 775]);
    },
  },
  {
    hgug: "501",
    no: "01",
    title: "Seat and floor",
    nav: ["Seat"],
    parts: [
      { pos: "1", pn: pn("501", "011"), text: "bench seat", qty: "1" },
      {
        pos: "2",
        pn: pn("501", "021"),
        text: "floorboard, removable",
        qty: "1",
        remark: "remove for foot power",
      },
      { pos: "3", pn: pn("501", "031"), text: "floor plug", qty: "2" },
    ],
    draw(r, co) {
      draw.seat(r, 480, 420);
      draw.floorboard(r, 820, 760);
      draw.plug(r, 1140, 380);
      draw.plug(r, 1230, 380);
      co("1", [300, 170], [380, 280]);
      co("2", [1180, 880], [960, 780]);
      co("3", [1190, 230], [1180, 360]);
    },
  },
  {
    hgug: "502",
    no: "01",
    title: "Push handle",
    remark: "For grown-ups",
    model: ["PR:PS1"],
    nav: ["Push handle"],
    parts: [
      { pos: "1", pn: pn("502", "011"), text: "push handle", qty: "1", pr: ["PS1"] },
      { pos: "2", pn: pn("502", "021"), text: "handle grip", qty: "1", pr: ["PS1"] },
      { pos: "3", pn: pn("502", "031"), text: "handle bracket", qty: "2", pr: ["PS1"] },
      { pos: "4", pn: pn("101", "031"), text: "self-tapping screw 4x16", qty: "4" },
    ],
    draw(r, co) {
      draw.pushHandle(r, 700, 450);
      draw.grip(r, 1140, 180);
      draw.bracket(r, 380, 790);
      draw.bracket(r, 1020, 790);
      draw.screw(r, 700, 800);
      co("1", [420, 250], [590, 380]);
      co("2", [1300, 300], [1200, 200]);
      co("3", [230, 700], [340, 760]);
      co("4", [860, 880], [715, 820]);
    },
  },
  {
    hgug: "601",
    no: "01",
    title: "Decals",
    nav: ["Decals", "Body shell"],
    parts: colours({ pos: "1", text: "decal set", qty: "1" }, "601", "01", [
      "classic",
      "pink",
      "police",
    ]),
    draw(r, co) {
      draw.decalSheet(r, 450, 470, false);
      draw.decalSheet(r, 970, 470, true);
      co("1", [700, 230], [600, 370]);
    },
  },
  {
    hgug: "602",
    no: "01",
    title: "Toy phone",
    model: ["PR:TP1"],
    nav: ["Toy phone"],
    parts: [
      { pos: "1", pn: pn("602", "011"), text: "clip-on toy phone", qty: "1", pr: ["TP1"] },
      { pos: "2", pn: pn("602", "021"), text: "phone clip", qty: "1", pr: ["TP1"] },
      { pos: "3", pn: pn("602", "031"), text: "button cell (toy)", qty: "2", pr: ["TP1"] },
    ],
    draw(r, co) {
      draw.phone(r, 480, 470);
      draw.clip(r, 920, 400);
      draw.buttonCell(r, 920, 720);
      co("1", [280, 250], [430, 380]);
      co("2", [1110, 300], [960, 380]);
      co("3", [1110, 820], [950, 730]);
    },
  },
];

const MAIN_GROUPS: [string, string][] = [
  ["1", "Body"],
  ["2", "Doors and roof"],
  ["3", "Wheels"],
  ["4", "Steering"],
  ["5", "Interior"],
  ["6", "Accessories"],
];

// Equipment families and codes.
const FAMILIES: [string, string, [string, string][]][] = [
  [
    "COL",
    "Body colour",
    [
      ["RD1", "Red body, yellow roof"],
      ["PK1", "Pink body, lilac roof"],
      ["BL1", "Blue body, white roof (police)"],
    ],
  ],
  [
    "HRN",
    "Horn",
    [
      ["HN0", "Without horn"],
      ["HN1", "Squeaky horn"],
    ],
  ],
  [
    "ROF",
    "Roof",
    [
      ["RF0", "Without roof (open top)"],
      ["RF1", "Fixed roof"],
    ],
  ],
  [
    "PSH",
    "Push handle",
    [
      ["PS0", "Without push handle"],
      ["PS1", "With push handle for grown-ups"],
    ],
  ],
  [
    "TEL",
    "Toy phone",
    [
      ["TP0", "Without toy phone"],
      ["TP1", "With clip-on toy phone"],
    ],
  ],
  [
    "LIT",
    "Headlights",
    [
      ["LT0", "Headlight stickers"],
      ["LT1", "Clicking headlights"],
    ],
  ],
];

// Graphic navigation: label positions on the picture.
const NAV_LABELS: [string, number, number][] = [
  ["Body shell", 1010, 530],
  ["Roof", 800, 200],
  ["Doors", 640, 640],
  ["Seat", 780, 560],
  ["Steering", 910, 430],
  ["Wheels", 510, 710],
  ["Wheels", 1010, 710],
  ["Lights", 1190, 570],
  ["Push handle", 220, 300],
  ["Decals", 755, 700],
  ["Toy phone", 985, 480],
];

/* ---------------- table layouts ---------------- */

const fix = (name: string, size: number, list = false): FieldSpec => ({
  name,
  type: "fix",
  size,
  list,
});
const str = (name: string, list = false): FieldSpec => ({ name, type: "str", list });
const int = (name: string, list = false): FieldSpec => ({ name, type: "int", list });

const OVERVIEW: TableSpec = {
  fields: [
    str("AA"),
    str("BA"),
    int("CA"),
    int("DA"),
    str("EA"),
    str("EB"),
    int("FA"),
    int("GA"),
    str("IA", true),
    str("JA", true),
    str("KA", true),
    str("LA"),
  ],
};
const KATALOG: TableSpec = {
  fields: [
    fix("AA", 6),
    str("CA"),
    str("OA"),
    str("CB"),
    int("OB", true),
    str("AD"),
    str("AE"),
    fix("AC", 14),
    str("C0", true),
    str("HG", true),
    str("C3", true),
    int("DA", true),
    int("DB", true),
    int("DC", true),
    str("DD", true),
    str("DE", true),
    str("DF", true),
    str("DG", true),
    int("BA"),
    int("BB"),
  ],
};
const TEXTS: TableSpec = { fields: [int("AA"), str("AD", true)] };
const PRSTAM: TableSpec = { fields: [fix("A0", 3), fix("A1", 3), str("A2")] };
const PRFAM: TableSpec = { fields: [fix("A1", 3), str("A2")] };
const STAMM: TableSpec = {
  keys: ["A0"],
  fields: [
    fix("A0", 14),
    int("A1"),
    int("A3"),
    { name: "B0", type: "str", group: [fix("B1", 14), str("B2"), int("B3")] },
  ],
};
const PRICES: TableSpec = {
  keys: ["A0"],
  fields: [fix("A0", 14), int("A1"), int("A2"), str("A3")],
};
const NOTES: TableSpec = {
  keys: ["A0", "A1"],
  flat: true,
  fields: [fix("A0", 15), fix("A1", 1), str("A2", true)],
};
const VB: TableSpec = { fields: [int("AA"), str("AB"), int("AF"), int("AG"), int("AI")] };
const VC: TableSpec = { fields: [int("AA"), str("AB"), str("AF")] };
const VA: TableSpec = { fields: [int("AA"), str("AB"), str("AC"), str("AD"), str("AE")] };
const VG: TableSpec = {
  fields: [
    int("AA"),
    str("AB"),
    int("AC"),
    int("AD"),
    int("AE"),
    str("AF"),
    str("AG"),
    str("AH"),
    str("AI"),
    int("AJ"),
    str("AK"),
  ],
};
const VF: TableSpec = {
  fields: [int("AA"), int("AB"), str("AC"), str("AD"), int("AE"), str("AF"), str("AG")],
};
const LACKE: TableSpec = { fields: [fix("AB", 14), str("AC"), str("AE"), str("AF")] };
const VH: TableSpec = { fields: [int("AA"), str("AC"), int("AD"), str("AE"), str("AF")] };
const NAVREF: TableSpec = { fields: [int("AA"), str("AB"), str("AC"), str("AD", true)] };
const RNR: TableSpec = { flat: true, fields: [int("A0"), int("A2", true)] };
const TSXREF: TableSpec = { flat: true, fields: [int("AA"), int("BA"), int("CA", true)] };
const MKB: TableSpec = {
  flat: true,
  fields: [
    str("A1"),
    int("A2"),
    int("A3"),
    int("A4"),
    str("A5"),
    str("A6"),
    int("B3"),
    { name: "B0", type: "str", group: [str("B1"), str("B2")] },
  ],
};
const GKB: TableSpec = {
  flat: true,
  fields: [
    str("A1"),
    str("A2"),
    str("A5"),
    str("A6"),
    { name: "B0", type: "str", group: [str("B1"), str("B2")] },
  ],
};

/* ---------------- build ---------------- */

export type DemoFiles = Map<string, Uint8Array>;

const KAT = 1;
const plateKey = (p: PlateSpec) => (p.hgug + p.no).padEnd(6);
const graphicOf = (p: PlateSpec) => `PQ0${p.hgug}${p.no}`;
const ascii = (s: string) => new TextEncoder().encode(s);
/** The A0 key of a keyed table row (always a string here). */
const keyOf = (r: Row) => r.A0 as string;

/** Every file of the demo dump, by path (brand folder PQ). */
export async function buildDemoFiles(): Promise<DemoFiles> {
  const files: DemoFiles = new Map();
  const put = (path: string, data: Uint8Array) => files.set(`${DEMO_BRAND}/${path}`, data);
  const table = (dir: string, fdtName: string, binName: string, spec: TableSpec, rows: Row[]) => {
    const t = writeTable(spec, rows, binName);
    put(`${dir}/${fdtName}`, t.fdt);
    put(`${dir}/${binName}`, t.bin);
    return t;
  };
  const texts = new Texts();
  const tx = (s: string) => texts.id(s);

  // Vehicle index: the same model in two markets, one catalog for two model years.
  const overview: Row[] = [];
  for (const market of ["RDW", "USA"]) {
    overview.push({
      AA: market,
      BA: "PQC",
      EA: "Pipsqueak Coupe",
      CA: 2022,
      EB: "Toyland",
      KA: ["A"],
    });
    for (const year of [2025, 2024])
      overview.push({
        CA: year,
        FA: KAT,
        JA: ["PC1"],
        IA: MAIN_GROUPS.map(([g]) => g),
        GA: 0,
        LA: market,
        KA: ["A"],
      });
  }
  table("Data1", "overview.fdt", "OVERVIEW.BIN", OVERVIEW, overview);
  put(
    "Data1/HGTEXT.E",
    ascii(MAIN_GROUPS.map(([g, name]) => `PQ ${g} ${name}`).join("\r\n") + "\r\n"),
  );
  put("Data1/MJ.TXT", ascii("2023 P\r\n2024 R\r\n2025 S\r\n"));

  // Catalog: each illustration record, then its header row and part rows.
  const navIds = new Map(NAV_LABELS.map(([name]) => [name, tx(name)]));
  const katRows: Row[] = [];
  const plateRow: number[] = [];
  for (const p of PLATES) {
    plateRow.push(katRows.length);
    katRows.push({
      AA: plateKey(p),
      CA: p.hgug,
      OA: graphicOf(p),
      OB: p.nav.map((n) => navIds.get(n)!),
    });
    katRows.push({
      AD: "U",
      DA: [tx(p.title)],
      DB: p.remark ? [tx(p.remark)] : undefined,
      DG: p.model,
    });
    for (const part of p.parts)
      katRows.push({
        AE: part.pos,
        AC: part.pn,
        DA: [tx(part.text)],
        DB: part.remark ? [tx(part.remark)] : undefined,
        DD: [part.qty ?? "1"],
        DG: part.model,
        C0: part.pr,
        BA: part.from,
        BB: part.to,
      });
  }
  const kat = table("Data1/R", "Kataloge.fdt", "KAT001.BIN", KATALOG, katRows);
  put(
    "Data1/R/KAT001.pnt",
    writePnt(
      PLATES.map((p, i) => ({ key: plateKey(p), offset: kat.offsets[plateRow[i]] })),
      6,
    ),
  );

  // Part master and prices, with one superseded part.
  const allParts = new Map<string, Part>();
  for (const p of PLATES) for (const part of p.parts) allParts.set(part.pn, part);
  const stammRows: Row[] = [...allParts.values()].map((part) => ({
    A0: part.pn,
    A1: tx(part.text),
    A3: 1032024,
  }));
  const oldHorn = pn("401", "021");
  stammRows.push({
    A0: oldHorn,
    A1: tx("horn button, squeaky"),
    A3: 28022024,
    B0: [{ B1: pn("401", "021", "A"), B2: "1", B3: tx("squeakier") }],
  });
  stammRows.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  const stamm = table("Data1", "stamm.fdt", "STAMM.BIN", STAMM, stammRows);
  put(
    "Data1/stamm.pnt",
    writePnt(
      stammRows.map((r, i) => ({ key: keyOf(r), offset: stamm.offsets[i] })),
      14,
    ),
  );
  let cents = 199;
  const priceRows: Row[] = stammRows.map((r) => ({
    A0: r.A0,
    A1: 20250101,
    A2: (cents = (cents * 7 + 350) % 4900) + 99,
    A3: "T1",
  }));
  const prices = table("Data1", "FPreis.fdt", "FPreis.bin", PRICES, priceRows);
  put(
    "Data1/FPreis.pnt",
    writePnt(
      priceRows.map((r, i) => ({ key: keyOf(r), offset: prices.offsets[i] })),
      14,
    ),
  );

  // Equipment codes and families.
  table(
    "Data1",
    "PRSTAME.fdt",
    "PRSTAME.BIN",
    PRSTAM,
    FAMILIES.flatMap(([fam, , codes]) => codes.map(([c, t]) => ({ A0: c, A1: fam, A2: t }))),
  );
  table(
    "Data1",
    "PRFAME.fdt",
    "PRFAME.BIN",
    PRFAM,
    FAMILIES.map(([fam, name]) => ({ A1: fam, A2: name })),
  );

  // Engine ("two little legs") and gearbox ("a grown-up pushing"), model codes, paint.
  table("Data1/R", "vb.fdt", "VB.BIN", VB, [{ AA: KAT, AB: "LEG2", AI: 2 }]);
  table("Data1/R", "vc.fdt", "VC.BIN", VC, [{ AA: KAT, AB: "PSH", AF: "push, one grown-up" }]);
  table("Data1/R", "va.fdt", "VA.BIN", VA, [
    { AA: KAT, AB: "PC1RA1", AC: "Pipsqueak Coupe classic", AD: "202208", AE: "" },
    { AA: KAT, AB: "PC1RB1", AC: "Pipsqueak Coupe police", AD: "202301", AE: "" },
  ]);
  table("Data1/R", "mkb4.fdt", "MKB4.BIN", MKB, [
    { A1: "LEG2", A5: "0822", A6: "", B3: 2, B0: [{ B1: "Pipsqueak", B2: "Coupe" }] },
  ]);
  table("Data1/R", "gkb.fdt", "GKB.BIN", GKB, [
    {
      A1: "PSH",
      A2: "push, one grown-up",
      A5: "0822",
      A6: "",
      B0: [{ B1: "Pipsqueak", B2: "Coupe" }],
    },
  ]);
  // Code, paint number (shown as L + number), colour.
  const paints: [string, string, string][] = [
    ["R1", "Q1R", "Racing red"],
    ["P1", "Q1P", "Bubblegum pink"],
    ["B1", "Q1B", "Patrol blue"],
    ["Y1", "Q1Y", "Sunshine yellow"],
  ];
  table(
    "Data1/R",
    "vg.fdt",
    "VG.BIN",
    VG,
    paints.map(([code, num, name]) => ({ AA: KAT, AB: "1", AC: tx(name), AF: code, AG: num })),
  );
  table(
    "Data1/R",
    "Lacke.fdt",
    "LACKE.BIN",
    LACKE,
    paints.map(([, num], i) => ({
      AB: pn("900", String(11 + i).padStart(3, "0")),
      AC: num,
      AE: "20 ml",
      AF: "PEN",
    })),
  );
  table("Data1/R", "vf.fdt", "VF.BIN", VF, [
    { AA: KAT, AB: tx("Seat"), AC: "GR", AE: tx("Graphite"), AF: "cloth" },
    { AA: KAT, AB: tx("Seat"), AC: "BK", AE: tx("Liquorice black"), AF: "vinyl" },
  ]);

  // VIN: chassis ranges per model year.
  table("Data1/R", "vh.fdt", "VH.BIN", VH, [
    { AA: KAT, AD: 2024, AE: "20230801", AF: "PC-R-000001" },
    { AA: KAT, AD: 2025, AE: "20240801", AF: "PC-S-000001" },
  ]);

  // A service note on one illustration and one part.
  const noteRows: Row[] = [
    {
      A0: `B${String(KAT).padStart(3, "0")}30201`,
      A1: "E",
      A2: [
        "Tighten the hub caps by hand only. They are meant to come off",
        "for cleaning, not for racing.",
      ],
    },
    {
      A0: `T${pn("302", "011").padEnd(14)}`,
      A1: "E",
      A2: ["Puncture-proof: no pump required, whatever the owner says."],
    },
  ];
  const notes = table("Data1/R", "notiz.fdt", "NOTIZ.BIN", NOTES, noteRows);
  put(
    "Data1/R/notiz.pnt",
    writePnt(
      noteRows.map((r, i) => ({
        key: keyOf(r).padEnd(15) + (r.A1 as string),
        offset: notes.offsets[i],
      })),
      16,
    ),
  );

  // Where-used and description cross-reference.
  const rnr = new Map<number, Set<number>>();
  const xref = new Map<number, Set<number>>();
  for (const p of PLATES)
    for (const part of p.parts) {
      const m = /^PQ0(\d{3})(\d{3})/.exec(part.pn)!;
      const key = KAT * 1000 + +m[1];
      if (!rnr.has(key)) rnr.set(key, new Set());
      rnr.get(key)!.add(+m[2] * 100000 + +p.hgug * 100 + +p.no);
      const id = tx(part.text);
      if (!xref.has(id)) xref.set(id, new Set());
      xref.get(id)!.add(+p.hgug * 100 + +p.no);
    }
  table(
    "Data1/R",
    "rnr.fdt",
    "RNR.BIN",
    RNR,
    [...rnr].map(([A0, v]) => ({ A0, A2: [...v] })),
  );
  table(
    "Data1/R",
    "tsxref.fdt",
    "TSXREF.BIN",
    TSXREF,
    [...xref].map(([AA, v]) => ({ AA, BA: KAT, CA: [...v] })),
  );

  // Graphic navigation: one picture set, view 2.
  table("Data1", "10.fdt", "10.BIN", NAVREF, [{ AA: KAT, AB: "PC1", AC: "PQC", AD: [] }]);
  const nav = new Raster(1500, 950, 7);
  draw.navPicture(nav);
  put(
    "Categories/PQC2.zgd",
    await writeZgd(
      nav.w,
      nav.h,
      nav.px,
      NAV_LABELS.map(([name, x, y]) => ({ id: navIds.get(name)!, x, y })),
    ),
  );

  // Illustrations and thumbnails.
  for (const p of PLATES) {
    const r = new Raster(1400, 1000, 0);
    const co = draw.callouts(r);
    p.draw(r, co.add);
    const g = graphicOf(p);
    put(`Bilder/${g.slice(0, 3)}/${g}.tif`, writeTiff(r.w, r.h, packBits(r), co.hotspots));
    const t = thumbnail(r, 200, 150);
    put(`minis/${g.slice(0, 3)}/${g}.png`, await writePng(t.w, t.h, t.gray));
  }

  // Text dictionary (written last: every text above has its id by now).
  const textRows = texts.entries().sort((a, b) => a.id - b.id);
  const dict = table(
    "Data1",
    "06.fdt",
    "06_EN.BIN",
    TEXTS,
    textRows.map((t) => ({ AA: t.id, AD: [t.text] })),
  );
  put(
    "Data1/06_EN.pnt",
    writeNumIndex(textRows.map((t, i) => ({ key: t.id, offset: dict.offsets[i] }))),
  );
  return files;
}
