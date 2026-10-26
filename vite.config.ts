// @ts-expect-error no @types/node in this repo; build-time only
import { createHash } from "node:crypto";
// @ts-expect-error no @types/node in this repo; build-time only
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Emit the service worker with a per-build id so old caches are dropped on activate.
const emitSw = {
  name: "emit-sw",
  generateBundle(this: { emitFile(f: { type: "asset"; fileName: string; source: string }): void }) {
    const src = readFileSync("src/web/sw.js", "utf8");
    this.emitFile({ type: "asset", fileName: "sw.js", source: src.replaceAll("__BUILD__", String(Date.now())) });
  },
};

// The inline theme script in index.html is allowed by hash: computed from the built HTML so it can never drift.
const cspHash = {
  name: "csp-hash",
  apply: "build" as const,
  closeBundle() {
    const m = readFileSync("dist/index.html", "utf8").match(/<script>([\s\S]*?)<\/script>/);
    if (!m) throw new Error("csp-hash: no inline script in dist/index.html");
    const headers = readFileSync("dist/_headers", "utf8");
    if (!headers.includes("__THEME_HASH__")) throw new Error("csp-hash: placeholder missing in dist/_headers");
    writeFileSync("dist/_headers", headers.replace("__THEME_HASH__", `sha256-${createHash("sha256").update(m[1]).digest("base64")}`));
  },
};

export default defineConfig({
  plugins: [emitSw, cspHash],
  build: { outDir: "dist", emptyOutDir: true },
  // "cloudflare:email" only exists in workerd: unit tests get a recording stub.
  test: { include: ["tests/unit/**/*.test.ts"], alias: { "cloudflare:email": "/tests/unit/_email.ts" } },
});
