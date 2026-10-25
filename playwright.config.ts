import { defineConfig } from "@playwright/test";

// Dedicated port (4173 collides with other previews). axe on ~1k nodes takes 10-30 s on a busy machine, hence the long timeout.
const PORT = 4391;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 2,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: { command: `npm run build && npx vite preview --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
