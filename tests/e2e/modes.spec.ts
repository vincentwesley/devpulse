import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Developer / Showcase modes, the generated showcase page, stage chips, freshness, gaps, the README embed snippet.
test.use({ serviceWorkers: "block" });

// 1x1 PNG for /img/* and /shot/* (vite preview has no Worker).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
type P = (typeof projects)[number];
async function open(page: Page, url: string, ps: unknown[] = projects) {
  const bodies: Record<string, unknown> = { projects: ps, heatmap, commits, posts, stats, languages, status };
  await page.route("**/api/*", (r) => r.fulfill({ json: bodies[new URL(r.request().url()).pathname.split("/").pop()!] ?? [] }));
  await page.route(/\/(img|shot)\//, (r) => r.fulfill({ body: PNG, contentType: "image/png" }));
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}
const toggle = (page: Page) => page.locator(".modesw:visible");
const errors = (page: Page) => {
  const bad: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") bad.push(m.text()); });
  page.on("pageerror", (e) => bad.push(e.message));
  return bad;
};

for (const width of [390, 1280]) {
  test(`${width}: mode toggle switches views, keeps the URL and persists`, async ({ page }) => {
    const bad = errors(page);
    await page.setViewportSize({ width, height: 900 });
    await open(page, "/");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dev");
    await expect(toggle(page)).toHaveCount(1); // exactly one control visible (header on wide, page top on phones)
    const dev = toggle(page).getByRole("button", { name: /^Dev/ }), show = toggle(page).getByRole("button", { name: /^Show/ });
    await expect(dev).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#projects")).toBeVisible();
    await expect(page.locator("#showcase")).toBeHidden();
    await show.click();
    await expect(show).toHaveAttribute("aria-pressed", "true");
    await expect(dev).toHaveAttribute("aria-pressed", "false");
    await expect(page).toHaveURL(/\?mode=showcase$/);
    await expect(page.locator("#showcase .sg-card")).toHaveCount(4);
    await expect(page.locator("#projects, #bento, #activity, #status")).toHaveCount(4);
    for (const id of ["projects", "bento", "activity", "status"]) await expect(page.locator(`#${id}`)).toBeHidden();
    await page.goto("/"); // no ?mode: the stored choice applies
    await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "showcase");
    await expect(page.locator("#showcase .sg-card").first()).toBeVisible();
    await toggle(page).getByRole("button", { name: /^Dev/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".proj")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(bad).toEqual([]);
  });
}

test("?mode=dev in the URL beats a stored showcase choice", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mode", "showcase"));
  await open(page, "/?mode=dev");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dev");
});

test("gallery: featured first, then newest push; real images or a name tile; archive group; live link", async ({ page }) => {
  const ps = [...projects, { ...projects[2], repo: "vincentwesley/old", name: "OldThing", archived: true, stage: "archived" }] as P[];
  await open(page, "/?mode=showcase", ps);
  const cards = page.locator("#showcase .sg-grid").first().locator(".sg-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator(".sg-link")).toHaveText(["Alpha", "Beta <b>x</b>", "NoSite", "Gamma"]);
  await expect(cards.nth(0).locator("img.sg-media")).toHaveAttribute("src", /^\/shot\/Alpha\.jpg/); // snapshot wins
  await expect(cards.nth(2).locator(".sg-tile")).toContainText("NoSite"); // no image: typographic tile, no fake picture
  await expect(cards.nth(0).locator(".stg")).toHaveText("Live");
  await expect(cards.nth(0).getByRole("link", { name: "Live site" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(page.locator("#sg-count")).toHaveText("4 projects · 1 archived");
  const arch = page.locator(".sg-arch");
  await expect(arch.locator("summary")).toHaveText("Archive (1)");
  await expect(arch.locator(".sg-card")).toBeHidden();
  await arch.locator("summary").click();
  await expect(arch.locator(".sg-link")).toHaveText("OldThing");
  await cards.nth(1).locator(".sg-blurb").click({ force: true }); // the stretched link covers the whole card: a click anywhere opens the showcase
  await expect(page).toHaveURL(/\/p\/Beta%20%3Cb%3Ex%3C%2Fb%3E\?mode=showcase$/);
  await expect(page.locator("#pp h1")).toHaveText("Beta <b>x</b>");
});

test("showcase page: generated sections for a rich repo, hidden ones for a bare repo", async ({ page }) => {
  const bad = errors(page);
  await open(page, "/p/Alpha?mode=showcase");
  const pp = page.locator("#pp");
  await expect(pp.locator("h1")).toHaveText("Alpha");
  await expect(pp.locator(".sp-h")).toHaveText(["What it does", "Highlights", "Screenshots", "Built with", "Run it", "By the numbers", "Recent changes"]);
  await expect(pp.locator(".sp-hl li").nth(1)).toHaveText("Zero <script>alert(1)</script> config"); // text, never markup
  await expect(pp.locator(".sp-steps li")).toHaveCount(3);
  await expect(pp.locator(".sp-cmds code")).toHaveText("npm ci\nnpm run dev");
  await expect(pp.locator(".sp-legend")).toContainText("TypeScript 70.0%");
  await expect(pp.getByRole("link", { name: "Open live site" })).toHaveAttribute("href", "https://alpha.example.com");
  await expect(pp.locator(".sp-src")).toContainText("Generated from the repo's README");
  await expect(page.locator("#detail-pane")).toBeHidden(); // showcase is a full page even on desktop

  await open(page, "/p/NoSite?mode=showcase");
  await expect(pp.locator("h1")).toHaveText("NoSite");
  await expect(pp.locator(".sp-h")).toHaveText(["By the numbers"]); // nothing invented: no README summary, highlights, screenshots, languages, run steps or commits
  await expect(pp.getByRole("link", { name: "Open live site" })).toHaveCount(0);
  await expect(pp.locator(".sg-tile")).toHaveCount(1);
  expect(bad).toEqual([]);
});

test("showcase page: Developer view switches mode in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, "/p/Alpha?mode=showcase");
  await page.getByRole("button", { name: "Developer view" }).click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(page.locator("#pp .dt-title")).toHaveText("Alpha");
  await expect(page.locator("#pp .dt-title")).toBeFocused();
  await expect(page.locator("#pp .sp")).toHaveCount(0);
});

test("screenshot lightbox: opens, arrows page, Escape closes, focus returns", async ({ page }) => {
  await open(page, "/p/Alpha?mode=showcase");
  const first = page.getByRole("button", { name: "View larger: Alpha main screen" });
  await first.click();
  const dlg = page.getByRole("dialog", { name: "Screenshot viewer" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".lbx__pos")).toHaveText("1 of 2");
  await expect(dlg.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".lbx__pos")).toHaveText("2 of 2");
  await expect(dlg.locator(".lbx__cap")).toHaveText("Alpha settings");
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".lbx__pos")).toHaveText("1 of 2");
  expect((await new AxeBuilder({ page }).include(".lbx").analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(first).toBeFocused();
});

test("developer mode: stage chip, stale marker, gaps, checked time, stage filter, hygiene tile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/");
  const beta = page.locator(".proj", { hasText: "Beta" });
  await expect(beta.locator(".stg")).toHaveText("Live, down");
  await expect(beta.locator(".stalemark")).toHaveAttribute("title", "Stale: uptime check overdue");
  await expect(beta.locator(".gapmark")).toHaveAttribute("title", "Missing: Website field, Topics");
  await expect(beta.locator(".gapmark .sr-only")).toHaveText(", missing: Website field, Topics");
  await expect(beta.locator(".lg-chk")).toHaveText(/^checked /);
  await page.locator(".lg-stage").selectOption("quiet");
  await expect(page.locator(".proj")).toHaveCount(1);
  await expect(page).toHaveURL(/stage=quiet/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".proj")).toHaveCount(4);
  const hyg = page.locator("#tile-hygiene");
  await expect(hyg.locator(".hyg__sum")).toHaveText("8 gaps across 3 of 4 repos");
  await hyg.getByRole("button", { name: "Show repos with gaps" }).click();
  await expect(page.locator(".proj")).toHaveCount(3);
  await expect(page.locator(".lg-stage")).toHaveValue("gaps");
});

test("detail: snapshot, freshness, gaps and README embed snippet with copy", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/p/Alpha");
  const pane = page.locator("#detail-pane");
  await expect(pane.locator("img.sc-shot")).toHaveAttribute("src", /^\/shot\/Alpha\.jpg/);
  await expect(pane.locator("img.sc-shot")).toHaveAttribute("alt", "Screenshot of Alpha's live site");
  const fresh = pane.locator(".dt-fresh");
  await expect(fresh).toContainText("Repo checked");
  await expect(fresh).toContainText("Snapshot taken");
  await expect(fresh).toContainText("found via GitHub Website field");
  const snip = pane.locator(".snip");
  await expect(snip.locator("code")).toContainText("<!-- devpulse:start -->");
  await snip.getByRole("button", { name: "Copy Alpha README embed snippet" }).click();
  await expect(snip.locator(".hub-note")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/card/Alpha.svg");

  await open(page, "/p/NoSite");
  await expect(pane.locator(".dt-gaps li")).toHaveText(["README explanation", "README screenshot", "About description", "Website field", "Topics"]);
});

for (const theme of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    for (const url of ["/?mode=showcase", "/p/Alpha?mode=showcase", "/p/NoSite?mode=showcase", "/", "/p/Alpha"]) {
      test(`axe ${theme} ${width} ${url}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
        await page.setViewportSize({ width, height: 900 });
        await open(page, url);
        await page.locator(".creator").scrollIntoViewIfNeeded();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}

// Same probe as taptargets.spec.ts, limited to the new controls.
for (const url of ["/?mode=showcase", "/p/Alpha?mode=showcase", "/"]) {
  test(`390 ${url}: new controls are >= 44px targets`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, url);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>(".modesw__b, .sg-link, .sg-live, .sp a, .sp button, .sg-arch summary, .lg-stage, .hyg__btn, .snip button")) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || e.closest("[hidden]")) continue;
        e.scrollIntoView({ block: "center", behavior: "instant" });
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || (e.matches(".sg-link") && !!t.closest(".sg-card"))); };
        const okW = r.width >= 43.5 || (hit(cx - 21.5, cy) && hit(cx + 21.5, cy));
        const okH = r.height >= 43.5 || (hit(cx, cy - 21.5) && hit(cx, cy + 21.5));
        if (!okW || !okH) bad.push(`${e.className} "${(e.textContent ?? "").trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad;
    });
    expect(small).toEqual([]);
  });
}

test("showcase mode raises no CSP / Trusted Types violations", async ({ page, request }) => {
  const csp = (await (await request.get("/_headers")).text()).match(/Content-Security-Policy:\s*(.+)/)![1].trim();
  const bad: string[] = [];
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  page.on("console", (m) => { if (/CSPV|Content Security Policy|Trusted Type/i.test(m.text())) bad.push(m.text()); });
  await page.route("**/p/**", async (r) => {
    if (r.request().resourceType() !== "document") return r.fallback();
    const res = await r.fetch({ url: new URL("/", r.request().url()).href }); // vite preview has no /p/ route: serve the shell like the Worker
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
  });
  await open(page, "/p/Alpha?mode=showcase");
  await page.getByRole("button", { name: "View larger: Alpha main screen" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Copy Alpha commands" }).click();
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page.locator("#showcase .sg-card")).toHaveCount(4);
  expect(bad).toEqual([]);
});
