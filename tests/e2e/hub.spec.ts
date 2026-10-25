import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Ledger (table), sort / filter / search / keyboard, desktop detail pane, palette. Default viewport is 1280 wide.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
async function open(page: Page, url = "/") {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    return route.fulfill({ json: bodies[name] ?? [] });
  });
  await page.goto(url);
  await expect(page.locator(".proj")).not.toHaveCount(0);
}
const names = (page: Page) => page.locator(".proj a.lg-name").allTextContents();
const pane = (page: Page) => page.locator("#detail-pane");

test("ledger: real table, default order, columns", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("#ledger caption")).toHaveText(/Projects/);
  expect(await names(page)).toEqual(["Alpha", "Beta <b>x</b>", "NoSite", "Gamma"]); // featured first, then newest push
  const alpha = page.locator(".proj", { hasText: "Alpha" });
  await expect(alpha).toContainText("Alpha ships tiny tools fast");
  await expect(alpha).toContainText("Healthy");
  await expect(alpha).toContainText("TypeScript");
  await expect(alpha).toContainText("success");
  await expect(alpha.locator(".lg-spark")).toHaveCount(1);
  await expect(alpha.locator(".up-bar i")).toHaveCount(30);
  await expect(alpha).toContainText("100%");
  await expect(page.locator(".proj", { hasText: "Beta" })).toContainText("Needs attention");
  await expect(page.locator(".proj", { hasText: "NoSite" })).toContainText("In progress");
  await expect(page.locator(".proj", { hasText: "NoSite" }).locator(".up-bar")).toHaveCount(0);
  await expect(alpha.locator("[title='2026-10-18']")).toHaveCount(1);
  await expect(page.locator("#ledger b")).toHaveCount(0); // names are text, never markup
});

test("sort: headers toggle aria-sort and order", async ({ page }) => {
  await open(page);
  const th = (n: string) => page.getByRole("columnheader", { name: n });
  await expect(th("Last push")).toHaveAttribute("aria-sort", "descending");
  await th("Project").getByRole("button").click();
  expect(await names(page)).toEqual(["Alpha", "Beta <b>x</b>", "Gamma", "NoSite"]);
  await expect(th("Project")).toHaveAttribute("aria-sort", "ascending");
  expect(page.url()).toContain("sort=name");
  await th("Status").getByRole("button").click();
  expect((await names(page))[0]).toBe("Beta <b>x</b>"); // attention first
  await th("CI").getByRole("button").click();
  expect((await names(page))[0]).toBe("Beta <b>x</b>"); // failing first
  await th("CI").getByRole("button").click(); // second click resets to the default order
  expect(await names(page)).toEqual(["Alpha", "Beta <b>x</b>", "NoSite", "Gamma"]);
  expect(new URL(page.url()).search).toBe("");
});

test("filter chips, language select, search and clear drive the URL", async ({ page }) => {
  await open(page);
  const chip = (n: RegExp) => page.getByRole("button", { name: n });
  await expect(chip(/^Failing/)).toContainText("1");
  await chip(/^Failing/).click();
  expect(await names(page)).toEqual(["Beta <b>x</b>"]);
  await expect(chip(/^Failing/)).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toContain("status=failing");
  await chip(/^Live/).click();
  expect(await names(page)).toEqual(["Alpha"]);
  await chip(/^WIP/).click();
  expect(await names(page)).toEqual(["NoSite", "Gamma"]);
  await chip(/^All/).click();
  await page.locator(".lg-lang").selectOption("TypeScript");
  await expect(page.locator(".proj")).toHaveCount(2);
  expect(page.url()).toContain("lang=TypeScript");
  await page.getByRole("searchbox", { name: "Search" }).fill("alp");
  await expect(page.locator(".proj")).toHaveCount(1);
  expect(page.url()).toContain("q=alp");
  await page.getByRole("searchbox", { name: "Search" }).fill("zzz");
  await expect(page.locator("#ledger")).toContainText("no projects match");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".proj")).toHaveCount(4);
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("#projects")).toContainText("4 of 4 projects");
});

test("filters restore from the URL (legacy status=up too)", async ({ page }) => {
  await open(page, "/?sort=lang&lang=TypeScript&status=up");
  expect(await names(page)).toEqual(["Alpha"]);
  await expect(page.locator(".lg-lang")).toHaveValue("TypeScript");
  await expect(page.getByRole("button", { name: /^Live/ })).toHaveAttribute("aria-pressed", "true");
});

test("keyboard: j/k move rows, Enter opens the pane, f searches, Esc closes", async ({ page }) => {
  await open(page);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("j");
  await expect(page.locator("a.lg-name").first()).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.locator("a.lg-name").nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(page.locator("a.lg-name").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(pane(page).getByRole("heading", { level: 3, name: "Alpha" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pane(page)).toBeHidden();
  await expect(page.locator("a.lg-name").first()).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("f");
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
  await page.keyboard.type("jk"); // typing in the field is not a shortcut
  await expect(page.locator(".proj")).toHaveCount(0);
});

test("pane: row click fills it, URL /p/<name>, Back closes, Forward reopens, switching keeps one entry", async ({ page }) => {
  await open(page);
  await expect(pane(page)).toBeHidden();
  const before = await page.evaluate(() => history.length);
  await page.locator(".proj", { hasText: "Alpha" }).click();
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Alpha");
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(page.locator("#pp")).toBeHidden();
  await expect(page).toHaveTitle("Alpha · DevPulse");
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await expect(page.locator(".proj", { hasText: "Alpha" }).locator("a.lg-name")).toHaveAttribute("aria-current", "true");
  await page.locator(".proj", { hasText: "Gamma" }).click(); // switch: replaces, still one extra entry
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Gamma");
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  await expect(pane(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle("DevPulse");
  await page.goForward();
  await expect(pane(page)).toBeVisible();
  await pane(page).getByRole("button", { name: /Close Gamma details/ }).click();
  await expect(pane(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test("pane content: stats, uptime strip, README inert, chart readout, links, snippets", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/p/Alpha");
  const p = pane(page);
  await expect(p).toBeVisible();
  await expect(p).toContainText("Alpha ships tiny tools fast");
  await expect(p).toContainText("v1.2.0");
  await expect(p).toContainText("12,345");
  await expect(p).toContainText("80");
  await expect(p).toContainText("→ now");
  await expect(p).toContainText("Perf 95");
  await expect(p.locator(".up-bar--lg i")).toHaveCount(90);
  await expect(p.getByRole("img", { name: /Daily uptime, last 90 days: 99/ })).toBeVisible();
  await expect(p.locator(".pp-read li")).toHaveCount(2);
  await expect(p.locator(".pp-read img, .pp-read b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  await expect(p.locator("a", { hasText: "Live" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(p.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://docs.example.com/alpha");
  await expect(p.getByText("Bad", { exact: true })).not.toHaveAttribute("href", /.*/);
  await expect(p).toContainText("Fix thing");
  await p.locator(".wk-col").first().focus();
  await expect(p.locator(".hub-readout")).toContainText("Week of");
  await page.keyboard.press("ArrowRight");
  await expect(p.locator(".wk-col").nth(1)).toBeFocused();
  const origin = new URL(page.url()).origin;
  await expect(p.locator(".hub-snippet").nth(1)).toHaveText(`![card](${origin}/card/Alpha.svg)`);
  await p.getByRole("button", { name: "Copy card snippet" }).click();
  await expect(p.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
});

test("pane: Beta shows a down site; no live site / no commits are friendly", async ({ page }) => {
  await open(page, "/p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Beta <b>x</b>");
  await expect(pane(page).locator(".dp-status[data-s=attn]")).toContainText("Down");
  await page.locator(".proj", { hasText: "NoSite" }).click();
  await expect(pane(page)).toContainText("No live site");
  await page.locator(".proj", { hasText: "Gamma" }).click();
  await expect(pane(page)).toContainText("no commits yet");
  await expect(pane(page)).toContainText("collecting data");
});

test("pane topic chip filters the ledger and toggles", async ({ page }) => {
  await open(page, "/p/Alpha");
  const chip = pane(page).getByRole("button", { name: "vite", exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".proj")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Clear topic filter vite/ })).toBeVisible();
  await chip.click();
  await expect(page.locator(".proj")).toHaveCount(4);
});

test("deep link /p/<name> cold load opens the pane; unknown name is a friendly page; legacy #p/ redirects", async ({ page }) => {
  await open(page, "/p/Alpha");
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Alpha");
  await expect(page.locator(".proj", { hasText: "Alpha" })).toHaveAttribute("data-sel", "");
  await page.goto("/p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Beta <b>x</b>");
  await expect(pane(page).locator("h3 b")).toHaveCount(0);
  await page.goto("/#p/Gamma");
  await expect(page).toHaveURL(/\/p\/Gamma$/);
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Gamma");
  await page.goto("/p/Nope");
  await expect(page.locator("#pp h1")).toHaveText("Project not found");
  await expect(page.locator("#pp")).toContainText("No project named “Nope”.");
  await expect(page).toHaveTitle("Not found · DevPulse");
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".proj")).toHaveCount(4);
});

test("palette: / opens it, fuzzy pick opens the pane and selects the row, Ctrl+K, help", async ({ page }) => {
  await open(page);
  const pal = page.getByRole("dialog", { name: "Command palette" });
  await page.getByRole("searchbox", { name: "Search" }).press("/"); // typing: no palette
  await expect(pal).toBeHidden();
  await page.getByRole("searchbox", { name: "Search" }).fill("");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("/");
  await expect(pal).toBeVisible();
  await expect(page.locator(".pal__in")).toBeFocused();
  await page.keyboard.type("gam");
  await expect(pal.getByRole("option").first()).toContainText("Gamma");
  await page.keyboard.press("Enter");
  await expect(pal).toBeHidden();
  await expect(page).toHaveURL(/\/p\/Gamma$/);
  await expect(pane(page).getByRole("heading", { level: 3 })).toHaveText("Gamma");
  await expect(page.locator(".proj", { hasText: "Gamma" })).toHaveAttribute("data-sel", "");
  await page.goBack();
  await expect(pane(page)).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(pal).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(pal.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(pal).toBeHidden();
  await page.keyboard.press("?");
  await expect(pal).toContainText("Keyboard shortcuts");
  await expect(pal).toContainText("j / k");
  await page.keyboard.press("Escape");
});

test("palette actions: toggle theme", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("toggle");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("phone: tap opens the full page (h1 focused, title), Back restores the list and focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const baseTitle = await page.title();
  await page.locator(".proj", { hasText: "Alpha" }).click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(page.locator("#pp h1")).toHaveText("Alpha");
  await expect(page.locator("#pp h1")).toBeFocused();
  await expect(pane(page)).toBeHidden();
  await expect(page.locator("#projects")).toBeHidden();
  await expect(page).toHaveTitle("Alpha · DevPulse");
  await expect(page.locator("#pp .up-bar--lg i")).toHaveCount(30);
  await page.goBack();
  await expect(page.locator("#pp")).toBeHidden();
  await expect(page).toHaveTitle(baseTitle);
  await expect(page.locator('a.lg-name[data-vp="Alpha"]')).toBeFocused();
});

test("phone: two-line rows, >= 44px, no overflow at 375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  for (const r of await page.locator(".proj").all()) {
    const b = (await r.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeLessThan(100);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
  }
  const first = page.locator(".proj").first();
  const link = (await first.locator("a.lg-name").boundingBox())!;
  const chip = (await first.locator(".ci").boundingBox())!;
  expect(chip.y).toBeGreaterThan(link.y + link.height - 4); // CI chip sits on the second line
  await expect(first.locator(".lg-spark")).toBeHidden();
  expect(link.height).toBeGreaterThanOrEqual(43.5);
  await expect(first.locator(".lg-tag")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const theme of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    test(`axe ${theme} ${width}: ledger${width === 1280 ? " + pane" : ""} + palette`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await open(page, width === 1280 ? "/p/Alpha" : "/");
      if (width === 1280) await expect(pane(page)).toBeVisible();
      await page.locator("#projects").scrollIntoViewIfNeeded();
      expect((await new AxeBuilder({ page }).include("#projects").analyze()).violations).toEqual([]);
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
  test(`axe ${theme} 390: project page + not found`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await open(page, "/p/Alpha");
    await expect(page.locator("#pp h1")).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto("/p/Nope");
    await expect(page.locator("#pp h1")).toHaveText("Project not found");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
