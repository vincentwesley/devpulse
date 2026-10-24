import { PATHS, type IconName } from "./icons/paths";

export type { IconName };
const NS = "http://www.w3.org/2000/svg";

/** Pixelarticons glyph as an inline <svg>: built with DOM APIs, aria-hidden, currentColor. Add an accessible name on the parent. */
export function icon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: String(size), height: String(size), class: `icon icon--${name}`, "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.appendChild(path);
  return svg;
}
