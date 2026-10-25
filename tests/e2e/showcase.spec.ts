import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Full project page (/p/<name>) as used below 1024px, and the cover / tile rules shared with the detail pane.
// The Worker serves index.html for /p/*; vite preview does the same via its SPA fallback.
test.use({ serviceWorkers: "block", viewport: { width: 390, height: 800 } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };

async function open(page: Page, url = "/") {
  await page.route("**/api/*", (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop()!;
    return r.fulfill({ json: bodies[name] ?? [] });
  });
  await page.route("**/img/*", (r) =>
    new URL(r.request().url()).pathname.endsWith("/alpha") ? r.fulfill({ body: PNG, contentType: "image/png" }) : r.fulfill({ status: 404, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 21" width="40" height="21"><rect width="40" height="21" fill="#888"/></svg>' })); // what the Worker sends for a missing cover
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("page: content, focus, Back / Forward, title and meta restore", async ({ page }) => {
  await open(page);
  const baseTitle = await page.title();
  const before = await page.evaluate(() => history.length);
  await page.locator(".proj", { hasText: "Alpha" }).click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  const pp = page.locator("#pp");
  await expect(pp.getByRole("heading", { level: 1 })).toHaveText("Alpha");
  await expect(pp.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("#projects")).toBeHidden();
  await expect(page).toHaveTitle("Alpha · DevPulse");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Alpha ships tiny tools fast");
  await expect(page.getByRole("status").filter({ hasText: "Alpha project page" })).toHaveCount(1);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(pp).toContainText("v1.2.0");
  await expect(pp).toContainText("Up");
  await expect(pp.locator(".wk-col")).toHaveCount(26);
  await expect(pp.locator(".hub-snippet").nth(1)).toHaveText(`![card](${new URL(page.url()).origin}/card/Alpha.svg)`);
  await expect(pp.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://docs.example.com/alpha");
  await expect(pp.getByText("Bad", { exact: true })).not.toHaveAttribute("href", /.*/); // non-https link is plain text
  await expect(pp.getByRole("link", { name: "Live" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(pp.locator(".hub-topic").first()).toContainText("vite");
  await page.goBack();
  await expect(pp).toBeHidden();
  await expect(page.locator("#projects")).toBeVisible();
  await expect(page).toHaveTitle(baseTitle);
  await expect(page.locator('a.lg-name[data-vp="Alpha"]')).toBeFocused();
  await page.goForward();
  await expect(pp.getByRole("heading", { level: 1 })).toHaveText("Alpha");
  await pp.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(pp).toBeHidden();
});

test("cover image when set, generated tile when missing or a placeholder", async ({ page }) => {
  await open(page, "/p/Alpha");
  const img = page.locator("#pp img.sc-media");
  await expect(img).toHaveAttribute("width", "1200");
  await expect(img).toHaveAttribute("height", "630");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await page.goto("/p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
  await expect(page.locator("#pp img")).toHaveCount(0);
  await expect(page.locator("#pp .sc-tile .sc-initial")).toHaveText("B");
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

test("palette opens the project page on a phone", async ({ page }) => {
  await open(page);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Control+k");
  await page.keyboard.type("gam");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/p\/Gamma$/);
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
});

test("project page: no overflow at 375, tap targets, reduced motion, real commits and hints", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "/p/Alpha");
  await expect(page.locator("#pp")).toContainText("Fix thing");
  expect(await noOverflow(page)).toBe(true);
  for (const l of await page.locator("#pp .hub-btn, #pp .hub-topic, #pp .list a").all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await page.goto("/p/Gamma");
  await expect(page.locator("#pp h1")).toHaveText("Gamma");
  await expect(page.locator("#pp")).toContainText("no commits yet");
  await expect(page.locator("#pp")).toContainText("collecting data — updates daily");
});
