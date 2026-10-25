import "./feed.css";
import { add, el, fmtDate, link, show, type Post, type Res } from "./api";

export function renderPosts(res: Res<Post[]>) {
  // No posts yet (empty, not an error): hide the section; it returns as soon as data exists.
  const none = res.state === "empty";
  document.getElementById("posts")!.hidden = none;
  if (none) return;
  show("posts", res, (ps) => {
    const ul = el("ul", "", "posts");
    for (const p of ps.slice(0, 5)) {
      const li = el("li");
      add(li, el("time", fmtDate(p.published), "posts__d", { datetime: fmtDate(p.published) }), link(p.title, p.url, "posts__a"));
      add(ul, li);
    }
    return ul;
  });
}
