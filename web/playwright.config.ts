import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4199",
    headless: true,
  },
  // webServer disabled: use already-running preview on 4199
});
