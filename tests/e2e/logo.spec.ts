import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The draggable Vin's Atelier logo in the credits sign-off morphs between three forms (short </>, middle </in>, long </Atelier>),
// driven by one CSS variable, --logo-x. Locators are scoped to the sign-off.
const X = { short: 540, middle: 734, long: 1491.4 };
const SIGN = ".studio-signoff";
const html = (page: Page) => page.locator("html");
const link = (page: Page) => page.locator(`${SIGN} .brand`);
const logo = (page: Page) => page.locator(`${SIGN} svg.brand-logo`);
const radio = (page: Page, form: string) => page.locator(`${SIGN} input[name="logo-form"][value="${form}"]`);
/** The right chevron's start in viewBox units, measured from the rendered geometry (minus the hover/first-visit hint tug). */
const chevronX = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector(".studio-signoff .brand-logo")!.getBoundingClientRect();
    const el = document.querySelector(".studio-signoff .bl-right")!;
    const r = el.getBoundingClientRect();
    const tug = parseFloat(getComputedStyle(el).translate) || 0;
    return (r.left - s.left) / (s.height / 432) - tug;
  });
const width = async (page: Page) => (await logo(page).boundingBox())!.width;
async function open(page: Page) {
  await page.route("**/api/*", (r) => r.fulfill({ json: [] }));
  await page.route("https://vwesley.dev/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  await page.goto("/");
  await link(page).scrollIntoViewIfNeeded();
}
async function pick(page: Page, form: keyof typeof X) {
  await radio(page, form).check({ force: true });
  const shown = form === "long" && (page.viewportSize()?.width ?? 0) < 480 ? X.middle : X[form];
  await expect.poll(() => chevronX(page)).toBeCloseTo(shown, 0);
}
async function drag(page: Page, dx: number, from = 10) {
  const b = (await link(page).boundingBox())!;
  const y = b.y + b.height / 2;
  const x = b.x + from;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 6 });
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("default form is middle", async ({ page }) => {
    await open(page);
    const attr = await html(page).getAttribute("data-logo");
    expect(attr === null || attr === "middle").toBe(true);
    expect(await chevronX(page)).toBeCloseTo(X.middle, 0);
    await expect(radio(page, "middle")).toBeChecked();
  });

  test("radios switch the form and it persists across a reload", async ({ page }) => {
    await open(page);
    const widths = { short: 0, middle: 0, long: 0 };
    for (const f of ["short", "long", "middle"] as const) {
      await pick(page, f);
      await expect(html(page)).toHaveAttribute("data-logo", f);
      widths[f] = await width(page);
    }
    expect(widths.short).toBeLessThan(widths.middle);
    expect(widths.middle).toBeLessThan(widths.long);
    await pick(page, "long");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-logo", "long");
    expect(await chevronX(page)).toBeCloseTo(X.long, 0);
    await expect(radio(page, "long")).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("logo-form"))).toBe("long");
  });

  test("the radios work with arrow keys", async ({ page }) => {
    await open(page);
    await radio(page, "middle").focus();
    await page.keyboard.press("ArrowRight");
    await expect(radio(page, "long")).toBeChecked();
    await expect(html(page)).toHaveAttribute("data-logo", "long");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(radio(page, "short")).toBeChecked();
    await expect(html(page)).toHaveAttribute("data-logo", "short");
  });

  test("dragging the logo right snaps to long, left to short, and never navigates", async ({ page }) => {
    await open(page);
    const url = page.url();
    await drag(page, 120);
    await expect(html(page)).toHaveAttribute("data-logo", "long");
    await expect.poll(() => chevronX(page)).toBeCloseTo(X.long, 0);
    expect(page.url()).toBe(url);
    await page.waitForTimeout(200);
    await drag(page, -100, 120);
    await expect(html(page)).toHaveAttribute("data-logo", "short");
    await expect.poll(() => chevronX(page)).toBeCloseTo(X.short, 0);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => localStorage.getItem("logo-form"))).toBe("short");
  });

  test("while dragging the logo holds each form for a stretch (a notch), then follows the pointer, with no transition", async ({ page }) => {
    await open(page);
    const b = (await link(page).boundingBox())!;
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + 10, y);
    await page.mouse.down();
    // 18px right of the start: still inside the middle form's notch, </in> fully shown.
    await page.mouse.move(b.x + 28, y, { steps: 4 });
    expect(await chevronX(page)).toBeCloseTo(X.middle, 0);
    expect(await page.locator(`${SIGN} .bl-in`).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    // 40px: past the notch, on the way to the long form.
    await page.mouse.move(b.x + 50, y, { steps: 4 });
    const mid = await chevronX(page);
    expect(mid).toBeGreaterThan(X.middle + 100);
    expect(mid).toBeLessThan(X.long);
    expect(await logo(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
    await page.mouse.up();
  });

  test("a short drag either way lets go on the middle form", async ({ page }) => {
    await open(page);
    await drag(page, 25);
    await expect(html(page)).toHaveAttribute("data-logo", "middle");
    await page.waitForTimeout(200);
    await drag(page, -18, 40);
    await expect(html(page)).toHaveAttribute("data-logo", "middle");
  });

  test("a plain click on the logo goes to vwesley.dev", async ({ page }) => {
    await open(page);
    await expect(link(page)).toHaveAttribute("href", "https://vwesley.dev");
    const req = page.waitForRequest((r) => r.url().startsWith("https://vwesley.dev"));
    await link(page).click({ position: { x: 10, y: 10 } });
    await req;
  });

  test("sign-off text and both Logo by links are visible, and axe is clean", async ({ page }) => {
    await open(page);
    await expect(page.locator(SIGN)).toContainText("Copyright 2026 Vin's Atelier.");
    await expect(page.locator(SIGN)).toContainText("Designed and built by Vin.");
    await expect(page.locator(SIGN).getByRole("link", { name: "@portus_workstation" })).toBeVisible();
    await expect(page.locator(SIGN).getByRole("link", { name: "@wason25_pz" })).toBeVisible();
    await page.waitForTimeout(800); // let entrance animations settle before axe
    const r = await new AxeBuilder({ page }).include(SIGN).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });

  test("the header is unchanged: own brand present, no logo inside it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("DevPulse");
    await expect(page.locator("header.top .brand-logo")).toHaveCount(0);
    await expect(page.locator("header.top [data-logo-link]")).toHaveCount(0);
  });
});

test.describe("narrow screens", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("the Long option shows the middle form below 30rem, and dragging right stops there", async ({ page }) => {
    await open(page);
    const middle = await width(page);
    await radio(page, "long").check({ force: true });
    await expect(html(page)).toHaveAttribute("data-logo", "long");
    await expect.poll(() => chevronX(page)).toBeCloseTo(X.middle, 0);
    expect(await width(page)).toBeCloseTo(middle, 0);
    await expect(radio(page, "long")).toBeChecked();
    await pick(page, "short");
    await drag(page, 120);
    await expect.poll(() => chevronX(page)).toBeCloseTo(X.middle, 0);
  });
});

test.describe("drag hint", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });

  test("tooltip, resize cursor, and a tug on the first three visits only", async ({ page }) => {
    await open(page);
    await expect(link(page)).toHaveAttribute("title", "Drag sideways to resize");
    expect(await link(page).evaluate((el) => getComputedStyle(el).cursor)).toBe("ew-resize");
    await expect(logo(page)).toHaveAttribute("data-hint", "");
    expect(await page.locator(`${SIGN} .bl-right`).evaluate((el) => getComputedStyle(el).animationName)).toBe("logo-hint");
    await page.reload();
    await page.reload();
    await expect(logo(page)).toHaveAttribute("data-hint", "");
    await page.reload();
    await expect(logo(page)).not.toHaveAttribute("data-hint");
  });

  test("no tug once a form is picked, and the hover tug points the way the logo can still grow", async ({ page }) => {
    await open(page);
    await pick(page, "long");
    await page.reload();
    await link(page).scrollIntoViewIfNeeded();
    await expect(logo(page)).not.toHaveAttribute("data-hint");
    await link(page).hover();
    await expect.poll(() => page.locator(`${SIGN} .bl-right`).evaluate((el) => parseFloat(getComputedStyle(el).translate))).toBeLessThan(0);
  });

  test("reduced motion: no tug at all, the tooltip stays", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await link(page).hover();
    const right = page.locator(`${SIGN} .bl-right`);
    expect(await right.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await right.evaluate((el) => getComputedStyle(el).translate)).toBe("none");
    await expect(link(page)).toHaveAttribute("title", "Drag sideways to resize");
  });
});
