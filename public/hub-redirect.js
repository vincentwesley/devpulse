// Project Hub owns "/" since round 6; the dashboard moved to /dev/. Runs before paint so old dashboard links never flash the hub.
// "/?sort=..", "/?mode=dev", "/#p/<name>" -> /dev/ (query and hash kept); "?mode=showcase" (round-5 links) is just dropped.
(function () {
  try {
    var l = location, u = new URLSearchParams(l.search), dev = u.get("mode") === "dev" || /^#p\//.test(l.hash);
    ["q", "sort", "lang", "status", "topic", "stage"].forEach(function (k) { if (u.has(k)) dev = true; });
    if (u.has("mode")) u.delete("mode");
    var q = u.toString(), rest = (q ? "?" + q : "") + l.hash;
    if (dev && l.pathname === "/") l.replace("/dev/" + rest);
    else if (rest !== l.search + l.hash) history.replaceState(history.state, "", l.pathname + rest);
  } catch (e) {}
})();
