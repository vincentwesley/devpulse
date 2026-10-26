import { expect, test, type Page } from "@playwright/test";
import commits from "./fixtures/commits.json" with { type: "json" };
import heatmap from "./fixtures/heatmap.json" with { type: "json" };
import posts from "./fixtures/posts.json" with { type: "json" };
import languages from "./fixtures/languages.json" with { type: "json" };
import projects from "./fixtures/projects.json" with { type: "json" };
import stats from "./fixtures/stats.json" with { type: "json" };
import status from "./fixtures/status.json" with { type: "json" };

// Every interactive element is a >= 44px target on phones: its box, or its ::after hit area, covers 44px each way.
test.use({ serviceWorkers: "block" });

const bodies: Record<string, unknown> = { projects, heatmap, commits, posts, stats, languages, status };
async function open(page: Page, url: string) {
  await page.route("**/api/*", (r) => r.fulfill({ json: bodies[new URL(r.request().url()).pathname.split("/").pop()!] ?? [] }));
  await page.goto(url);
  await expect(page.locator("body")).toHaveAttribute("data-loaded", "1");
}

// Probe: does elementFromPoint 21.5px out from the centre still land on the element? Inline links in prose and the skip link are exempt.
const offenders = (page: Page) => page.evaluate(() => {
  const bad: string[] = [];
  const sel = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex='-1'])";
  for (const e of document.querySelectorAll<HTMLElement>(sel)) {
    if (e.matches(".skip") || (e.matches("a") && e.closest("p")) || e.closest("[hidden], dialog:not([open])") || e.closest("svg.heat")) continue; // dense read-only heatmap cells: roving-focus readout, not controls
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    e.scrollIntoView({ block: "center", behavior: "instant" });
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
    const dense = e.matches(".st__bar, .hub-chart g"); // 30-90 slim bars per row: 44px tall hit area, width cannot be
    const okW = dense || r.width >= 43.5 || (hit(cx - 21.5, cy) && hit(cx + 21.5, cy));
    const okH = r.height >= 43.5 || (hit(cx, cy - 21.5) && hit(cx, cy + 21.5));
    if (!okW || !okH) bad.push(`${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).trim().split(/\s+/).join(".") : ""} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return bad;
});

for (const width of [360, 390]) {
  for (const url of ["/", "/p/Alpha"]) {
    test(`${width} ${url}: no tap target under 44px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, url);
      expect(await offenders(page)).toEqual([]);
    });
  }
}
