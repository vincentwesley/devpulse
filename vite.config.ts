// @ts-expect-error no @types/node in this repo; build-time only
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Emit the service worker with a per-build id so old caches are dropped on activate.
const emitSw = {
  name: "emit-sw",
  generateBundle(this: { emitFile(f: { type: "asset"; fileName: string; source: string }): void }) {
    const src = readFileSync("src/web/sw.js", "utf8");
    this.emitFile({ type: "asset", fileName: "sw.js", source: src.replaceAll("__BUILD__", String(Date.now())) });
  },
};

export default defineConfig({
  plugins: [emitSw],
  build: { outDir: "dist", emptyOutDir: true },
  // "cloudflare:email" only exists in workerd: unit tests get a recording stub.
  test: { include: ["tests/unit/**/*.test.ts"], alias: { "cloudflare:email": "/tests/unit/_email.ts" } },
});
