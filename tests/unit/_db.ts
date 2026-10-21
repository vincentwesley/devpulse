// Shared test fakes (not a test file).
export type Q = { sql: string; args: unknown[] };

/** Minimal D1 fake: records every statement and counts D1 calls; `rows` answers all()/first() by SQL substring. */
export function fakeDb(rows: Record<string, unknown[]> = {}) {
  const log: Q[] = [];
  const ops = { n: 0 };
  const match = (sql: string) => Object.entries(rows).find(([k]) => sql.includes(k))?.[1] ?? [];
  const stmt = (sql: string, args: unknown[] = []) => {
    const q = { sql, args };
    return {
      q,
      bind: (...a: unknown[]) => stmt(sql, a),
      run: async () => (ops.n++, log.push(q), {}),
      all: async () => (ops.n++, log.push(q), { results: match(sql) }),
      first: async () => (ops.n++, log.push(q), (match(sql) as unknown[])[0] ?? null),
    };
  };
  const db = {
    prepare: (s: string) => stmt(s),
    batch: async (ss: { q: Q }[]) => (ops.n++, log.push(...ss.map((s) => s.q)), ss.map((s) => ({ results: match(s.q.sql) }))),
  };
  return { db: db as unknown as D1Database, log, ops };
}
