export interface FeedItem { title: string; url: string; published: string }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const text = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, cdata, ent) => {
    if (cdata !== undefined) return cdata;
    if (ent[0] === "#") {
      const n = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENT[ent.toLowerCase()] ?? m;
  }).trim();

const tag = (block: string, name: string) =>
  new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`, "i").exec(block)?.[1];

function link(block: string): string {
  // Atom: <link rel="alternate" href="..."/>; RSS: <link>url</link>
  for (const m of block.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    if (href && (!rel || rel === "alternate")) return text(href);
  }
  return text(tag(block, "link") ?? "");
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const b = m[2];
    const url = link(b);
    if (!url) continue;
    const d = new Date(text(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? ""));
    out.push({
      title: text(tag(b, "title") ?? "") || url,
      url,
      published: isNaN(+d) ? "" : d.toISOString(),
    });
  }
  return out;
}
