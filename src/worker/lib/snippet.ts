// Ready-to-paste README block per repo (absolute URLs, so it works on github.com).
const md = (u: string) => u.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");

export function snippet(origin: string, name: string, url: string | null): string {
  url = url && md(url);
  const p = `${origin}/p/${name}`;
  return [
    "<!-- devpulse:start -->",
    `[![${name} status on DevPulse](${origin}/card/${name}.svg)](${p})`,
    "",
    `[![Current screenshot of ${name}](${origin}/shot/${name}.jpg)](${url ?? p})`,
    "",
    [url ? `[Live site](${url})` : null, `[Health on DevPulse](${p})`].filter(Boolean).join(" · "),
    "<!-- devpulse:end -->",
  ].join("\n");
}
