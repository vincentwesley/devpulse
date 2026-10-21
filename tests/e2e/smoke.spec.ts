import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };

test.use({ colorScheme: "light" });

type Mode = "full" | "empty" | "fail";
const bodies = { projects, heatmap, commits, posts, stats, languages };
const empties = { projects: [], heatmap: { days: [] }, commits: [], posts: [], stats: {}, languages: { public: [], all: [], privateIncluded: false } };

async function mock(page: Page, mode: Mode) {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() as keyof typeof bodies;
    if (mode === "fail") return route.fulfill({ status: 500, body: "boom" });
    return route.fulfill({ json: mode === "empty" ? empties[name] : bodies[name] });
  });
}
const SECTIONS = ["hero", "languages", "projects", "heatmap", "commits", "posts"];
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
  await expect(page.locator(".proj").nth(3)).toContainText("no data yet");
  await expect(page.locator(".heat rect")).toHaveCount(365);
  await expect(page.locator("#commits a").first()).toHaveText("Fix thing");
  await expect(page.locator("#posts a")).toHaveText("Hello world");
  await expect(page.locator(".creator")).toBeVisible();
  await expect(page.locator("#hero")).toContainText("lines changed (est.)");
  await expect(page.locator("#hero .hero__num").nth(1)).toHaveText("3,456");
  await expect(page.locator("#hero .hero__num").nth(3)).toHaveText("4");
  await expect(page.locator("#languages .lang__bar")).toHaveAttribute("aria-label", /TypeScript 70%/);
  await expect(page.locator("#languages .lang__legend li")).toHaveCount(3);
  await expect(page.locator("#languages .lang__seg").nth(2)).toHaveCSS("background-color", /rgb/); // bad colour falls back to accent
  await page.getByRole("button", { name: "All incl. private" }).click();
  await expect(page.locator("#languages .lang__legend li")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "All incl. private" })).toHaveAttribute("aria-pressed", "true");
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
    await expect(dlg.locator(".hub-chart rect")).toHaveCount(52);
    await expect(dlg).toContainText("Go 100.0%");
    await expect(dlg.locator(".hub-snippet")).toHaveText(`![status](${new URL(page.url()).origin}/badge/Beta%20%3Cb%3Ex%3C%2Fb%3E.svg)`);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
