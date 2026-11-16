/* Pre-paint: saved logo form (external, so the CSP script hash for the inline theme script stays valid). */
try { var logo = localStorage.getItem("logo-form"); if (logo === "short" || logo === "middle" || logo === "long") document.documentElement.setAttribute("data-logo", logo); } catch (e) {}
