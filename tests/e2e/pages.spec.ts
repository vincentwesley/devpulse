import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
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
    await expect(page.locator("#hub .hb-card")).toHaveCount(4);
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
    await expect(page.locator("#hub .hb-card").first()).toBeVisible();
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
  await expect(page.locator("#hub .hb-card").first()).toBeVisible();
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

test("hub home: featured, more projects, archive; pictures or a name tile; two clear actions per card", async ({ page }) => {
  const bad = errors(page);
  const ps = [...projects, { ...projects[2], repo: "vincentwesley/old", name: "OldThing", archived: true, stage: "archived" }] as P[];
  await open(page, "/", ps);
  await expect(page.locator("#hub .hb-count")).toHaveText("4 projects");
  const feat = page.locator(".hb-sec", { has: page.getByRole("heading", { name: "Featured" }) });
  await expect(feat.locator(".hb-name")).toHaveText(["Alpha", "Beta <b>x</b>"]);
  const more = page.locator(".hb-sec", { has: page.getByRole("heading", { name: "More projects" }) });
  await expect(more.locator(".hb-name")).toHaveText(["NoSite", "Gamma"]);
  const alpha = feat.locator(".hb-card").first();
  await expect(alpha.locator("img.hb-media")).toHaveAttribute("src", /^\/shot\/Alpha\.jpg/); // snapshot wins
  await expect(alpha.locator("img.hb-media")).toHaveAttribute("alt", "Screenshot of Alpha");
  await expect(alpha.locator(".hb-tag")).toHaveText(["Live site", "v1.2.0"]);
  await expect(alpha.locator(".hb-langs li")).toHaveText(["TypeScript", "CSS"]);
  await expect(alpha.locator(".hb-when")).toHaveText(/^Updated /);
  const tryIt = alpha.getByRole("link", { name: "Try it" });
  await expect(tryIt).toHaveAttribute("href", "https://alpha.example.com");
  await expect(tryIt).toHaveAttribute("target", "_blank");
  await expect(tryIt).toHaveAttribute("rel", /noopener/);
  const nosite = more.locator(".hb-card").first();
  await expect(nosite.locator(".hb-tile")).toContainText("NoSite"); // no image: typographic tile, never a fake picture
  await expect(nosite.locator(".hb-tag")).toHaveText(["Project"]);
  await expect(nosite.getByRole("link", { name: "Try it" })).toHaveCount(0);
  const arch = page.locator(".hb-arch");
  await expect(arch.locator(".hb-card")).toBeHidden();
  await arch.locator("summary").click();
  await expect(arch.locator(".hb-name")).toHaveText("OldThing");
  await noNumbers(page, "#hub");
  await alpha.getByRole("link", { name: "Read more about Alpha" }).click();
  await expect(page).toHaveURL(/\/p\/Alpha$/);
  await expect(page.locator("#pp h1")).toHaveText("Alpha");
  await expect(page).toHaveTitle("Alpha · DevPulse");
  expect(bad).toEqual([]);
});

test("hub home: kind filter chips (aria-pressed, ?kind= in the URL, survives the story page round trip)", async ({ page }) => {
  await open(page, "/");
  const chips = page.getByRole("group", { name: "Show" }).getByRole("button");
  await expect(chips).toHaveText(["All", "Live sites", "Other"]); // no extensions in the fixture: no empty chip
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Other" }).click();
  await expect(page).toHaveURL(/\/\?kind=other$/);
  await expect(page.getByRole("button", { name: "Other" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Other" })).toBeFocused();
  await expect(page.locator("#hub .hb-name")).toHaveText(["NoSite"]);
  await expect(page.getByRole("heading", { name: "Featured" })).toHaveCount(0);
  await page.getByRole("button", { name: "Live sites" }).click();
  await expect(page.locator("#hub .hb-name")).toHaveText(["Alpha", "Beta <b>x</b>", "Gamma"]);
  await page.getByRole("link", { name: "Read more about Gamma" }).click();
  await page.getByRole("link", { name: "← All projects" }).click();
  await expect(page).toHaveURL(/\/\?kind=live$/);
  await expect(page.locator("#hub .hb-name")).toHaveText(["Alpha", "Beta <b>x</b>", "Gamma"]);
  await open(page, "/?kind=other"); // direct load keeps the filter (hub-redirect.js leaves ?kind alone)
  await expect(page).toHaveURL(/\/\?kind=other$/);
  await expect(page.locator("#hub .hb-name")).toHaveText(["NoSite"]);
});

test("story page: real sections for a rich repo, none invented for a bare repo, no health numbers", async ({ page }) => {
  const bad = errors(page);
  await open(page, "/p/Alpha");
  const pp = page.locator("#pp");
  await expect(pp.locator("h1")).toHaveText("Alpha");
  await expect(pp.locator(".hb-tagline")).toHaveText("Alpha ships tiny tools fast");
  await expect(pp.locator(".hb-sh")).toHaveText(["What it is", "What it can do", "Gallery", "Built with", "Try it yourself", "Latest release"]);
  await expect(pp.locator(".hb-feats li").nth(1)).toHaveText("Zero <script>alert(1)</script> config"); // text, never markup
  await expect(pp.locator(".hb-gal li")).toHaveCount(2); // README screenshots; the snapshot is already the hero
  await expect(pp.locator(".hb-s-built .hb-tag")).toHaveText(["TypeScript", "CSS", "vite", "cloudflare"]);
  await expect(pp.locator(".hb-s-built")).toContainText("MIT license");
  await expect(pp.locator(".hb-steps li")).toHaveCount(3);
  await expect(pp.locator(".hb-code code")).toHaveText("npm ci\nnpm run dev");
  await expect(pp.locator(".hb-s-release")).toContainText("v1.2.0, released 2026-10-01");
  const tryIt = pp.getByRole("link", { name: "Try it" });
  await expect(tryIt).toHaveAttribute("href", "https://alpha.example.com");
  await expect(tryIt).toHaveAttribute("rel", /noopener/);
  await expect(pp.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", "https://github.com/vincentwesley/alpha");
  await noNumbers(page, "#pp");
  expect(await page.evaluate(() => (window as { __pwn?: number }).__pwn)).toBeUndefined();

  await open(page, "/p/NoSite");
  await expect(pp.locator("h1")).toHaveText("NoSite");
  await expect(pp.locator(".hb-sh")).toHaveCount(0); // no README, highlights, pictures, languages, steps or release: nothing made up
  await expect(pp.getByRole("link", { name: "Try it" })).toHaveCount(0);
  await expect(pp.locator(".hb-tile")).toHaveCount(1);
  await noNumbers(page, "#pp");

  await open(page, "/p/Nope");
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
  await expect(dlg.locator(".lbx__pos")).toHaveText("1 of 2");
  await expect(dlg.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dlg.locator(".lbx__pos")).toHaveText("2 of 2");
  await expect(dlg.locator(".lbx__cap")).toHaveText("Alpha settings");
  await page.keyboard.press("ArrowLeft");
  await expect(dlg.locator(".lbx__pos")).toHaveText("1 of 2");
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
      for (const e of document.querySelectorAll<HTMLElement>(".sitenav a, .hb-card a, .hb-chip, .hb-story a, .hb-story button, .hb-arch summary, .lg-stage, .hyg__btn, .snip button")) {
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
  await expect(page.locator("#hub .hb-card")).toHaveCount(4);
  expect(bad).toEqual([]);
});
