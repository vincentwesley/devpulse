import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Featured section + project page (/p/<name>). The Worker serves index.html for /p/*; vite preview does the same via its SPA fallback.
test.use({ serviceWorkers: "block" });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };

async function setup(page: Page, over: Record<string, unknown> = {}) {
  await page.route("**/api/*", (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop()!;
    return r.fulfill({ json: over[name] ?? bodies[name] ?? [] });
  });
  await page.route("**/img/*", (r) =>
    new URL(r.request().url()).pathname.endsWith("/alpha") ? r.fulfill({ body: PNG, contentType: "image/png" }) : r.fulfill({ status: 404, body: "no" }));
}
async function open(page: Page, url = "/", over: Record<string, unknown> = {}) {
  await setup(page, over);
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("featured: cards, cover image, fallback tile, tab, order", async ({ page }) => {
  await open(page);
  const cards = page.locator("#featured .sc-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Featured" })).toBeVisible();
  const a = cards.filter({ hasText: "Alpha" });
  await expect(a).toContainText("Alpha ships tiny tools fast");
  await expect(a).toContainText("▲ Up");
  await expect(a).toContainText("CI: success");
  const img = a.locator("img.sc-media");
  await expect(img).toHaveAttribute("loading", "lazy");
  await expect(img).toHaveAttribute("decoding", "async");
  await expect(img).toHaveAttribute("width", "1200");
  await expect(img).toHaveAttribute("height", "630");
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  // broken cover -> generated tile (decorative, no img left)
  const b = cards.filter({ hasText: "Beta" });
  await b.scrollIntoViewIfNeeded();
  await expect(b.locator("img")).toHaveCount(0);
  await expect(b.locator(".sc-tile .sc-initial")).toHaveText("B");
  // grid: featured first, every card has a thumb or tile and a View project link
  await expect(page.locator(".proj")).toHaveCount(4);
  await expect(page.locator(".proj h3").first()).toHaveText("Alpha");
  await expect(page.locator(".proj .sc-media")).toHaveCount(4);
  await expect(page.locator(".proj").filter({ hasText: "NoSite" }).locator(".sc-initial")).toHaveText("N");
  await expect(page.getByRole("link", { name: "View project NoSite" })).toHaveAttribute("href", "/p/NoSite");
});

test("featured: hidden (section and tab) when nothing is featured", async ({ page }) => {
  await open(page, "/", { projects: projects.map((p) => ({ ...p, featured: false })) });
  await expect(page.locator("#featured")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Featured" })).toBeHidden();
  await expect(page.locator(".proj")).toHaveCount(4);
});

test("View project: page content, focus, Back / Forward, title restore", async ({ page }) => {
  await open(page);
  const baseTitle = await page.title();
  const before = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "View project Alpha" }).first().click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  const pp = page.locator("#pp");
  await expect(pp).toBeVisible();
  await expect(pp.getByRole("heading", { level: 1 })).toHaveText("Alpha");
  await expect(pp.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("#projects")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden();
  await expect(page).toHaveTitle("Alpha · DevPulse");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Alpha ships tiny tools fast");
  await expect(page.getByRole("status").filter({ hasText: "Alpha project page" })).toHaveCount(1);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(pp).toContainText("v1.2.0");
  await expect(pp).toContainText("80");
  await expect(pp.locator(".st__bar")).toHaveCount(90);
  await expect(pp.locator(".st__pill")).toContainText("Up");
  await expect(pp.locator(".wk-col")).toHaveCount(26);
  await expect(pp.locator(".hub-snippet").nth(1)).toHaveText(`![card](${new URL(page.url()).origin}/card/Alpha.svg)`);
  await expect(pp.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://docs.example.com/alpha");
  await expect(pp.getByText("Bad", { exact: true })).not.toHaveAttribute("href", /.*/); // non-https link is plain text
  await expect(pp.getByRole("link", { name: "Live" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(pp.locator(".pp-title ~ .hub-topics, .hub-topics").first()).toContainText("vite");
  // Back -> list, focus back on the opener, title restored
  await page.goBack();
  await expect(pp).toBeHidden();
  await expect(page.locator("#projects")).toBeVisible();
  await expect(page).toHaveTitle(baseTitle);
  await expect(page.locator('a[data-vp="Alpha"]').first()).toBeFocused();
  await page.goForward();
  await expect(pp.getByRole("heading", { level: 1 })).toHaveText("Alpha");
  await pp.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(pp).toBeHidden();
});

test("README renders as inert text; links are https only", async ({ page }) => {
  await open(page, "/p/Alpha");
  const read = page.locator("#pp .pp-read");
  await expect(read.locator("li")).toHaveCount(2);
  await expect(read.locator("li").nth(1)).toHaveText("<img src=x onerror=window.__pwn=1>");
  await expect(read).toContainText("Second paragraph with <b>markup</b>.");
  await expect(read.locator("img, b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  await expect(page.locator("#pp a[href^='javascript']")).toHaveCount(0);
});

test("direct load of /p/<name>, even with markup in the name", async ({ page }) => {
  await open(page, "/p/Alpha");
  await expect(page.locator("#pp h1")).toHaveText("Alpha");
  await expect(page.locator("#pp h1")).toBeFocused();
  await expect(page.locator("#projects")).toBeHidden();
  await page.goto("/p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
  await expect(page.locator("#pp h1")).toHaveText("Beta <b>x</b>");
  await expect(page.locator("#pp h1 b")).toHaveCount(0);
});

test("unknown project: friendly not-found with a way back", async ({ page }) => {
  await open(page, "/p/Nope");
  await expect(page.locator("#pp h1")).toHaveText("Project not found");
  await expect(page.locator("#pp")).toContainText("No project named “Nope”.");
  await expect(page).toHaveTitle("Not found · DevPulse");
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".proj")).toHaveCount(4);
});

test("topic chip on the page filters the list", async ({ page }) => {
  await open(page, "/p/Alpha");
  await page.locator("#pp").getByRole("button", { name: "vite", exact: true }).click();
  await expect(page).toHaveURL(/\/\?topic=vite$/);
  await expect(page.locator("#pp")).toBeHidden();
  await expect(page.locator(".proj")).toHaveCount(1);
});

test("palette opens the project page; old #p/ dialog link still works", async ({ page }) => {
  await open(page);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Control+k");
  await page.keyboard.type("gam");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\/Gamma$/);
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
  await page.goto("/#p/Alpha");
  await expect(page.getByRole("dialog", { name: "Alpha" })).toBeVisible();
});

test("mobile: 30-day strip, no overflow at 375, tap targets, reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  expect(await noOverflow(page)).toBe(true);
  for (const l of await page.locator("#featured .hub-btn").all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("link", { name: "View project Alpha" }).first().click();
  await expect(page.locator("#pp .st__bar")).toHaveCount(30);
  expect(await noOverflow(page)).toBe(true);
  for (const l of await page.locator("#pp .hub-btn, #pp .hub-topic, #pp .list a").all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

for (const theme of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    test(`axe ${theme} ${width}: featured and project page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await open(page);
      await page.locator("#featured img").first().scrollIntoViewIfNeeded();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByRole("link", { name: "View project Alpha" }).first().click();
      await expect(page.locator("#pp h1")).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.goto("/p/Nope");
      await expect(page.locator("#pp h1")).toHaveText("Project not found");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
}
