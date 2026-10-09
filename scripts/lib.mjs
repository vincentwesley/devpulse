export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ISO week id "YYYY-Www" for a Date (UTC).
export function weekId(d = new Date()) {
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thu.setUTCDate(thu.getUTCDate() + 3 - ((thu.getUTCDay() + 6) % 7));
  const doy = Math.floor((thu - Date.UTC(thu.getUTCFullYear(), 0, 1)) / 864e5);
  return `${thu.getUTCFullYear()}-W${String(Math.floor(doy / 7) + 1).padStart(2, "0")}`;
}
