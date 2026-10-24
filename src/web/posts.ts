import { add, el, fmtDate, link, show, type Post, type Res } from "./api";

export function renderPosts(res: Res<Post[]>) {
  // No posts yet (empty, not an error): hide the section; it returns as soon as data exists.
  const none = res.state === "empty";
  document.getElementById("posts")!.hidden = none;
  if (none) return;
  show("posts", res, (ps) => {
    const ul = el("ul", "", "list");
    for (const p of ps) {
      const li = el("li");
      add(li, link(p.title, p.url), el("span", ` ${fmtDate(p.published)}`, "muted"));
      add(ul, li);
    }
    return ul;
  });
}
