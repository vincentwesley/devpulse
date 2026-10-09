export type Indicator = "none" | "minor" | "major" | "critical" | "unknown";
export interface PageStatus { name: string; indicator: Indicator; description: string }

const OK = new Set(["none", "minor", "major", "critical"]);

/** Parse an Atlassian Statuspage /api/v2/status.json body; null if it isn't one. */
export function parseStatuspage(j: unknown): PageStatus | null {
  const o = j as { page?: { name?: unknown }; status?: { indicator?: unknown; description?: unknown } } | null;
  const ind = o?.status?.indicator;
  if (typeof o?.page?.name !== "string" || typeof ind !== "string" || !OK.has(ind)) return null;
  return { name: o.page.name, indicator: ind as Indicator, description: String(o.status?.description ?? "") };
}

export const isUp = (status: number) => status >= 200 && status < 400;
