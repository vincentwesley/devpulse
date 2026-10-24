import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

test.use({ colorScheme: "light", serviceWorkers: "block" }); // page.route cannot see SW traffic

type Mode = "full" | "empty" | "fail";
const bodies = { projects, heatmap, commits, posts, stats, languages, status };
const empties = { projects: [], heatmap: { days: [] }, commits: [], posts: [], stats: {}, languages: { all: [] }, status: { sites: [], incidents: [] } };

async function mock(page: Page, mode: Mode) {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() as keyof typeof bodies;
    if (mode === "fail") return route.fulfill({ status: 500, body: "boom" });
    return route.fulfill({ json: mode === "empty" ? empties[name] : bodies[name] });
  });
}
const SECTIONS = ["hero", "projects", "status", "heatmap", "activity", "languages", "posts"];
const loaded = (page: Page) => expect(page.locator("body")).toHaveAttribute("data-loaded", "1");

test("populated state", async ({ page }) => {
  await mock(page, "full");
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".proj")).toHaveCount(4);
  await expect(page.locator(".proj h3 a").first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".proj").first()).toContainText("99.87%");
  await expect(page.locator(".proj").first()).toContainText("Best 72 needs work");
  await expect(page.locator(".proj").first()).toContainText("SEO 40 poor");
  await expect(page.locator(".proj").nth(1)).toContainText("Beta <b>x</b>"); // escaped, not parsed
  await expect(page.locator(".proj", { hasText: "NoSite" })).toContainText("no live site");
  await expect(page.locator(".proj", { hasText: "NoSite" }).locator("h3 a")).toHaveAttribute("href", "https://github.com/vincentwesley/nosite");
  await expect(page.locator(".proj").nth(1)).toContainText("Lighthouse: no data yet");
  await expect(page.locator(".proj").nth(3)).toContainText("no data yet");
  await expect(page.locator(".heat rect")).toHaveCount(365);
  await expect(page.locator("#activity")).toContainText("Fix thing");
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.locator(".creator")).toBeVisible();
  await expect(page.locator("#hero")).toContainText("lines changed (est.)");
  await expect(page.locator("#hero .hero__num").nth(1)).toHaveText("3.5K");
  await expect(page.locator("#hero .hero__num").nth(3)).toHaveText("12");
  await expect(page.locator("#languages .lang__bar")).toHaveAttribute("aria-label", /TypeScript 55%/);
  await expect(page.locator("#languages .lang__legend li")).toHaveCount(4);
  await expect(page.locator("#languages .lang__seg").nth(3)).toHaveCSS("background-color", /rgb/); // null colour falls back to accent
});

test("empty state", async ({ page }) => {
  await mock(page, "empty");
  await page.goto("/");
  await loaded(page);
  for (const id of SECTIONS) await expect(page.locator(`#${id} .empty`)).toContainText("no data yet");
});

test("API failure state", async ({ page }) => {
  await mock(page, "fail");
  await page.goto("/");
  await loaded(page);
  for (const id of SECTIONS) await expect(page.locator(`#${id} .empty`)).toContainText("couldn't load");
  await expect(page.locator(".creator")).toBeVisible();
});

test("theme toggle persists", async ({ page }) => {
  await mock(page, "full");
  await page.goto("/");
  await page.click("#theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("no horizontal scroll at 375px", async ({ page }) => {
  await mock(page, "full");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const theme of ["dark", "light"]) {
  for (const mode of ["full", "empty", "fail"] as Mode[]) {
    test(`axe ${theme} ${mode}`, async ({ page }) => {
      await mock(page, mode);
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto("/");
      await loaded(page);
      await page.locator(".creator").scrollIntoViewIfNeeded();
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations).toEqual([]);
    });
  }
}

for (const theme of ["dark", "light"]) {
  for (const w of [375, 1280]) {
    test(`screenshot ${w} ${theme}`, async ({ page }) => {
      test.skip(!process.env.SHOTS, "set SHOTS=1");
      await mock(page, "full");
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/");
      await loaded(page);
      await page.screenshot({ path: `docs/screens/m1-${w}-${theme}.png`, fullPage: true });
    });
  }
}

test("project hub: cards, spotlight, sort and filter", async ({ page }) => {
  await mock(page, "full");
  await page.goto("/");
  await loaded(page);
  const first = page.locator(".proj").first();
  await expect(first).toContainText("Alpha <i>tool</i> for testing"); // escaped
  await expect(first.locator(".hub-topic")).toHaveCount(2);
  await expect(first).toContainText("v1.2.0");
  await expect(first).toContainText("12,345");
  await expect(first).toContainText("7 stars");
  await expect(first.locator("[title='2026-10-18']")).toContainText("updated");
  await expect(first.locator(".hub-langbar span").nth(1)).toHaveCSS("background-color", /rgb/); // bad colour -> accent
  await expect(first.locator("a", { hasText: "Live" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(page.locator(".proj", { hasText: "NoSite" })).toContainText("pending"); // ciState fallback
  await expect(page.locator(".hub-spot")).toContainText("Alpha");
  await expect(page.locator(".hub-spot")).toContainText("Fix thing");
  await page.locator(".hub-filters summary").click();
  await page.locator(".hub-bar select").nth(0).selectOption("stars");
  await expect(page.locator(".proj h3").first()).toContainText("Beta");
  await page.locator(".hub-bar select").nth(0).selectOption("name");
  await expect(page.locator(".proj h3").first()).toContainText("Alpha");
  await page.locator(".hub-bar select").nth(1).selectOption("TypeScript");
  await expect(page.locator(".proj")).toHaveCount(2);
  await page.locator(".hub-bar select").nth(2).selectOption("up");
  await expect(page.locator(".proj")).toHaveCount(1);
  await page.locator(".hub-bar select").nth(2).selectOption("down");
  await expect(page.locator("#projects")).toContainText("no projects match");
});

for (const theme of ["dark", "light"]) {
  test(`detail dialog ${theme}: open, content, axe, Esc`, async ({ page }) => {
    await mock(page, "full");
    await page.emulateMedia({ reducedMotion: "reduce" }); // no slide-in mid-axe
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto("/");
    await loaded(page);
    const opener = page.getByRole("button", { name: "Details for Beta <b>x</b>" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("Beta only");
    await expect(dlg).not.toContainText("Fix thing");
    await expect(dlg.locator(".hub-chart rect.add, .hub-chart rect.del")).toHaveCount(52);
    await expect(dlg).toContainText("Go 100.0%");
    await expect(dlg.locator(".hub-snippet").first()).toHaveText(`![status](${new URL(page.url()).origin}/badge/Beta%20%3Cb%3Ex%3C%2Fb%3E.svg)`);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("status section: strips, readout, incidents", async ({ page }) => {
  await mock(page, "full");
  await page.goto("/");
  await loaded(page);
  const alpha = page.locator("#status .st__site").first();
  await expect(alpha.locator(".st__bar")).toHaveCount(90);
  await expect(alpha).toContainText("99.9% uptime");
  await expect(alpha.locator(".st__pill")).toContainText("Up");
  await expect(page.locator("#status .st__site").nth(1).locator(".st__pill")).toContainText("Down");
  await alpha.locator(".st__bar").nth(40).focus();
  await expect(alpha.locator(".readout")).toContainText("(90/96 checks)");
  await page.keyboard.press("ArrowRight");
  await expect(alpha.locator(".readout")).toContainText("100% (96/96 checks)");
  await expect(page.locator("#status .st__inc")).toContainText("HTTP 503");
  await expect(page.locator("#status .st__inc")).toContainText("ongoing");
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(alpha.locator(".st__bar")).toHaveCount(30);
});

test("status: no incidents empty state", async ({ page }) => {
  await mock(page, "full");
  await page.route("**/api/status", (r) => r.fulfill({ json: { ...status, incidents: [] } }));
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#status .st__inc")).toContainText("no incidents in 90 days");
});

test("heatmap: 26 weeks on mobile, toggle, readout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mock(page, "full");
  await page.goto("/");
  await loaded(page);
  const cells = page.locator("#heatmap .heat rect");
  expect(await cells.count()).toBeLessThanOrEqual(26 * 7);
  expect(await page.locator("#heatmap .heat-wrap").evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  const toggle = page.getByRole("button", { name: "Full year" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(cells).toHaveCount(365);
  await cells.last().focus();
  await expect(page.locator("#heatmap .readout").first()).toContainText(/contributions? · \d+ \w+ \d{4}/);
});

test("activity: show more", async ({ page }) => {
  const many = Array.from({ length: 14 }, (_, i) => ({ repo: "alpha", sha: `abcdef${i}`, message: `Commit ${i}`, author: "v", ts: new Date(Date.parse("2026-10-08T10:00:00Z") - i * 36e5 * 7).toISOString(), url: "https://github.com/o/alpha/commit/x" }));
  await mock(page, "full");
  await page.route("**/api/commits", (r) => r.fulfill({ json: many }));
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#activity .act li")).toHaveCount(10);
  await page.getByRole("button", { name: /Show more/ }).click();
  await expect(page.locator("#activity .act li")).toHaveCount(14);
});

test("reduced motion keeps content visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mock(page, "full");
  await page.goto("/");
  await loaded(page);
  await expect(page.locator("#activity .act li").first()).toHaveCSS("opacity", "1");
  await expect(page.locator("#hero .hero__num").nth(1)).toHaveText("3.5K");
});
