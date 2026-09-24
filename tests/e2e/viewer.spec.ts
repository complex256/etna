// Browses a real dump the way a user would. Needs DUMP (see playwright.config.ts); most
// expectations use USA catalog 849 (model year 2018) of the dump this was written against.
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.DUMP, "set DUMP to a dump's brand folder");

const CATALOG = "#/USA/catalog/849?year=2018";

async function open(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await expect(page.locator(".bar .brand small")).not.toBeEmpty();
}

test("vehicle list to catalog to illustration and back", async ({ page }) => {
  await open(page, "#/USA");
  await page.locator(".list button").first().click();
  await page.locator(".pane tbody tr.link").first().click();
  await expect(page.locator(".pane-head .meta")).toContainText("Catalog");
  const rows = page.locator("table.plates tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator(".thumb-box img").first()).toBeVisible();

  const sixth = rows.nth(5);
  const key = await sixth.getAttribute("data-key");
  await sixth.click();
  await expect(page).toHaveURL(new RegExp(`/plate/${key}`));
  await expect(page.locator(".sheet canvas")).toBeVisible();
  await expect(page.locator("tr.part").first()).toBeVisible();

  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.locator("tr.returned")).toHaveAttribute("data-key", key!);
});

test("hotspots, part details and the parts list", async ({ page }) => {
  await open(page, "#/USA/catalog/849/plate/85771?year=2018");
  await page.locator(".hot:not(.nomatch)").first().click();
  await expect(page.locator("tr.part.hit").first()).toBeVisible();

  await page.locator("tr.part .pn").first().click();
  const drawer = page.getByRole("complementary", { name: "Part details" });
  await expect(drawer).toContainText("In catalog 849");
  await drawer.getByRole("button", { name: "Add to parts list" }).click();
  await expect(page.getByRole("button", { name: "Parts list (1)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".plate-head .t b")).toHaveText("857-72");

  await page.getByRole("button", { name: "Parts list (1)" }).click();
  await expect(page.getByRole("heading", { name: "Parts list" })).toBeVisible();
  await expect(page.locator("main tbody tr")).toHaveCount(1);
});

test("graphic navigation: list, gallery and hover preview", async ({ page }) => {
  await open(page, "#/USA/catalog/849/graphic/2?year=2018");
  await page.locator(".pin", { hasText: /^Rear seats$/ }).click();
  await expect(page.locator(".nav-list-head")).toContainText("14 illustrations");
  await expect(page.locator(".nav-list tr")).toHaveCount(14);

  await page.getByRole("button", { name: "Gallery view" }).click();
  await expect(page.locator(".gallery-tile")).toHaveCount(14);
  await page.locator(".gallery-tile .thumb-box").nth(1).hover();
  const preview = page.getByRole("tooltip");
  await expect(preview).toBeVisible();
  await expect(preview.locator("canvas")).toBeVisible();

  await page.locator(".gallery-tile").nth(1).click();
  await expect(page).toHaveURL(/\/plate\/85771/);
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page).toHaveURL(/\/graphic\/2/);
});

test("vehicle data rules out illustrations", async ({ page }) => {
  await open(page, CATALOG);
  await page.getByRole("button", { name: "Vehicle data" }).click();
  const dialog = page.getByRole("dialog", { name: "Vehicle data" });
  await dialog.getByLabel("Add PR codes").pressSequentially("KS1 9VS KA6 8T8 GP1 3NT 4A4 ");
  await dialog.getByRole("combobox", { name: "Type", exact: true }).fill("8WH 5NY");
  await expect(dialog.locator(".sticker-note")).toContainText("7 of 7 codes affect this catalog");
  // The type is recognised: its model description shows, without a warning.
  await expect(dialog.locator(".type-note")).toContainText("built");
  await expect(dialog.locator(".type-note")).not.toHaveClass(/warn/);
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Vehicle data (7)" })).toBeVisible();

  await page.getByRole("button", { name: "Graphic navigation" }).click();
  await page.locator(".pin", { hasText: /^Rear seats$/ }).click();
  await expect(page.locator(".nav-list-head")).toContainText(
    "7 of 14 illustrations fit your vehicle",
  );
});

test("search: VIN, part number and engine code", async ({ page }) => {
  await open(page, CATALOG);
  const box = page.getByRole("combobox", { name: "Search parts or VIN" });
  await box.fill("ZZZZZZF41JA000500");
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Model year2018");
  await expect(page.getByRole("row", { name: /2018 849/ }).first()).toBeVisible();

  await box.fill("8W0857805");
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Part master");

  await box.fill("CYMC");
  await box.press("Enter");
  await expect(page.locator(".search-pane")).toContainText("Engine code CYMC");
});

test("equipment page compares an option with the vehicle", async ({ page }) => {
  await open(page, "#/USA/catalog/849/equipment/KS1?year=2018");
  await expect(page.locator(".equip-head")).toContainText("Head-up display");
  await expect(page.locator(".equip-section-head").first()).toContainText(
    "Parts you would need for KS1",
  );
});

test("garage saves a vehicle and restores its data", async ({ page }) => {
  await open(page, CATALOG);
  await page.getByRole("button", { name: "Vehicle data" }).click();
  let dialog = page.getByRole("dialog", { name: "Vehicle data" });
  await dialog.getByLabel("Add PR codes").pressSequentially("KS1 9VS GP1 3NT ");
  await dialog.getByLabel("Name in the garage").fill("Test car");
  await dialog.getByRole("button", { name: "Save to garage" }).click();
  await expect(dialog.getByRole("button", { name: "Saved to garage" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Garage (1)" })).toBeVisible();

  // The data was saved, not applied: the catalog still has none.
  await expect(page.getByRole("button", { name: "Vehicle data", exact: true })).toBeVisible();

  // The dialog of any catalog can load it.
  await page.getByRole("button", { name: "Vehicle data", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Vehicle data" });
  await dialog.getByLabel("Load from garage").selectOption({ label: "Test car" });
  await expect(dialog.locator(".sticker-code")).toHaveText(["KS1", "9VS", "GP1", "3NT"]);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Opening it from the garage applies its data to its catalog.
  await page.getByRole("button", { name: "Garage (1)" }).click();
  await expect(page.getByRole("heading", { name: "Garage" })).toBeVisible();
  await expect(page.locator("table.garage tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/catalog\/849/);
  await expect(page.getByRole("button", { name: "Vehicle data (4)" })).toBeVisible();

  // Persisted in the browser: still there after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Garage (1)" })).toBeVisible();
});
