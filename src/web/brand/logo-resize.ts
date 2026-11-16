// Credits sign-off logo: drag it sideways to resize (short </> / middle </in> / long </Atelier>), or pick a form with the radios.
// --logo-x (the right chevron's start, 540..1491.4) drives the whole SVG (logo.css); the pre-paint script applies the saved form.
export {};
const X = { short: 540, middle: 734, long: 1491.4 } as const;
type Form = keyof typeof X;
const KEY = "logo-form";
const root = document.documentElement;
const narrow = matchMedia("(max-width: 29.99rem)");
const link = document.querySelector<HTMLElement>("[data-logo-link]");
const svg = link?.querySelector<SVGElement>(".brand-logo");
const radios = document.querySelectorAll<HTMLInputElement>("[data-logo-form]");

function apply(form: Form): void {
  root.dataset.logo = form;
  radios.forEach((r) => (r.checked = r.value === form));
  try {
    localStorage.setItem(KEY, form);
  } catch {
    /* storage unavailable: the choice lasts for this page view only */
  }
}

radios.forEach((r) => r.addEventListener("change", () => r.checked && apply(r.value as Form)));
const saved = root.dataset.logo as Form | undefined;
radios.forEach((r) => (r.checked = r.value === (saved && saved in X ? saved : "middle")));

if (link && svg) {
  // First three visits, until a form is picked: one quiet tug of the chevron after load (logo.css, data-hint).
  try {
    const n = +(localStorage.getItem("logo-hint") ?? 0);
    if (n < 3 && !localStorage.getItem(KEY)) {
      localStorage.setItem("logo-hint", String(n + 1));
      svg.setAttribute("data-hint", "");
    }
  } catch {
    /* no storage: no hint */
  }
  // Pointer travel (px) -> --logo-x, with a notch at each form where the logo holds while the pointer moves on: the middle
  // </in> ("Vin") gets the widest one, so it is not slid past on the way to </Atelier> (owner request 2026-11-14).
  const P = [0, 12, 26, 66, 106];
  const XS = [X.short, X.short, X.middle, X.middle, X.long];
  const toX = (p: number) => {
    let i = 1;
    while (i < 4 && p > P[i]!) i++;
    return XS[i - 1]! + ((XS[i]! - XS[i - 1]!) * (p - P[i - 1]!)) / (P[i]! - P[i - 1]!);
  };
  let id = -1;
  let startX = 0;
  let p0 = 0;
  let x = 0;
  let dragging = false;
  let suppress = false;
  const max = () => (narrow.matches ? X.middle : X.long);
  link.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button) return;
    id = e.pointerId;
    startX = e.clientX;
    x = parseFloat(getComputedStyle(svg).getPropertyValue("--logo-x"));
    p0 = x < 637 ? 6 : x < 1112 ? 46 : 106;
    dragging = false;
  });
  link.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) <= 6) return;
      dragging = true;
      link.setPointerCapture(id);
      svg.setAttribute("data-drag", "");
    }
    x = Math.min(max(), toX(Math.min(106, Math.max(0, p0 + dx))));
    svg.style.setProperty("--logo-x", String(x));
  });
  const end = () => {
    if (id < 0) return;
    id = -1;
    if (!dragging) return;
    dragging = false;
    suppress = true;
    setTimeout(() => (suppress = false), 100);
    svg.removeAttribute("data-drag");
    svg.style.removeProperty("--logo-x");
    const forms = (Object.keys(X) as Form[]).filter((f) => X[f] <= max());
    apply(forms.reduce((a, b) => (Math.abs(X[b] - x) < Math.abs(X[a] - x) ? b : a)));
  };
  link.addEventListener("pointerup", end);
  link.addEventListener("pointercancel", end);
  link.addEventListener(
    "click",
    (e) => {
      if (suppress) {
        e.preventDefault();
        suppress = false;
      }
    },
    true,
  );
}
