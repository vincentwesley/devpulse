import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Page shell: header, banners, skip link, skeletons, retry, PWA files.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
const loaded = (page: Page) => expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
async function mock(page: Page, opts: { fail?: () => boolean; delay?: number; over?: Record<string, unknown> } = {}) {
  await page.route("**/api/*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (opts.fail?.()) return route.fulfill({ status: 500, body: "boom" });
    return route.fulfill({ json: opts.over?.[name] ?? bodies[name] });
  });
}

test("header verdict, stale + token banners, palette button", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#verdict")).toContainText(/needs? attention/);
  await expect(page.locator("#banner")).toBeHidden();
  await page.getByRole("button", { name: /Command palette/ }).click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
});

test("banner: stale data and token expiry from stats.health", async ({ page }) => {
  const since = new Date(Date.now() - 3 * 36e5).toISOString();
  await mock(page, { over: { stats: { ...stats, health: { stale: true, since, tokenDaysLeft: 5 } } } });
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#banner")).toBeVisible();
  await expect(page.locator("#banner")).toContainText(/stale since 3 hr/);
  await expect(page.locator("#banner")).toContainText("GitHub token expires in 5 days");
});

test("banner: expired token", async ({ page }) => {
  await mock(page, { over: { stats: { ...stats, health: { stale: false, tokenDaysLeft: 0 } } } });
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#banner")).toContainText("GitHub token has expired");
  await expect(page.locator("#banner")).not.toContainText("stale");
});

test("offline banner follows connectivity", async ({ page, context }) => {
  await mock(page);
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#offline")).toBeHidden();
  await context.setOffline(true);
  await expect(page.locator("#offline")).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator("#offline")).toBeHidden();
});
test("skip link is first tab stop and targets main", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await loaded(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("skeleton while loading, then content; aria-busy cleared", async ({ page }) => {
  await mock(page, { delay: 600 });
  await page.goto("/");
  await expect(page.locator("#posts")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#posts .skel")).toBeVisible();
  await expect(page.locator("#posts .empty")).toHaveCount(0);
  await loaded(page);
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.locator("#posts")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".skel")).toHaveCount(0);
});

test("error shows Retry, retry recovers", async ({ page }) => {
  let broken = true;
  await mock(page, { fail: () => broken });
  await page.goto("/");
  await loaded(page);
  const retry = page.locator("#posts").getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  broken = false;
  await retry.click();
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.locator("#posts").getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("updated line shows age from stats.syncedAt", async ({ page }) => {
  await mock(page, { over: { stats: { ...stats, syncedAt: new Date(Date.now() - 5 * 6e4).toISOString() } } });
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#updated")).toHaveText(/Updated [45]m ago/);
});

test("375px: no overflow, hero tiles wrap (no carousel), no overflow", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const hero = page.locator("#tile-totals .tot");
  expect(await hero.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true); // nothing scrolls off-screen
});

test("theme: toggle updates theme-color and persists before paint", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await loaded(page);
  await page.click("#theme");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#eef7f1");
  await page.reload({ waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("PWA files are served from the build", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const j = await m.json();
  expect(j.icons.map((i: { sizes: string }) => i.sizes)).toContain("512x512");
  for (const p of ["/sw.js", "/theme-init.js", "/og.png", "/favicon.svg", "/icon-192.png", "/icon-maskable-512.png", "/apple-touch-icon.png"]) {
    expect((await request.get(p)).ok(), p).toBe(true);
  }
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).not.toContain("__BUILD__"); // stamped by the build
});

test.describe("service worker", () => {
  test.use({ serviceWorkers: "allow" });
  test("registers and activates", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await loaded(page);
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(true);
  });
});


