import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Palette "Copy status summary", the ? shortcut help, and the print stylesheet.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
async function open(page: Page) {
  await page.route("**/api/*", (r) => r.fulfill({ json: bodies[new URL(r.request().url()).pathname.split("/").pop()!] ?? [] }));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}

test("palette: Copy status summary puts a plain-text verdict on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.keyboard.press("Control+k");
  await page.locator(".pal__in").fill("status summary");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Status summary copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^DevPulse: .+\. \d+ ok \/ \d+ attention/);
});

test("? opens the shortcut help listing j/k, f, Ctrl+K and ?", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Command palette" });
  await expect(help).toContainText("Keyboard shortcuts");
  for (const k of ["j / k", "Ctrl+K", "f", "?"]) await expect(help.locator("dt", { hasText: k }).first()).toBeVisible();
});

test("print: controls, banner and pane are gone; the whole ledger stays", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await open(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".top__tools")).toBeHidden();
  await expect(page.locator(".lg-search")).toBeHidden();
  await expect(page.locator(".proj").first()).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
});
