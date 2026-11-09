import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://localhost:5173/", trace: "retain-on-failure" },
  webServer: { command: "npx vite --port 5173 --strictPort", url: "http://localhost:5173/", reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 820 } } },
  ],
});
