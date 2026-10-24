import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status: { sites: [], incidents: [] } };
const BETA = "/#p/Beta%20%3Cb%3Ex%3C%2Fb%3E";

async function setup(page: Page) {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    return route.fulfill({ json: bodies[name] ?? [] });
  });
}
async function open(page: Page, url = "/") {
  await setup(page);
  await page.goto(url);
  await expect(page.locator(".proj")).not.toHaveCount(0);
}

test("search, filters and topic chips drive the URL", async ({ page }) => {
  await open(page);
  await page.getByRole("searchbox", { name: "Search" }).fill("alp");
  await expect(page.locator(".proj")).toHaveCount(1);
  expect(page.url()).toContain("q=alp");
  await page.getByRole("searchbox", { name: "Search" }).fill("");
  await expect(page.locator(".proj")).toHaveCount(4);
  expect(new URL(page.url()).search).toBe("");
  await page.getByRole("button", { name: "vite", exact: true }).click();
  await expect(page.locator(".proj")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "vite", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toContain("topic=vite");
  await expect(page.locator("#projects")).toContainText("1 of 4 projects");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".proj")).toHaveCount(4);
});

test("filters restore from the URL", async ({ page }) => {
  await open(page, "/?sort=stars&lang=TypeScript&status=all");
  await expect(page.locator(".proj")).toHaveCount(2);
  await expect(page.locator(".hub-filters")).toHaveJSProperty("open", true);
  await expect(page.locator(".hub-pick select").first()).toHaveValue("stars");
});

test("deep link opens the dialog; Esc clears the hash and returns focus sanely", async ({ page }) => {
  await open(page, BETA);
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Beta");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe(""); // close event (and replaceState) is async
});

test("Back closes the dialog, Forward reopens it, one history entry", async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Details for Alpha" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  expect(page.url()).toContain("#p/Alpha");
  await page.goBack();
  await expect(dlg).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");
  await page.goForward();
  await expect(dlg).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click(); // pops its own entry
  await expect(dlg).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test("detail content, chart readout and copy snippets", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/#p/Alpha");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("v1.2.0");
  await expect(dlg).toContainText("80 commits");
  await expect(dlg).toContainText("Perf 95");
  await expect(dlg).toContainText("Week 2026-W40");
  await expect(dlg).toContainText("Cloudflare: none");
  await expect(dlg.locator("a", { hasText: "Live" })).toHaveAttribute("href", "https://alpha.example.com");
  const col = dlg.locator(".wk-col").first();
  await col.focus();
  await expect(dlg.locator(".hub-readout")).toContainText("Week of");
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".wk-col").nth(1)).toBeFocused();
  await expect(dlg.locator(".hub-chart")).not.toContainText("undefined");
  const origin = new URL(page.url()).origin;
  await expect(dlg.locator(".hub-snippet").nth(1)).toHaveText(`![card](${origin}/card/Alpha.svg)`);
  await dlg.getByRole("button", { name: "Copy card snippet" }).click();
  await expect(dlg.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
});

test("command palette: keyboard open, fuzzy pick, help, ignored while typing", async ({ page }) => {
  await open(page);
  const pal = page.getByRole("dialog", { name: "Command palette" });
  await page.getByRole("searchbox", { name: "Search" }).fill("");
  await page.getByRole("searchbox", { name: "Search" }).press("/"); // typing: no palette
  await expect(pal).toBeHidden();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("/");
  await expect(pal).toBeVisible();
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("gam");
  await expect(pal.getByRole("option").first()).toContainText("Gamma");
  await page.keyboard.press("Enter");
  await expect(pal).toBeHidden();
  await expect(page).toHaveURL(/\/p\/Gamma$/);
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
  await page.goBack();
  await expect(page.locator("#pp")).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(pal).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(pal.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(pal).toBeHidden();
  await page.keyboard.press("?");
  await expect(pal).toContainText("Keyboard shortcuts");
  await page.keyboard.press("Escape");
});

test("palette actions: toggle theme", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("toggle");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

for (const theme of ["dark", "light"]) {
  test(`bottom sheet at 390 ${theme}: layout, axe, Esc + focus return`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await open(page);
    const opener = page.getByRole("button", { name: "Details for Alpha" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    const b = (await dlg.boundingBox())!;
    expect(Math.round(b.width)).toBe(390);
    expect(Math.round(b.y + b.height)).toBe(800); // anchored to the bottom
    expect(b.height).toBeLessThanOrEqual(800 * 0.9 + 1);
    const close = (await dlg.getByRole("button", { name: "Close" }).boundingBox())!;
    expect(close.height).toBeGreaterThanOrEqual(44);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`palette axe ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await open(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });
}

test("project cards readable at 360px: Details >= 44px, chips >= 12px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  const d = (await page.getByRole("button", { name: /^Details for/ }).first().boundingBox())!;
  expect(d.height).toBeGreaterThanOrEqual(44);
  const fs = await page.locator(".hub-topic").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(fs).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
