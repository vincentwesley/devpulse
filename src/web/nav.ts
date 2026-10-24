import { el } from "./api";

let handler: () => void = () => {};
/** The router registers itself here so links and the palette can navigate without importing it. */
export const setRouteHandler = (f: () => void) => { handler = f; };

/** Client-side navigation: push one history entry (unless already there) and re-route. */
export function navigate(path: string) {
  if (location.pathname + location.search + location.hash !== path) history.pushState({ route: 1 }, "", path);
  handler();
}

/** Real <a href> (opens in a new tab / copies fine); a plain left click navigates in place. */
export function navLink(text: string, path: string, cls = "", label = "") {
  const a = el("a", text, cls, { href: path });
  if (label) a.setAttribute("aria-label", label);
  a.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  });
  return a;
}
