// Pure maths over the stored contribution calendar (no I/O).
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface Day { date: string; count: number }

export function computeStats(days: Day[], now: Date) {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  // Calendar days are contiguous; future days (if the calendar pads the week) are ignored.
  const d = days.filter((x) => x.date <= today).sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0, run = 0;
  for (const x of d) longest = Math.max(longest, (run = x.count > 0 ? run + 1 : 0));

  // Today with no contributions yet doesn't break the streak; a last day older than yesterday means 0.
  let i = d.length - 1;
  if (i >= 0 && d[i].date === today && d[i].count === 0) i--;
  let current = 0;
  if (i >= 0 && d[i].date >= yesterday) for (; i >= 0 && d[i].count > 0; i--) current++;

  const weekdayTotals = Array<number>(7).fill(0);
  for (const x of d) weekdayTotals[new Date(x.date + "T00:00:00Z").getUTCDay()] += x.count;
  const top = Math.max(...weekdayTotals);

  return {
    streak: { current, longest },
    busiestWeekday: top > 0 ? WEEKDAYS[weekdayTotals.indexOf(top)] : null,
    weekdayTotals, // Sunday..Saturday
    contributionsThisYear: d.filter((x) => x.date.startsWith(String(now.getUTCFullYear()))).reduce((s, x) => s + x.count, 0),
  };
}
