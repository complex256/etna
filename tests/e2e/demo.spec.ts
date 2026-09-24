// Browses the built-in demo catalog: needs no dump, so it also runs in CI.
import { expect, test, type Page } from "@playwright/test";

const VIN = "ETNZZZPC1RA000042";

async function openDemo(page: Page) {
  await page.goto("/?nodump#/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.locator(".bar .brand small")).toContainText("PQ");
}
/** The demo, then a page of it (the demo lives in the tab, so it is opened first). */
async function demoAt(page: Page, hash: string) {
  await openDemo(page);
  await page.evaluate((h) => (location.hash = h), hash);
}

test("demo: vehicle to illustration, hotspots, part details and parts list", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: /Pipsqueak Coupe/ }).click();
  await page.getByRole("row", { name: /2025 1 PC1/ }).click();
  await expect(page.locator(".pane-head h1")).toHaveText("Pipsqueak Coupe");
  await page.getByRole("tab", { name: /Wheels/ }).click();
  await page.getByRole("row", { name: /302-01/ }).click();
  await expect(page.locator(".note-bar")).toContainText("Tighten the hub caps");
  await page.locator(".hot:not(.nomatch)").first().click();
  await expect(page.locator("tr.part.hit")).toContainText("rear wheel");
  await page
    .locator("tr.part.hit")
    .getByRole("button", { name: "PQ0 302 011", exact: true })
    .click();
  const drawer = page.getByRole("complementary", { name: "Part details" });
  await expect(drawer).toContainText("Puncture-proof");
  await drawer.getByRole("button", { name: "Add to parts list" }).click();
  await expect(page.getByRole("button", { name: "Parts list (1)" })).toBeVisible();
});

test("demo: graphic navigation with gallery and hover preview", async ({ page }) => {
  await demoAt(page, "#/RDW/catalog/1/graphic/2?model=PQC&year=2025");
  await expect(page.getByRole("tab")).toHaveText(["View 2"]);
  await page
    .locator(".pin", { hasText: /^Wheels$/ })
    .first()
    .click();
  await expect(page.locator(".nav-list-head")).toContainText("Wheels 2 illustrations");
  await page.getByRole("button", { name: "Gallery view" }).click();
  await page.locator(".gallery-tile .thumb-box").first().hover();
  await expect(page.getByRole("tooltip").locator("canvas")).toBeVisible();
});

test("demo: vehicle data rules out illustrations; equipment shows a retrofit", async ({ page }) => {
  await demoAt(page, "#/RDW/catalog/1?model=PQC&year=2025");
  await page.getByRole("button", { name: "Vehicle data" }).click();
  const dialog = page.getByRole("dialog", { name: "Vehicle data" });
  await dialog.getByLabel("Add PR codes").pressSequentially("RD1 HN1 RF0 PS0 TP0 LT1 ");
  await expect(dialog.locator(".sticker-note")).toContainText("6 of 6 codes affect this catalog");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Vehicle data (6)" })).toBeVisible();
  await page.getByRole("tab", { name: /Doors and roof/ }).click();
  await expect(page.getByRole("row", { name: /202-01/ })).toHaveClass(/nomatch/);

  await page.getByRole("button", { name: "Equipment" }).click();
  await page.getByRole("button", { name: /PS1 With push handle/ }).click();
  const need = page.locator(".equip-section").first();
  await expect(need).toContainText(
    "Parts you would need for PS1 (3 part numbers, 1 illustrations)",
  );
  await expect(need).toContainText("handle bracket");
});

test("demo: search by VIN, part number and engine code", async ({ page }) => {
  await demoAt(page, "#/RDW?model=PQC");
  const box = page.getByRole("combobox", { name: "Search parts or VIN" });
  await box.fill(VIN);
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Model year2024");
  await expect(page.getByRole("row", { name: /Pipsqueak Coupe 2024 1/ })).toBeVisible();
  await box.fill("PQ0401021");
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Replaced by");
  await box.fill("LEG2");
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Engine code LEG2");
});

test("demo: garage keeps a vehicle", async ({ page }) => {
  await demoAt(page, "#/RDW/catalog/1?model=PQC&year=2025");
  await page.getByRole("button", { name: "Vehicle data" }).click();
  const dialog = page.getByRole("dialog", { name: "Vehicle data" });
  await dialog.getByLabel("Add PR codes").pressSequentially("PK1 TP1 ");
  await dialog.getByLabel("Name in the garage").fill("Pink one");
  await dialog.getByRole("button", { name: "Save to garage" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Garage (1)" }).click();
  await expect(page.locator("table.garage")).toContainText("Pink one");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("button", { name: "Vehicle data (2)" })).toBeVisible();
});
