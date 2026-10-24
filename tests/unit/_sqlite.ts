// @ts-ignore no @types/node
import { readFileSync } from "node:fs";
// @ts-ignore no @types/node
import { DatabaseSync } from "node:sqlite";

/** Real SQLite behind the D1 interface (migrations applied), so tests exercise the actual SQL. */
export function sqliteDb() {
  const raw = new DatabaseSync(":memory:");
  for (const f of ["0001_init", "0002_hub", "0003_status"]) raw.exec(readFileSync(new URL(`../../migrations/${f}.sql`, import.meta.url), "utf8"));
  const stmts = { n: 0 };
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    bind: (...a: unknown[]) => stmt(sql, a),
    run: async () => (stmts.n++, raw.prepare(sql).run(...args), {}),
    all: async () => (stmts.n++, { results: raw.prepare(sql).all(...args).map((r: object) => ({ ...r })) }),
    first: async () => (stmts.n++, { ...(raw.prepare(sql).get(...args) ?? null) } as unknown),
  });
  const db = {
    prepare: (s: string) => stmt(s),
    batch: async (ss: { sql: string; all: () => Promise<unknown> }[]) => { const out = []; for (const s of ss) out.push(await s.all()); return out; },
  };
  return { db: db as unknown as D1Database, raw, stmts };
}
