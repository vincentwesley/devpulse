import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Bento strip: Featured, Pulse, Contributions, Totals, Languages.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
const empties: Record<string, unknown> = { projects: [], heatmap: { days: [] }, stats: {}, languages: { all: [] } };
const TILES = ["featured", "pulse", "contrib", "totals", "langs"];
async function open(page: Page, over: Record<string, unknown> = {}, fail: string[] = []) {
  await page.unroute("**/api/*").catch(() => {});
  await page.route("**/api/*", (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop()!;
    if (fail.includes(name)) return r.fulfill({ status: 500, body: "boom" });
    return r.fulfill({ json: over[name] ?? bodies[name] ?? [] });
  });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}
const box = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!;
const rows = projects as Record<string, unknown>[];

test("featured: name, links, languages, status", async ({ page }) => {
  await open(page);
  const f = page.locator("#tile-featured");
  await expect(f.locator("h3")).toHaveCount(1);
  await expect(f.locator("a", { hasText: "View project" })).toHaveAttribute("href", /^\/p\//);
  await expect(f.locator("a", { hasText: "Repo" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(f.locator(".ft__media")).toBeVisible();
  await expect(f.locator(".ft__langs li").first()).toBeVisible();
  await expect(f.locator(".dp-status")).toBeVisible();
});

test("featured: a broken cover falls back to the generated tile", async ({ page }) => {
  await page.route("**/img/nope", (r) => r.fulfill({ status: 500, body: "x" }));
  await open(page, { projects: rows.map((p, i) => ({ ...p, featured: i === 0, cover: "/img/nope" })) });
  await expect(page.locator("#tile-featured .ft__tile")).toBeVisible();
  await expect(page.locator("#tile-featured img")).toHaveCount(0);
});

test("featured: a good cover is eager, high priority, with reserved size", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.route("**/img/ok", (r) => r.fulfill({ contentType: "image/png", body: png }));
  await open(page, { projects: rows.map((p, i) => ({ ...p, featured: i === 0, cover: "/img/ok" })) });
  const img = page.locator("#tile-featured img");
  await expect(img).toHaveAttribute("loading", "eager");
  await expect(img).toHaveAttribute("fetchpriority", "high");
  await expect(img).toHaveAttribute("width", "1200");
});

test("pulse: one cell per repo, summary, readout, navigate on select", async ({ page }) => {
  await open(page);
  const cells = page.locator("#tile-pulse .pulse__cell");
  await expect(cells).toHaveCount(rows.length);
  await expect(page.locator("#tile-pulse .pulse__sum")).toContainText(/\d+ ok · \d+ need attention/);
  for (const c of await cells.all()) {
    const b = await box(c);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await cells.first().focus();
  await expect(page.locator("#tile-pulse .tile-readout")).toContainText(/CI|no CI/);
  await expect(page.locator("#tile-pulse .tile-readout")).toHaveAttribute("aria-live", "polite");
  await page.keyboard.press("ArrowRight");
  await expect(cells.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\//);
});

test("pulse: attention state has a name and a glyph, not just colour", async ({ page }) => {
  await open(page, { projects: rows.map((p, i) => (i === 0 ? { ...p, ciState: "FAILURE" } : p)) });
  const c = page.locator("#tile-pulse .pulse__cell[data-s='attn']").first();
  await expect(c).toHaveAttribute("aria-label", /needs attention/);
  const glyph = await c.locator(".pulse__pix").evaluate((e) => getComputedStyle(e, "::before").content);
  expect(glyph).toContain("▲");
});

test("contrib: 26 weeks on phones, toggle label follows state, readout, streaks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const cells = page.locator("#tile-contrib .heat rect");
  expect(await cells.count()).toBeLessThanOrEqual(26 * 7);
  expect(await page.locator("#tile-contrib .heat-wrap").evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  const toggle = page.locator("#tile-contrib .heat-toggle");
  await expect(toggle).toHaveText("Full year");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveText("Last 26 weeks");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(cells).toHaveCount(365);
  await cells.last().focus();
  await expect(page.locator("#tile-contrib .tile-readout").first()).toContainText(/contributions? · \d+ \w+/);
  await expect(page.locator("#tile-contrib .ct__streaks")).toContainText("12 days");
  await expect(page.locator("#tile-contrib .ct__streaks")).toContainText("40 days");
  await toggle.click();
  await expect(toggle).toHaveText("Full year");
});

test("contrib: desktop defaults to the full year and toggles to 26 weeks", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await expect(page.locator("#tile-contrib .heat rect")).toHaveCount(365);
  const toggle = page.locator("#tile-contrib .heat-toggle");
  await expect(toggle).toHaveText("Last 26 weeks");
  await toggle.click();
  expect(await page.locator("#tile-contrib .heat rect").count()).toBeLessThanOrEqual(26 * 7);
});

test("contrib: year view fades on its scrollable edges only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  await page.locator("#tile-contrib .heat-toggle").click();
  const wrap = page.locator("#tile-contrib .heat-wrap");
  await expect(wrap).toHaveAttribute("data-fade-l", "");
  await wrap.evaluate((e) => { e.scrollLeft = 0; });
  await expect(wrap).toHaveAttribute("data-fade-r", "");
  await expect(wrap).not.toHaveAttribute("data-fade-l", "");
});

test("contrib: weekday columns are >= 44px wide at 390 and read out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const g = page.locator("#tile-contrib .wk-col");
  await expect(g).toHaveCount(7);
  for (const l of await g.all()) expect((await box(l)).width).toBeGreaterThanOrEqual(43.5);
  await g.nth(2).focus();
  await expect(page.locator("#tile-contrib .ct__wk .tile-readout")).toContainText("Tue: 14 commits");
});

test("contrib: still renders when stats fail (no streaks)", async ({ page }) => {
  await open(page, {}, ["stats"]);
  await expect(page.locator("#tile-contrib .heat rect").first()).toBeVisible();
  await expect(page.locator("#tile-contrib .ct__streaks")).toHaveCount(0);
});

test("totals: compact numbers, then hidden zero and approx markers", async ({ page }) => {
  await open(page);
  const t = page.locator("#tile-totals");
  await expect(t).toContainText("Repos");
  await expect(t.locator(".tot__v").nth(1)).toHaveText("3.5K");
  await expect(t).toContainText("123.5K");
  await expect(t).toContainText("812");
  await open(page, { stats: { ...stats, approx: true, totals: { repos: 21, commits: 3456, loc: 0 } } });
  await expect(page.locator("#tile-totals")).not.toContainText("Lines");
  await expect(page.locator("#tile-totals .tot__v").nth(0)).toHaveText("21+");
  await expect(page.locator("#tile-totals .tot__v").nth(1)).toHaveText("≈3.5K");
});

test("totals: most active repo shows when present", async ({ page }) => {
  await open(page, { stats: { ...stats, mostActive30d: { repo: "vincentwesley/alpha", name: "alpha", commits: 42 } } });
  await expect(page.locator("#tile-totals")).toContainText("alpha 42 commits");
  await expect(page.locator("#tile-totals a")).toHaveAttribute("href", "https://github.com/vincentwesley/alpha");
});

test("languages: stacked bar, top-five legend, bad colour falls back", async ({ page }) => {
  await open(page);
  await expect(page.locator("#tile-langs .lang__bar")).toHaveAttribute("aria-label", /TypeScript 55%/);
  await expect(page.locator("#tile-langs .lang__bar")).toHaveAttribute("role", "img");
  await expect(page.locator("#tile-langs .lang__legend li")).toHaveCount(4);
  await expect(page.locator("#tile-langs .lang__seg").nth(3)).toHaveCSS("background-color", /rgb/);
  const many = { all: Array.from({ length: 8 }, (_, i) => ({ lang: `L${i}`, bytes: 1, color: "#112233", pct: 12.5 })) };
  await open(page, { languages: many });
  await expect(page.locator("#tile-langs .lang__legend li")).toHaveCount(5);
  await expect(page.locator("#tile-langs .lang__seg")).toHaveCount(8);
});

test("empty and error states for every tile", async ({ page }) => {
  await open(page, empties);
  for (const t of TILES) {
    await expect(page.locator(`#tile-${t} .empty`)).toContainText("no data yet");
    await expect(page.locator(`#tile-${t}`)).not.toHaveAttribute("aria-busy", "true");
  }
  await open(page, {}, ["projects", "heatmap", "stats", "languages"]);
  for (const t of TILES) await expect(page.locator(`#tile-${t} .empty`)).toContainText("couldn't load");
});

test("layout: tiles differ in size on desktop; 2-column mobile, Featured and Pulse full width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const f = await box(page.locator("#tile-featured")), p = await box(page.locator("#tile-pulse")), l = await box(page.locator("#tile-langs"));
  expect(f.height).toBeGreaterThan(p.height);
  expect(l.width).toBeLessThan(p.width);
  await page.setViewportSize({ width: 390, height: 800 });
  const m = { f: await box(page.locator("#tile-featured")), p: await box(page.locator("#tile-pulse")), t: await box(page.locator("#tile-totals")), g: await box(page.locator("#tile-langs")) };
  expect(m.f.width).toBeGreaterThan(330);
  expect(m.p.width).toBeGreaterThan(330);
  expect(m.t.width).toBeLessThan(200);
  expect(Math.abs(m.t.y - m.g.y)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("375: no horizontal overflow from the bento strip", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reduced motion: totals are static and final", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("#tile-totals .tot__v").nth(1)).toHaveText("3.5K");
});

for (const theme of ["dark", "light"] as const) {
  for (const w of [390, 1280]) {
    test(`axe bento ${theme} ${w}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width: w, height: 900 });
      await open(page);
      const r = await new AxeBuilder({ page }).include("#bento").analyze();
      expect(r.violations).toEqual([]);
    });
  }
}
