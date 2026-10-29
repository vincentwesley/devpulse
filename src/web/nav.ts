import { el } from "./api";
import { keepMode } from "./mode";
import { parseProjectPath, toProjectPath } from "./urlstate";

let handler: () => void = () => {};
/** The router registers itself here so links and the palette can navigate without importing it. */
export const setRouteHandler = (f: () => void) => { handler = f; };

/** "/p/x?q=1#h" with the current ?mode kept in its query. */
const moded = (path: string) => {
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path)!;
  return m[1] + keepMode(m[2] ?? "") + (m[3] ?? "");
};

/** Client-side navigation: push one history entry (unless already there) and re-route. The current mode stays in the URL. */
export function navigate(path: string) {
  path = moded(path);
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

/** Desktop layout: the ledger has a sticky detail pane beside it. Below this a project opens as a full page. */
export const wide = () => matchMedia("(min-width: 1024px)").matches;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Open a project: desktop shows it in the sticky pane (URL /p/<name>, one history entry; switching rows replaces it),
 * phones and tablets go to the full page with a view transition when the browser has one.
 */
export function openDetail(name: string) {
  if (parseProjectPath(location.pathname) === name) return;
  const path = moded(toProjectPath(name));
  if (wide() && parseProjectPath(location.pathname) !== null) {
    history.replaceState({ route: 1 }, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  const go = () => navigate(path);
  if (!wide() && document.startViewTransition && !reduced()) document.startViewTransition(go);
  else go();
}

/** Close the pane (Back if we pushed its entry, else swap the URL to the list). */
export function closeDetail() {
  if (parseProjectPath(location.pathname) === null) return;
  if (history.state?.route) history.back();
  else {
    history.replaceState(null, "", `/${location.search}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }
}
