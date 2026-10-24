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

test("390: list cards are compact; Featured keeps its cover; actions >= 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const card = page.locator(".proj").first();
  await expect(card.locator("> .sc-media")).toBeHidden();
  await expect(page.locator("#featured .sc-card .sc-media").first()).toBeVisible();
  expect((await box(card)).height).toBeLessThan(430);
  for (const l of await card.locator(".hub-btn").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(44);
  for (const l of await page.locator(".proj h3 a, .proj .hub-topic").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(43.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("390: commit links and weekday bars are >= 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  for (const l of await page.locator("#activity .act__msg").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(43.5);
  const g = page.locator("#heatmap .wk g");
  await expect(g).toHaveCount(7);
  for (const l of await g.all()) expect((await box(l)).width).toBeGreaterThanOrEqual(43.5);
});

test("desktop: topic chip hit area extends to 44px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const chip = page.locator(".proj .hub-topic").first();
  await chip.evaluate((e) => e.scrollIntoView({ block: "center" })); // clear of the sticky header
  await expect.poll(async () => { // layout may still settle (fonts, images) right after load
    const b = await box(chip);
    return chip.evaluate((e, p) => document.elementFromPoint(p.x, p.y) === e, { x: b.x + b.width / 2, y: b.y + b.height + 4 });
  }).toBe(true);
});

for (const width of [360, 390]) {
  test(`${width}: hero tiles form a 2-column grid inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const tiles = await page.locator("#hero .hero__stat").all();
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    const xs = new Set<number>();
    for (const t of tiles) {
      const b = await box(t);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      xs.add(Math.round(b.x));
    }
    expect(xs.size).toBe(2);
    // "Contributions this year" is a bare number: no mid-word wrap
    const dd = page.locator("#heatmap .stats div", { hasText: "Contributions this year" }).locator("dd");
    await expect(dd).toHaveText("812");
    expect((await box(dd)).height).toBeLessThan(30);
  });
}

test("heatmap toggle label follows state; year view fades on its scrollable edges", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const toggle = page.locator("#heatmap .heat-toggle");
  await expect(toggle).toHaveText("Full year");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveText("Last 26 weeks");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const wrap = page.locator("#heatmap .heat-wrap");
  await expect(wrap).toHaveAttribute("data-fade-l", "");
  await wrap.evaluate((e) => { e.scrollLeft = 0; });
  await expect(wrap).toHaveAttribute("data-fade-r", "");
  await expect(wrap).not.toHaveAttribute("data-fade-l", "");
  await toggle.click();
  await expect(toggle).toHaveText("Full year");
});

test("posts: section and tab hidden when empty, shown when there are posts", async ({ page }) => {
  await open(page, "/", { posts: [] });
  await expect(page.locator("#posts")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Posts" })).toBeHidden();
  await page.unroute("**/api/*");
  await open(page);
  await expect(page.locator("#posts")).toBeVisible();
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Posts" })).toBeVisible();
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
  await open(page, "/p/Alpha");
  await expect(page.locator("#pp")).toContainText("Fix thing");
  await expect(page.locator("#pp")).not.toContainText("no data yet");
  await page.goto("/p/Gamma");
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
  await expect(page.locator("#pp")).toContainText("no commits yet");
  await expect(page.locator("#pp")).toContainText("collecting data — updates daily");
});
