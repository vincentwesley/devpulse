import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduled } from "../../src/worker/cron";
import type { Env } from "../../src/worker/env";
import type { Launch } from "../../src/worker/shots";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

// Free plan: 50 subrequests (fetch) and 50 D1 queries per invocation (a batch counts as one). Walk every 15-min slot of a week, worst case:
// 500 public + 40 private repos (list truncated at 5 pages), 60 sites with deps on 12 distinct status origins, a full detail backlog,
// probes due everywhere, shots due everywhere, heatmap table empty (daily job every slot). One Browser Run session counts as 1 subrequest.
describe("per-slot subrequest budget", () => {
  const FREE_CAP = 50;
  const pubs = Array.from({ length: 500 }, (_, i) => ({
    id: `R${i}`, nameWithOwner: `o/r${i}`, name: `r${i}`, isPrivate: false, isArchived: false, homepageUrl: i < 60 ? `https://r${i}.test` : null, pushedAt: `2026-10-01T00:00:00Z`,
    repositoryTopics: { nodes: [] }, defaultBranchRef: { target: { history: { totalCount: 5 } } },
  }));
  const privs = Array.from({ length: 40 }, (_, i) => ({ nameWithOwner: `o/p${i}`, name: `p${i}`, isPrivate: true, isArchived: false, repositoryTopics: { nodes: [] } }));
  const projects = Array.from({ length: 500 }, (_, i) => ({ repo: `o/r${i}`, name: `r${i}`, repo_id: `R${i}`, url: i < 60 ? `https://r${i}.test` : null, deps: JSON.stringify([`https://s${i % 12}.status.test/x`]),
    site_cands: JSON.stringify([{ src: "readme", url: `https://r${i}.pages.dev` }, { src: "pages", url: `https://o.github.io/r${i}/` }]), probe_url: null, probe_ok: null, probe_at: null }));

  it("never exceeds 50 fetches or 50 D1 queries in any slot", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      fetched.push(u);
      const json = (b: unknown) => new Response(JSON.stringify(b));
      if (u.endsWith("/graphql")) {
        const { query, variables } = JSON.parse(init!.body as string);
        if (query.includes("contributionCalendar")) return json({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: "2026-10-01", contributionCount: 1 }] }] } } } } });
        if (query.includes("privacy:PRIVATE")) return json({ data: { viewer: { repositories: { nodes: privs } } } });
        if (query.includes("nodes(ids")) return json({ data: { nodes: variables.ids.map((id: string) => ({ id, nameWithOwner: `o/r${id.slice(1)}`, isPrivate: false, readme: { text: "# x" } })) } });
        const i = variables.after ? Number(variables.after) : 0;
        const nodes = [...pubs, ...privs].slice(i * 100, i * 100 + 100);
        return json({ data: { viewer: { repositories: { pageInfo: { hasNextPage: (i + 1) * 100 < 540, endCursor: String(i + 1) }, nodes } } } });
      }
      if (u.includes("stats/code_frequency")) return json([[1700000000, 5, -2]]);
      if (u.includes("pagespeedonline")) return json({ lighthouseResult: { categories: { performance: { score: 1 }, accessibility: { score: 1 }, "best-practices": { score: 1 }, seo: { score: 1 } } } });
      if (u.endsWith("/api/v2/status.json")) return json({ page: { name: "S" }, status: { indicator: "none", description: "ok" } });
      if (u.includes(".pages.dev") || u.includes("github.io")) return new Response("", { status: 404 });
      return new Response("<rss><channel><item><title>t</title><link>https://p.test/1</link><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>");
    });
    const launch: Launch = async () => {
      fetched.push("browser-session");
      return { newPage: async () => ({ setViewport: async () => {}, goto: async () => {}, screenshot: async () => new Uint8Array(20_000), close: async () => {} }), close: async () => {} };
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const start = Date.parse("2026-10-05T00:00:00Z"); // a Monday
    const worst = { hourly: [0, 0], quarter: [0, 0], loc: [0, 0], psi: [0, 0] };
    const seen = { loc: false, psi: false, hourly: false, quarter: false, shot: false, probe: false };
    for (let i = 0; i < 7 * 96; i++) {
      const t = start + i * 15 * 60_000;
      fetched.length = 0;
      const { db, ops } = fakeDb({ "detail_at IS NULL": projects.slice(0, 40), "site_cands IS NOT NULL": projects, "LEFT JOIN shots": projects.slice(0, 60), "FROM projects": projects });
      const env = { DB: db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o", PORTFOLIO_RSS_URL: "https://p.test/rss", BROWSER: {} } as unknown as Env;
      await runScheduled({ scheduledTime: t } as ScheduledController, env, launch);
      const label = new Date(t).toISOString();
      expect(fetched.length, `fetches @ ${label}`).toBeLessThanOrEqual(FREE_CAP);
      expect(ops.n, `D1 queries @ ${label}`).toBeLessThanOrEqual(FREE_CAP);
      const d = new Date(t), h = d.getUTCHours(), m = d.getUTCMinutes();
      const kind = h === 0 && m === 30 ? "loc" : d.getUTCDay() === 1 && h === 1 && m === 0 ? "psi" : m === 0 ? "hourly" : "quarter";
      worst[kind] = [Math.max(worst[kind][0], fetched.length), Math.max(worst[kind][1], ops.n)];
      const gql = fetched.filter((u) => u.endsWith("/graphql")).length;
      if (kind === "loc") { seen.loc = true; expect(fetched.some((u) => u.includes("code_frequency"))).toBe(true); }
      if (kind === "psi") { seen.psi = true; expect(fetched.length).toBe(30); }
      if (kind === "hourly") {
        seen.hourly = true;
        expect(fetched.some((u) => u.includes("code_frequency") || u.includes(".pages.dev") || u === "browser-session")).toBe(false); // no LOC retry, probes or shots
        expect(gql).toBe(5 + 2 + 1); // 5 list pages + 2 detail calls + heatmap (empty table)
      }
      if (kind === "quarter") {
        seen.quarter = true;
        if (fetched.includes("browser-session")) seen.shot = true;
        if (fetched.some((u) => u.includes(".pages.dev"))) seen.probe = true;
        expect(fetched.filter((u) => u.includes(".pages.dev") || u.includes("github.io")).length).toBeLessThanOrEqual(4);
      }
    }
    expect(seen).toEqual({ loc: true, psi: true, hourly: true, quarter: true, shot: true, probe: true });
  }, 120_000);
});
