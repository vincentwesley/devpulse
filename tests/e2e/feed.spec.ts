import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

test.use({ serviceWorkers: "block" });

const many = Array.from({ length: 14 }, (_, i) => ({ repo: "alpha", sha: `abcdef${i}`, message: `Commit ${i}`, author: "v", ts: new Date(Date.parse("2026-10-08T10:00:00Z") - i * 36e5 * 7).toISOString(), url: "https://github.com/o/alpha/commit/x" }));
type Over = Partial<Record<"commits" | "posts" | "status", unknown>> & { fail?: string };

async function open(page: Page, o: Over = {}) {
  await page.route("**/api/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (o.fail === name) return route.fulfill({ status: 500, body: "boom" });
    const b: Record<string, unknown> = { commits, posts, status, ...o };
    return route.fulfill({ json: b[name] ?? (name === "heatmap" ? { days: [] } : name === "languages" ? { all: [] } : name === "stats" ? {} : []) });
  });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}

test("activity: day groups, sha link, truncation title, show more", async ({ page }) => {
  await open(page, { commits: many });
  await expect(page.locator("#activity .act li")).toHaveCount(10);
  await expect(page.locator("#activity .act__day").first()).toBeVisible();
  const first = page.locator("#activity .act li").first();
  await expect(first.locator(".act__sha")).toHaveText("abcdef0");
  await expect(first.locator(".act__sha")).toHaveAttribute("href", /^https:\/\//);
  await expect(first.locator(".act__msg")).toHaveAttribute("title", "Commit 0");
  const more = page.getByRole("button", { name: /Show more/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(page.locator("#activity .act li")).toHaveCount(14);
  await expect(more).toBeHidden();
});

test("activity: first line only, no markup parsed, empty and error states", async ({ page }) => {
  await open(page, { commits: [{ ...many[0], message: "<b>x</b>\nbody" }] });
  await expect(page.locator("#activity .act__msg")).toHaveText("<b>x</b>");
  await expect(page.getByRole("button", { name: /Show more/ })).toBeHidden();
  await page.unroute("**/api/*");
  const p2 = await page.context().newPage();
  await open(p2, { commits: [] });
  await expect(p2.locator("#activity .empty")).toContainText("no data yet");
  const p3 = await page.context().newPage();
  await open(p3, { fail: "commits" });
  await expect(p3.locator("#activity .empty--err")).toContainText("couldn't load");
  await expect(p3.locator("#activity").getByRole("button", { name: "Retry" })).toBeVisible();
});

test("uptime: rows, 90 bars, keyboard + tap readout, incidents", async ({ page }) => {
  await open(page);
  const rows = page.locator("#status .st__site");
  await expect(rows).toHaveCount(2);
  const alpha = rows.first();
  await expect(alpha.locator("h3 a")).toHaveAttribute("href", "/p/Alpha");
  await expect(alpha.locator(".st__pill")).toHaveText("Up");
  await expect(rows.nth(1).locator(".st__pill")).toHaveText("Down");
  await expect(alpha.locator(".st__bar")).toHaveCount(90);
  await alpha.locator(".st__bar").nth(40).focus();
  await expect(alpha.locator(".readout")).toContainText("(90/96 checks)");
  await page.keyboard.press("ArrowRight");
  await expect(alpha.locator(".readout")).toContainText(/\d+ \w{3,4} · 100% \(96\/96 checks\)/);
  await alpha.locator(".st__bar").nth(10).click();
  await expect(alpha.locator(".readout")).toContainText("checks)");
  const inc = page.locator("#status .st__inc");
  await expect(inc).toContainText("Incidents (90 days)");
  await expect(inc).toContainText("HTTP 503");
  await expect(inc).toContainText("ongoing");
});

test("uptime: 30 bars on phones, empty incidents, no-url sites hidden, error", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const nourl = { ...status.sites[0], name: "NoUrl", url: "" };
  await open(page, { status: { sites: [...status.sites, nourl], incidents: [] } });
  await expect(page.locator("#status .st__site")).toHaveCount(2);
  await expect(page.locator("#status .st__bar")).toHaveCount(60);
  await expect(page.locator("#status .st__inc")).toContainText("no incidents in 90 days");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const p2 = await page.context().newPage();
  await open(p2, { fail: "status" });
  await expect(p2.locator("#status .empty--err")).toContainText("couldn't load");
});

test("posts: hidden when empty, list when present, error shows message", async ({ page }) => {
  await open(page, { posts: [] });
  await expect(page.locator("#posts")).toBeHidden();
  const p2 = await page.context().newPage();
  await open(p2);
  await expect(p2.locator("#posts li")).toHaveCount(1);
  await expect(p2.locator("#posts a")).toHaveText("Hello world");
  await expect(p2.locator("#posts time")).toHaveText("2026-09-30");
  const p3 = await page.context().newPage();
  await open(p3, { fail: "posts" });
  await expect(p3.locator("#posts .empty")).toContainText("couldn't load");
});

for (const scheme of ["dark", "light"] as const)
  for (const width of [390, 1280]) {
    test(`axe: activity, uptime, posts ${scheme} ${width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await open(page, { commits: many });
      const r = await new AxeBuilder({ page }).include("#activity").include("#status").include("#posts").analyze();
      expect(r.violations).toEqual([]);
    });
  }
