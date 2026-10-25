import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Design/UX polish: mobile sort select, empty columns, verdict shortcut, attention chips, README toggle, heatmap range.
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
const names = (page: Page) => page.locator(".proj a.lg-name").allTextContents();

test("390: one Sort select replaces the headers; rows have no dashes and a full-row link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  await expect(page.locator(".lg-table thead")).toBeHidden();
  const sel = page.getByLabel("Sort", { exact: true });
  await expect(sel).toBeVisible();
  expect((await sel.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await sel.selectOption("name");
  expect(await names(page)).toEqual(["Alpha", "Beta <b>x</b>", "Gamma", "NoSite"]);
  expect(page.url()).toContain("sort=name");
  for (const r of await page.locator(".proj").all()) {
    for (const td of await r.locator("td").all()) {
      if (await td.isVisible()) await expect(td).not.toHaveText(/^\s*—\s*(no data)?\s*$/);
    }
    await r.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
    const row = (await r.boundingBox())!;
    const hit = await r.locator("a.lg-name").evaluate((a, p) => document.elementFromPoint(p.x, p.y) === a, { x: row.x + row.width - 20, y: row.y + row.height - 6 });
    expect(hit).toBe(true); // tapping the far corner of the row hits the project link
  }
});

test("1280: the sort select is hidden on desktop and the Activity/Uptime columns drop when empty", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/", {
    projects: (projects as Record<string, unknown>[]).map((p) => ({ ...p, codeFreq: [], url: null })),
    status: { ...status, sites: [], incidents: [] },
  });
  await expect(page.getByLabel("Sort", { exact: true })).toBeHidden();
  await expect(page.getByRole("columnheader", { name: "Activity" })).toBeHidden();
  await expect(page.getByRole("columnheader", { name: /Uptime/ })).toBeHidden();
  await expect(page.getByRole("columnheader", { name: "Last push" })).toBeVisible();
});

test("1280: columns with data stay", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await expect(page.getByRole("columnheader", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Uptime/ })).toBeVisible();
});

test("verdict pill is a button that applies the Failing filter and scrolls to the ledger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const pill = page.locator("#verdict").getByRole("button", { name: /needs? attention/ });
  await pill.focus();
  await page.keyboard.press("Enter");
  expect(await page.locator(".proj").count()).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /^Failing/ })).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toContain("status=failing");
  await expect.poll(() => page.locator("#projects").evaluate((e) => e.getBoundingClientRect().top < 400)).toBe(true);
  await expect(page.locator("#updated-m")).toContainText(/Updated/);
});

test("pulse lists attention repos by name (max 3, then +N)", async ({ page }) => {
  await open(page);
  const chips = page.locator("#tile-pulse .pulse__chip");
  await expect(chips.first()).toContainText("Beta");
  await expect(chips.first()).toHaveAttribute("href", /^\/p\//);
  const bad = (projects as Record<string, unknown>[]).map((p) => ({ ...p, ciState: "FAILURE" }));
  await page.unroute("**/api/*");
  await open(page, "/", { projects: bad });
  await expect(page.locator("#tile-pulse .pulse__chip")).toHaveCount(3);
  await expect(page.locator("#tile-pulse .pulse__more")).toHaveText("+1");
});

test("mobile: Pulse comes before Featured; the placeholder cover is capped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const p = (await page.locator("#tile-pulse").boundingBox())!, f = (await page.locator("#tile-featured").boundingBox())!;
  expect(p.y).toBeLessThan(f.y);
  const tile = page.locator("#tile-featured .ft__tile");
  if (await tile.count()) expect((await tile.boundingBox())!.height).toBeLessThanOrEqual(130);
  expect(f.height).toBeLessThan(520);
});

test("README is clamped with a Read more toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const long = Array.from({ length: 12 }, (_, i) => `Line ${i} of a longer readme paragraph.`).join("\n");
  await open(page, "/p/Alpha", { projects: (projects as Record<string, unknown>[]).map((p) => (p.name === "Alpha" ? { ...p, readme: long } : p)) });
  const read = page.locator("#detail-pane .pp-read");
  const more = page.locator("#detail-pane").getByRole("button", { name: "Read more" });
  await expect(read).toHaveAttribute("data-clamped", "");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const h = (await read.boundingBox())!.height;
  await more.click();
  await expect(read).not.toHaveAttribute("data-clamped", "");
  const less = page.locator("#detail-pane").getByRole("button", { name: "Show less" });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  expect((await read.boundingBox())!.height).toBeGreaterThan(h);
});

test("heatmap range: two pressed-state buttons; month labels never overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const grp = page.getByRole("group", { name: "Heatmap range" });
  await expect(grp.getByRole("button", { name: "Full year" })).toHaveAttribute("aria-pressed", "true");
  const xs = await page.locator("#tile-contrib .months").evaluateAll((ts) => ts.map((t) => (t as unknown as SVGTextElement).getBBox()).map((b) => [b.x, b.x + b.width]));
  for (let i = 1; i < xs.length; i++) expect(xs[i][0]).toBeGreaterThanOrEqual(xs[i - 1][1]);
});

test("palette input shows a single focus ring", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  const s = await page.locator(".pal__in").evaluate((e) => { const c = getComputedStyle(e); return [c.outlineWidth, c.boxShadow]; });
  expect(s).toEqual(["2px", "none"]);
});

test("1280: project links have a 44px hit area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const a = page.locator("a.lg-name").first();
  expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});
