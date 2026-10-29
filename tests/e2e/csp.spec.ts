// @ts-ignore no @types/node in the app types
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import projects from "./fixtures/projects.json" with { type: "json" };
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };

// vite preview ignores public/_headers, so parse it and inject the same CSP on the document.
let csp = "";
test.beforeAll(async ({ request }) => {
  csp = (await (await request.get("/_headers")).text()).match(/Content-Security-Policy:\s*(.+)/)![1].trim();
});
const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status: { sites: [], incidents: [] } };

test("_headers CSP: no unsafe-inline in style-src or script-src", () => {
  expect(csp).toMatch(/style-src 'self'(;|$)/);
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
});

test("_headers allows exactly the inline theme script in index.html by sha256 (no drift, no external theme-init.js)", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const inline = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
  expect(inline).toHaveLength(1);
  expect(csp).toContain(`'sha256-${createHash("sha256").update(inline[0][1]).digest("base64")}'`);
  expect(csp).not.toContain("__THEME_HASH__");
  expect(html).not.toContain("theme-init.js");
});

test("page, service worker registration, project dialog and palette raise no CSP / Trusted Types violations", async ({ page }) => {
  const bad: string[] = [];
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI + " | " + e.sample + " @ " + e.sourceFile + ":" + e.lineNumber)));
  page.on("console", (m) => { if (/CSPV|Content Security Policy|Trusted Type/i.test(m.text())) bad.push(m.text()); });
  page.on("pageerror", (e) => { if (/Trusted Type|Content Security/i.test(e.message)) bad.push(e.message); });
  await page.route("**/api/*", (r) => r.fulfill({ json: bodies[new URL(r.request().url()).pathname.split("/").pop()!] ?? [] }));
  await page.route("**/", async (r) => {
    if (r.request().resourceType() !== "document") return r.fallback();
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
  });
  await page.goto("/");
  await expect(page.locator(".proj")).not.toHaveCount(0);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => { location.hash = "#p/Alpha"; });
  await expect(page.locator("#detail-pane")).toContainText("Alpha");
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail-pane")).toBeHidden();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); // /sw.js registered through the devpulse Trusted Types policy
  expect(bad).toEqual([]);
  // credits fireflies kept their per-element vars via CSS
  expect(await page.locator(".creator__fx i").first().evaluate((e) => getComputedStyle(e).getPropertyValue("--x").trim())).toBe("30%");
});
