import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import hubProjects from "./fixtures/hub-projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Two pages: Project Hub ("/", "/p/<name>") and Developer ("/dev/", "/dev/p/<name>"); the header switch, old-link redirects,
// the generated showcase page, stage chips, freshness, gaps, the README embed snippet.
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
const sitenav = (page: Page) => page.locator(".sitenav:visible");
const errors = (page: Page) => {
  const bad: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") bad.push(m.text()); });
  page.on("pageerror", (e) => bad.push(e.message));
  return bad;
};

for (const width of [390, 1280]) {
  test(`${width}: header switch links the two pages and marks the current one`, async ({ page }) => {
    const bad = errors(page);
    await page.setViewportSize({ width, height: 900 });
    await open(page, "/");
    await expect(sitenav(page)).toHaveCount(1); // exactly one visible (header on wide, page top on phones)
    const hub = sitenav(page).getByRole("link", { name: "Project Hub" }), dev = sitenav(page).getByRole("link", { name: "Developer" });
    await expect(hub).toHaveAttribute("aria-current", "page");
    await expect(dev).not.toHaveAttribute("aria-current", /.*/);
    await expect(page.locator("#hub .hb-card, #hub .hb-spot")).toHaveCount(4); // 2 in the spotlight (featured) + the other 2
    await expect(page.locator("#projects, #bento, #activity, #status")).toHaveCount(0); // developer sections live on /dev/ only
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dev.click();
    await expect(page).toHaveURL(/\/dev\/$/);
    await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
    await expect(page.locator(".proj")).toHaveCount(4);
    await expect(sitenav(page)).toHaveCount(1);
    await expect(sitenav(page).getByRole("link", { name: "Developer" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#showcase, #hub")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sitenav(page).getByRole("link", { name: "Project Hub" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#hub .hb-spot").first()).toBeVisible();
    expect(bad).toEqual([]);
  });
}

test("old dashboard links on / go to /dev/, keeping query and hash; ?mode=showcase is dropped", async ({ page }) => {
  await open(page, "/?sort=name&lang=Go");
  await expect(page).toHaveURL(/\/dev\/\?sort=name&lang=Go$/);
  await expect(page.locator(".proj").first()).toBeVisible();
  await open(page, "/?mode=dev");
  await expect(page).toHaveURL(/\/dev\/$/);
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, "/#p/Gamma");
  await expect(page).toHaveURL(/\/dev\/p\/Gamma$/); // the dev router turns the legacy hash into its path
  await open(page, "/?mode=showcase");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hub .hb-spot").first()).toBeVisible();
  await open(page, "/p/Alpha");
  await expect(page).toHaveURL(/\/p\/Alpha$/);
});

// Visitor-facing pages must read like a portfolio: no health numbers. "npm ci" in a command is fine, so CI is matched case-sensitively.
async function noNumbers(page: Page, sel: string) {
  const t = await page.locator(sel).innerText();
  expect(t).not.toMatch(/\b(stars?|forks?|commits?|uptime|lines changed|LOC|latency)\b/i);
  expect(t).not.toMatch(/\bCI\b/);
  expect(t).not.toMatch(/\d\s?%/);
}

test("hub home: intro, spotlight bento, gallery of the rest, archive; pictures or a name tile; clear actions", async ({ page }) => {
  const bad = errors(page);
  await open(page, "/", hubProjects);
  await expect(page.locator(".hb-display")).toHaveText("Projects by Vin");
  await expect(page.locator(".hb-count")).toHaveText("10 projects"); // archived not counted
  const spot = page.locator(".hb-spotlight");
  await expect(spot.locator(".hb-name")).toHaveText(["Alpha", "Beta <b>x</b>"]); // featured, in gallery order
  await expect(spot.locator(".hb-spot--big .hb-name")).toHaveText("Alpha");
  const alpha = spot.locator(".hb-spot").first();
  await expect(alpha.locator(".hb-media img")).toHaveAttribute("src", /^\/shot\/Alpha\.jpg/); // snapshot wins
  await expect(alpha.locator(".hb-media img")).toHaveAttribute("alt", "Screenshot of Alpha");
  await expect(alpha.locator(".hb-media .hb-tile")).toHaveCount(1); // the name tile sits under the picture while it loads
  await expect(alpha.locator(".hb-kind")).toHaveText("Web app");
  const tryIt = alpha.getByRole("link", { name: "Try it" });
  await expect(tryIt).toHaveAttribute("href", "https://alpha.example.com");
  await expect(tryIt).toHaveAttribute("target", "_blank");
  await expect(tryIt).toHaveAttribute("rel", /noopener/);
  // Gallery: everything else, newest first; spotlight projects are not repeated.
  await expect(page.locator(".hb-results .hb-h")).toHaveText("More projects");
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Eta", "Delta", "Epsilon Parser", "Theta", "NoSite", "Zeta", "Iota", "Gamma"]);
  const delta = page.locator(".hb-results .hb-card", { hasText: "Delta" });
  await expect(delta.locator(".hb-kind")).toHaveText("Browser extension");
  await expect(delta.locator(".hb-chip")).toHaveText(["JavaScript", "HTML", "chrome-extension", "manifest-v3"]); // names, never percentages
  await expect(delta.locator(".hb-when")).toHaveText(/^Updated /);
  await expect(delta.getByRole("link", { name: "Try it" })).toHaveCount(0);
  await expect(delta.getByRole("link", { name: "View project: Delta" })).toHaveAttribute("href", "/p/Delta");
  const zeta = page.locator(".hb-results .hb-card", { hasText: "Zeta" });
  await expect(zeta.locator(".hb-tile")).toContainText("Zeta"); // no picture: typographic tile, never a fake one
  await expect(zeta.locator(".hb-kind")).toHaveText("Experiment");
  const eps = page.locator(".hb-results .hb-card", { hasText: "Epsilon" });
  await expect(eps.locator(".hb-kind")).toHaveText("Library or tool");
  await expect(eps.locator(".hb-repo")).toHaveText("Epsilon"); // README title as the heading, repo name beneath
  await expect(eps.locator(".hb-blurb")).toHaveText("Epsilon parses things in tests."); // no description: the summary's first sentence
  const arch = page.locator(".hb-arch");
  await expect(arch.locator(".hb-card")).toBeHidden();
  await arch.locator("summary").click();
  await expect(arch.locator(".hb-name")).toHaveText("OldThing");
  await noNumbers(page, "#hub");
  // The whole card opens the story page; so does its link.
  await zeta.locator(".hb-blurb, .hb-card__body").first().click();
  await expect(page).toHaveURL(/\/p\/Zeta$/);
  await expect(page.locator("#pp h1")).toHaveText("Zeta");
  await page.getByRole("link", { name: "← All projects" }).click();
  await alpha.getByRole("link", { name: "Details about Alpha" }).click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(page).toHaveTitle("Alpha · DevPulse");
  expect(bad).toEqual([]);
});

test("hub home: kind tabs, search and order (URL round trip, back from a story page, empty state, / shortcut)", async ({ page }) => {
  await open(page, "/", hubProjects);
  const tabs = page.getByRole("group", { name: "Show" }).getByRole("button");
  await expect(tabs).toHaveText(["All", "Web apps", "Extensions", "Libraries & tools", "Experiments"]);
  await expect(tabs.first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Experiments" }).click();
  await expect(page).toHaveURL(/\/\?kind=exp$/);
  await expect(page.getByRole("button", { name: "Experiments" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hb-spotlight")).toBeHidden();
  await expect(page.locator(".hb-results .hb-h")).toHaveText("Experiments");
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["NoSite", "Zeta"]);
  await expect(page.locator(".hb-count")).toHaveText("2 of 10 projects");
  await page.getByRole("button", { name: "Web apps" }).click();
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Alpha", "Eta", "Beta <b>x</b>", "Iota", "Gamma"]);
  await page.getByRole("combobox", { name: "Sort" }).selectOption("az");
  await expect(page).toHaveURL(/kind=web&order=az$/);
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Alpha", "Beta <b>x</b>", "Eta", "Gamma", "Iota"]);
  await page.getByRole("link", { name: "Details about Eta" }).click();
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/\?kind=web&order=az$/);
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Alpha", "Beta <b>x</b>", "Eta", "Gamma", "Iota"]);
  // Search (debounced), "/" focuses it, Escape clears; ?search= survives a reload and is not sent to /dev/.
  await open(page, "/", hubProjects);
  await page.keyboard.press("/");
  const box = page.getByRole("searchbox", { name: "Search projects" });
  await expect(box).toBeFocused();
  await box.fill("parser");
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Epsilon Parser"]);
  await expect(page).toHaveURL(/\/\?search=parser$/);
  await expect(page.locator(".hb-results .hb-h")).toHaveText("Search results");
  await box.fill("no such thing");
  await expect(page.locator(".hb-empty")).toContainText("No projects match that.");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(box).toHaveValue("");
  await expect(page.locator(".hb-spotlight")).toBeVisible();
  await open(page, "/?search=webgl2", hubProjects);
  await expect(page).toHaveURL(/\/\?search=webgl2$/);
  await expect(page.locator(".hb-results .hb-name")).toHaveText(["Eta"]);
  await box.press("Escape");
  await expect(page.locator(".hb-results .hb-name")).toHaveCount(8);
});

test("story page: case-study layout with real sections for a rich repo, none invented for a bare repo, no health numbers", async ({ page }) => {
  const bad = errors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/p/Alpha", hubProjects);
  const pp = page.locator("#pp");
  await expect(pp.locator("h1")).toHaveText("Alpha");
  await expect(pp.locator(".hb-kind").first()).toHaveText("Web app");
  await expect(pp.locator(".hb-tagline")).toHaveText("Alpha ships tiny tools fast");
  const tryIt = pp.getByRole("link", { name: "Try it live" });
  await expect(tryIt).toHaveAttribute("href", "https://alpha.example.com");
  await expect(tryIt).toHaveAttribute("rel", /noopener/);
  await expect(pp.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", "https://github.com/vincentwesley/alpha");
  await expect(pp.locator(".hb-fact dt")).toHaveText(["Kind", "Built with", "Latest release", "Activity"]);
  await expect(pp.locator(".hb-fact dd").nth(2)).toHaveText("v1.2.0 · 2026-10-01");
  await expect(pp.locator(".hb-main-pic img")).toHaveAttribute("src", /^\/shot\/Alpha\.jpg/);
  await expect(pp.locator(".hb-thumb")).toHaveCount(3); // cover + 2 README screenshots
  await expect(pp.locator(".hb-content .hb-sh")).toHaveText(["Overview", "Highlights", "How to try it", "Built with"]);
  await expect(pp.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveText(["Overview", "Highlights", "How to try it", "Built with"]);
  await expect(pp.locator(".hb-feat").nth(1)).toHaveText("Zero <script>alert(1)</script> config"); // text, never markup
  await expect(pp.locator(".hb-s-built .hb-chip")).toHaveText(["TypeScript", "CSS", "vite", "cloudflare"]);
  await expect(pp.locator(".hb-s-built")).toContainText("MIT license");
  await expect(pp.locator(".hb-steps li")).toHaveCount(3);
  await expect(pp.locator(".hb-code code")).toHaveText("npm ci\nnpm run dev");
  await expect(pp.getByRole("navigation", { name: "More projects" }).getByRole("link")).toHaveCount(2);
  await expect(pp.locator(".hb-related .hb-name")).not.toHaveCount(0);
  await noNumbers(page, "#pp");
  expect(await page.evaluate(() => (window as { __pwn?: number }).__pwn)).toBeUndefined();
  await pp.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Built with" }).click();
  await expect(pp.locator("#hb-sh-built")).toBeFocused();

  await open(page, "/p/Delta", hubProjects); // extension: store link instead of "Try it live"; "Label: text" highlights get a title
  await expect(pp.getByRole("link", { name: "Get the extension" })).toHaveAttribute("href", "https://chromewebstore.google.com/detail/delta/fixture");
  await expect(pp.getByRole("link", { name: "Try it live" })).toHaveCount(0);
  await expect(pp.locator(".hb-feat__t")).toHaveText(["Reader view", "Pause on this site"]);

  await open(page, "/p/Epsilon", hubProjects); // README title + repo name, pitch from the summary, how it works before how to try it
  await expect(pp.locator("h1")).toHaveText("Epsilon Parser");
  await expect(pp.locator(".hb-hero .hb-repo")).toHaveText("Epsilon");
  await expect(pp.locator(".hb-tagline")).toHaveText("Epsilon parses things in tests.");
  await expect(page).toHaveTitle("Epsilon Parser · DevPulse");
  await expect(pp.locator(".hb-content .hb-sh")).toHaveText(["Overview", "How it works", "How to try it", "Built with"]);
  await expect(pp.locator(".hb-how li")).toHaveText(["It tokenises the input.", "Then it builds a tree."]);

  await open(page, "/p/Zeta", hubProjects);
  await expect(pp.locator("h1")).toHaveText("Zeta");
  await expect(pp.locator(".hb-content .hb-sh")).toHaveText(["Built with"]); // only what the repo has
  await expect(pp.getByRole("navigation", { name: "On this page" })).toHaveCount(0);
  await expect(pp.getByRole("link", { name: "Try it live" })).toHaveCount(0);
  await expect(pp.locator(".hb-main-tile")).toHaveCount(1); // no picture: a banner in the project's colours
  await noNumbers(page, "#pp");
  await pp.getByRole("link", { name: /^Next project/ }).click();
  await expect(page).toHaveURL(/\/p\/Iota$/);

  await open(page, "/p/Nope", hubProjects);
  await expect(pp.locator("h1")).toHaveText("Project not found");
  await expect(page).toHaveTitle(/^Not found/);
  expect(bad).toEqual([]);
});

test("story page: Developer view opens the project on the Developer page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, "/p/Alpha");
  await page.getByRole("link", { name: "Developer view" }).click();
  await expect(page).toHaveURL(/\/dev\/p\/Alpha$/);
  await expect(page.locator("#pp .dt-title")).toHaveText("Alpha");
  await expect(page.locator("#pp .hb-story")).toHaveCount(0);
});

test("story page: copy commands", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/p/Alpha");
  await page.getByRole("button", { name: "Copy Alpha commands" }).click();
  await expect(page.locator(".hb-code .hb-note")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm ci\nnpm run dev");
});

test("picture viewer: opens, arrows page, Escape closes, focus returns", async ({ page }) => {
  await open(page, "/p/Alpha");
  const first = page.getByRole("button", { name: "View larger: Alpha main screen" });
  await first.click();
  const dlg = page.getByRole("dialog", { name: "Picture viewer" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".lbx__pos")).toHaveText("3 of 4"); // snapshot, cover, then the README screenshots
  await expect(dlg.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".lbx__pos")).toHaveText("4 of 4");
  await expect(dlg.locator(".lbx__cap")).toHaveText("Alpha settings");
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".lbx__pos")).toHaveText("1 of 4");
  await page.keyboard.press("ArrowLeft");
  await expect(dlg.locator(".lbx__pos")).toHaveText("4 of 4");
  expect((await new AxeBuilder({ page }).include(".lbx").analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(first).toBeFocused();
});

test("developer page: stage chip, stale marker, gaps, checked time, stage filter, hygiene tile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/dev/");
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
  await open(page, "/dev/p/Alpha");
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

  await open(page, "/dev/p/NoSite");
  await expect(pane.locator(".dt-gaps li")).toHaveText(["README explanation", "README screenshot", "About description", "Website field", "Topics"]);
});

for (const theme of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    for (const url of ["/", "/p/Alpha", "/p/NoSite", "/dev/", "/dev/p/Alpha"]) {
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
for (const url of ["/", "/p/Alpha", "/dev/"]) {
  test(`390 ${url}: new controls are >= 44px targets`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, url);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>(".sitenav a, .hb-card a, .hb-spot a, .hb-tab, .hb-search__in, .hb-order__sel, .hb-me a, .hb-story a:not(.hb-toc a), .hb-story button, .hb-arch summary, .lg-stage, .hyg__btn, .snip button")) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || e.closest("[hidden]")) continue;
        e.scrollIntoView({ block: "center", behavior: "instant" });
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
        const okW = r.width >= 43.5 || (hit(cx - 21.5, cy) && hit(cx + 21.5, cy));
        const okH = r.height >= 43.5 || (hit(cx, cy - 21.5) && hit(cx, cy + 21.5));
        if (!okW || !okH) bad.push(`${e.className} "${(e.textContent ?? "").trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad;
    });
    expect(small).toEqual([]);
  });
}

test("Project Hub raises no CSP / Trusted Types violations", async ({ page, request }) => {
  const csp = (await (await request.get("/_headers")).text()).match(/Content-Security-Policy:\s*(.+)/)![1].trim();
  const bad: string[] = [];
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (e) => console.error("CSPV " + e.violatedDirective + " " + e.blockedURI)));
  page.on("console", (m) => { if (/CSPV|Content Security Policy|Trusted Type/i.test(m.text())) bad.push(m.text()); });
  await page.route("**/p/**", async (r) => {
    if (r.request().resourceType() !== "document") return r.fallback();
    const res = await r.fetch(); // vite preview serves the hub shell for /p/<name> (vite.config.ts "pages"); add the production CSP
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
  });
  await open(page, "/p/Alpha");
  await page.getByRole("button", { name: "View larger: Alpha main screen" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Copy Alpha commands" }).click();
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page.locator("#hub .hb-card, #hub .hb-spot")).toHaveCount(4);
  expect(bad).toEqual([]);
});
