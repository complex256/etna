// README screenshots of the built-in demo catalog, in light and dark: `make screenshots`.
// Starts its own dev server, captures each page into docs/screenshots, and stops the server.
import { chromium, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 5197;
const BASE = `http://localhost:${PORT}/`;
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const server = spawn("vp", ["dev", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  env: { ...process.env, DUMP: "" },
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 100) throw new Error("dev server did not start");
  await new Promise((r) => setTimeout(r, 200));
}

// Vehicle data of a "red classic with a squeaky horn and no push handle".
const vehicle = {
  mkb: "LEG2",
  gkb: "PSH",
  hide: false,
  pr: { COL: "RD1", HRN: "HN1", ROF: "RF1", PSH: "PS0", TEL: "TP1", LIT: "LT1" },
  sticker: {
    vin: "ETNZZZPC1RA000042",
    type: "PC1 RA1",
    paint: "LQ1R",
    trim: "GR",
    codes: ["RD1", "HN1", "RF1", "PS0", "TP1", "LT1"],
  },
};

type Shot = {
  name: string;
  hash: string;
  vehicleData?: boolean;
  setup?: (page: Page) => Promise<void>;
};
const shots: Shot[] = [
  {
    name: "illustration",
    hash: "#/RDW/catalog/1/plate/40101?model=PQC&year=2025",
    vehicleData: true,
    async setup(page) {
      await page.locator(".sheet canvas").waitFor();
      await page.locator(".hot:not(.nomatch)").nth(1).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "graphic-navigation",
    hash: "#/RDW/catalog/1/graphic/2?model=PQC&year=2025",
    async setup(page) {
      await page.locator(".pin", { hasText: /^Body shell$/ }).click();
      await page.getByRole("button", { name: "Gallery view" }).click();
      await page.locator(".gallery-tile img").nth(4).waitFor();
      await page.waitForTimeout(800);
      await page.locator(".gallery-tile .thumb-box").nth(3).hover();
      await page.getByRole("tooltip").locator("canvas").waitFor();
    },
  },
  {
    name: "vehicle-data",
    hash: "#/RDW/catalog/1?model=PQC&year=2025",
    async setup(page) {
      await page.getByRole("button", { name: "Vehicle data" }).click();
      const dialog = page.getByRole("dialog", { name: "Vehicle data" });
      await dialog.locator('input[name="vin"]').fill("ETNZZZPC1RA000042");
      await dialog.getByRole("combobox", { name: "Type", exact: true }).fill("PC1 RA1");
      await dialog.locator('input[name="mkb"]').fill("LEG2");
      await dialog.locator('input[name="gkb"]').fill("PSH");
      await dialog.getByLabel("Add PR codes").pressSequentially("RD1 HN1 RF1 PS0 TP1 LT1 ");
      await dialog.getByLabel("Name in the garage").fill("Our coupe");
      await page.waitForTimeout(300);
    },
  },
  {
    name: "equipment",
    hash: "#/RDW/catalog/1/equipment/PS1?model=PQC&year=2025",
    vehicleData: true,
    async setup(page) {
      await page.locator(".equip-section-head").first().waitFor();
    },
  },
];

const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"] as const)
    for (const s of shots) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 860 },
        colorScheme: theme,
      });
      await ctx.addInitScript(
        ([t, v]) => {
          localStorage.setItem("etna.theme", t as string);
          localStorage.setItem("etna.navView", "gallery");
          if (v) localStorage.setItem("etna.filter.RDW:1", v as string);
        },
        [theme, s.vehicleData ? JSON.stringify(vehicle) : ""],
      );
      const page = await ctx.newPage();
      await page.goto(`${BASE}?nodump#/`);
      await page.getByRole("button", { name: "Try the demo" }).click();
      await page.locator(".bar .brand small").filter({ hasText: "PQ" }).waitFor();
      await page.evaluate((h) => (location.hash = h), s.hash);
      await s.setup?.(page);
      await page.mouse.move(0, 0).catch(() => {});
      if (s.name === "graphic-navigation")
        await page.locator(".gallery-tile .thumb-box").nth(3).hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${s.name}-${theme}.png` });
      await ctx.close();
      console.log(`${OUT}/${s.name}-${theme}.png`);
    }
} finally {
  await browser.close();
  server.kill();
}
