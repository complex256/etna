// End-to-end tests against a real dump: `DUMP=/path/to/dump/<brand> vpr e2e` (or `make e2e`). The dev
// server opens that dump on start, so no folder picker is involved.
import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}/`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.DUMP
    ? {
        command: `vp dev --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        env: { DUMP: process.env.DUMP },
      }
    : undefined,
});
