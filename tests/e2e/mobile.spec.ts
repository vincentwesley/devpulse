import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Mobile density, tap targets, hero grid, heatmap hints, empty states.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
async function open(page: Page, url = "/", over: Record<string, unknown> = {}) {
  await page.route("**/api/*", (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop()!;
    return r.fulfill({ json: over[name] ?? bodies[name] ?? [] });
  });
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}
const box = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!;

test("390: ledger rows are compact two-liners >= 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  for (const row of await page.locator(".proj").all()) {
    const b = await box(row);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeLessThan(100);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("390: commit links are >= 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  for (const l of await page.locator("#activity .act__msg").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(43.5);
});

test("desktop: topic chip hit area extends to 44px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/p/Alpha");
  const chip = page.locator("#detail-pane .hub-topic").first();
  await chip.evaluate((e) => e.scrollIntoView({ block: "center" })); // clear of the sticky header
  await expect.poll(async () => { // layout may still settle (fonts, images) right after load
    const b = await box(chip);
    return chip.evaluate((e, p) => document.elementFromPoint(p.x, p.y) === e, { x: b.x + b.width / 2, y: b.y + b.height + 4 });
  }).toBe(true);
});

test("posts: section hidden when empty, shown when there are posts", async ({ page }) => {
  await open(page, "/", { posts: [] });
  await expect(page.locator("#posts")).toBeHidden();
  await page.unroute("**/api/*");
  await open(page);
  await expect(page.locator("#posts")).toBeVisible();
  await expect(page.locator("#posts a")).toHaveText("Hello world");
});

test("posts: an API error still shows the section with couldn't load", async ({ page }) => {
  await page.route("**/api/*", (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop()!;
    return name === "posts" ? r.fulfill({ status: 500, body: "boom" }) : r.fulfill({ json: bodies[name] ?? [] });
  });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
  await expect(page.locator("#posts .empty")).toContainText("couldn't load");
});

test("project page: real commits, 'no commits yet', and the daily-collection hint", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, "/p/Alpha");
  await expect(page.locator("#pp")).toContainText("Fix thing");
  await expect(page.locator("#pp")).not.toContainText("no data yet");
  await page.goto("/p/Gamma");
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
  await expect(page.locator("#pp")).toContainText("no commits yet");
  await expect(page.locator("#pp")).toContainText("collecting data — updates daily");
});

