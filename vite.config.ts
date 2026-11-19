// @ts-ignore no @types/node in the app types (puppeteer pulls them in transitively); build-time only
import { createHash } from "node:crypto";
// @ts-ignore no @types/node in the app types (puppeteer pulls them in transitively); build-time only
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

// Every page's inline theme script is allowed by hash: computed from the built HTML so it can never drift. Each page must have one.
const PAGES = ["dist/index.html", "dist/dev/index.html"];
const cspHash = {
  name: "csp-hash",
  apply: "build" as const,
  closeBundle() {
    const hashes = new Set(PAGES.map((f) => {
      const m = readFileSync(f, "utf8").match(/<script>([\s\S]*?)<\/script>/);
      if (!m) throw new Error(`csp-hash: no inline script in ${f}`);
      return `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`;
    }));
    const headers = readFileSync("dist/_headers", "utf8");
    if (!headers.includes("'__THEME_HASH__'")) throw new Error("csp-hash: placeholder missing in dist/_headers");
    writeFileSync("dist/_headers", headers.replace("'__THEME_HASH__'", [...hashes].join(" ")));
  },
};

// Dev server / preview have no Worker: route the client-side paths to their page, as the Worker and assets binding do in production.
//   /dev, /dev/p/<name> -> dev/index.html; /p/<name> -> index.html.
type Mw = { use(f: (req: { url?: string }, res: unknown, next: () => void) => void): void };
const pages = {
  name: "pages",
  configureServer(s: { middlewares: Mw }) { s.middlewares.use(rewrite); },
  configurePreviewServer(s: { middlewares: Mw }) { s.middlewares.use(rewrite); },
};
function rewrite(req: { url?: string }, _res: unknown, next: () => void) {
  const [path, q = ""] = (req.url ?? "/").split("?");
  const qs = q ? `?${q}` : "";
  if (path === "/dev" || /^\/dev\/p\/[^/]+\/?$/.test(path)) req.url = `/dev/index.html${qs}`;
  else if (/^\/p\/[^/]+\/?$/.test(path)) req.url = `/index.html${qs}`;
  next();
}

export default defineConfig({
  plugins: [emitSw, cspHash, pages],
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: { hub: "index.html", dev: "dev/index.html" } } },
  // "cloudflare:email" only exists in workerd: unit tests get a recording stub.
  test: { include: ["tests/unit/**/*.test.ts"], alias: { "cloudflare:email": "/tests/unit/_email.ts" } },
});
