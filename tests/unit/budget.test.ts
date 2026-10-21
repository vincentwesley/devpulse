import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduled } from "../../src/worker/cron";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

// Free plan: 50 subrequests (fetch) and 50 D1 queries per invocation. Walk every 15-min slot of a week, worst case:
// 50+ public repos all with sites + deps on 12 distinct status origins, 20 private repos, heatmap table empty (daily job every hour).
describe("per-slot subrequest budget", () => {
  const FREE_CAP = 50;
  const pubs = Array.from({ length: 60 }, (_, i) => ({
    nameWithOwner: `o/r${i}`, name: `r${i}`, isPrivate: false, isArchived: false, homepageUrl: `https://r${i}.test`, pushedAt: `2026-10-01T00:${String(i).padStart(2, "0")}:00Z`,
    repositoryTopics: { nodes: [] }, defaultBranchRef: { target: { history: { totalCount: 5, nodes: [] } } },
  }));
  const privs = Array.from({ length: 20 }, (_, i) => ({ nameWithOwner: `o/p${i}`, name: `p${i}`, isPrivate: true, isArchived: false, repositoryTopics: { nodes: [] } }));
  const projects = Array.from({ length: 60 }, (_, i) => ({ repo: `o/r${i}`, url: `https://r${i}.test`, deps: JSON.stringify([`https://s${i % 12}.status.test/x`]) }));

  it("never exceeds 50 fetches or 50 D1 queries in any slot", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      fetched.push(u);
      const json = (b: unknown) => new Response(JSON.stringify(b));
      if (u.endsWith("/graphql")) {
        const { query, variables } = JSON.parse(init!.body as string);
        if (query.includes("contributionCalendar")) return json({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: "2026-10-01", contributionCount: 1 }] }] } } } } });
        if (query.includes("privacy:PRIVATE")) return json({ data: { viewer: { repositories: { nodes: privs } } } });
        const i = variables.after ? Number(variables.after) : 0;
        const nodes = [...pubs, ...privs].slice(i * 50, i * 50 + 50);
        return json({ data: { viewer: { repositories: { pageInfo: { hasNextPage: i + 1 < 3 /* worst case: the full 3 pages */, endCursor: String(i + 1) }, nodes } } } });
      }
      if (u.includes("stats/code_frequency")) return json([[1700000000, 5, -2]]);
      if (u.includes("pagespeedonline")) return json({ lighthouseResult: { categories: { performance: { score: 1 }, accessibility: { score: 1 }, "best-practices": { score: 1 }, seo: { score: 1 } } } });
      if (u.endsWith("/api/v2/status.json")) return json({ page: { name: "S" }, status: { indicator: "none", description: "ok" } });
      return new Response("<rss><channel><item><title>t</title><link>https://p.test/1</link><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const start = Date.parse("2026-10-05T00:00:00Z"); // a Monday
    let worstFetch = 0, worstDb = 0;
    const seen = { loc: false, psi: false, hourly: false };
    for (let i = 0; i < 7 * 96; i++) {
      const t = start + i * 15 * 60_000;
      fetched.length = 0;
      const { db, ops } = (() => { const f = fakeDb({ "FROM projects": projects }); return f; })();
      const env = { DB: db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o", PORTFOLIO_RSS_URL: "https://p.test/rss" } as unknown as Env;
      await runScheduled({ scheduledTime: t } as ScheduledController, env);
      const label = new Date(t).toISOString();
      expect(fetched.length, `fetches @ ${label}`).toBeLessThanOrEqual(FREE_CAP);
      expect(ops.n, `D1 queries @ ${label}`).toBeLessThanOrEqual(FREE_CAP);
      worstFetch = Math.max(worstFetch, fetched.length);
      worstDb = Math.max(worstDb, ops.n);
      const d = new Date(t);
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 30) { seen.loc = true; expect(fetched.some((u) => u.includes("code_frequency"))).toBe(true); }
      if (d.getUTCDay() === 1 && d.getUTCHours() === 1 && d.getUTCMinutes() === 0) { seen.psi = true; expect(fetched.some((u) => u.includes("pagespeedonline"))).toBe(true); expect(fetched.length).toBe(30); }
      if (d.getUTCHours() === 3 && d.getUTCMinutes() === 0) { seen.hourly = true; expect(fetched.filter((u) => u.endsWith("/graphql")).length).toBe(3 + 1); } // 3 repo pages + heatmap
    }
    expect(seen).toEqual({ loc: true, psi: true, hourly: true });
    expect(worstFetch).toBeLessThanOrEqual(FREE_CAP);
    expect(worstDb).toBeLessThanOrEqual(FREE_CAP);
  }, 60_000);
});
