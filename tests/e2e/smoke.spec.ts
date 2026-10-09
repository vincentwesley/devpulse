import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ colorScheme: "light" });

test("empty states, dark default, credits", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const id of ["projects", "heatmap", "posts"]) {
    await expect(page.locator(`#${id} .empty`)).toHaveText("no data yet");
  }
  await expect(page.locator(".creator")).toBeVisible();
  await expect(page.locator(".creator__blurb")).toContainText("DevPulse");
});

test("theme toggle persists", async ({ page }) => {
  await page.goto("/");
  await page.click("#theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

for (const theme of ["dark", "light"]) {
  test(`axe ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto("/");
    await page.locator(".creator").scrollIntoViewIfNeeded();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });
}
