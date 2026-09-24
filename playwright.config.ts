// Browser tests. tests/e2e/demo.spec.ts uses the built-in demo; viewer.spec.ts needs a real dump:
// `DUMP=/path/to/dump/<brand> vpr e2e` (or `make e2e`), which the dev server opens on start.
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
  // The dev server opens DUMP when it is set; the demo tests need no dump.
  webServer: {
    command: `vp dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    env: process.env.DUMP ? { DUMP: process.env.DUMP } : {},
  },
});
