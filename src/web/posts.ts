import { add, el, link, show, type Post, type Res } from "./api";

export function renderPosts(res: Res<Post[]>) {
  show("posts", res, (ps) => {
    const ul = el("ul", "", "list");
    for (const p of ps) {
      const li = el("li");
      add(li, link(p.title, p.url), el("span", ` ${String(p.published).slice(0, 10)}`, "muted"));
      add(ul, li);
    }
    return ul;
  });
}
