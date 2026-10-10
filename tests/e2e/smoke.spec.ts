import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };

test.use({ colorScheme: "light" });

type Mode = "full" | "empty" | "fail";
const bodies = { projects, heatmap, commits, posts };
const empties = { projects: [], heatmap: { days: [] }, commits: [], posts: [] };

async function mock(page: Page, mode: Mode) {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() as keyof typeof bodies;
    if (mode === "fail") return route.fulfill({ status: 500, body: "boom" });
    return route.fulfill({ json: mode === "empty" ? empties[name] : bodies[name] });
  });
}
const SECTIONS = ["projects", "heatmap", "commits", "posts"];
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
  await expect(page.locator(".proj", { hasText: "NoSite" })).toContainText("no site to monitor");
  await expect(page.locator(".proj", { hasText: "NoSite" }).locator("h3 a")).toHaveAttribute("href", "https://github.com/vincentwesley/nosite");
  await expect(page.locator(".proj").nth(1)).toContainText("Lighthouse: no data yet");
  await expect(page.locator(".proj").nth(2)).toContainText("no data yet");
  await expect(page.locator(".heat rect")).toHaveCount(365);
  await expect(page.locator("#commits a").first()).toHaveText("Fix thing");
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.locator(".creator")).toBeVisible();
});

test("empty state", async ({ page }) => {
  await mock(page, "empty");
  await page.goto("/");
  await loaded(page);
  for (const id of SECTIONS) await expect(page.locator(`#${id} .empty`)).toHaveText("no data yet");
});

test("API failure state", async ({ page }) => {
  await mock(page, "fail");
  await page.goto("/");
  await loaded(page);
  for (const id of SECTIONS) await expect(page.locator(`#${id} .empty`)).toHaveText("couldn't load");
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
