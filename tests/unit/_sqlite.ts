// @ts-ignore no @types/node
import { readFileSync } from "node:fs";
// @ts-ignore no @types/node
import { DatabaseSync } from "node:sqlite";

/** Real SQLite behind the D1 interface (migrations applied), so tests exercise the actual SQL. */
export function sqliteDb() {
  const raw: any = new DatabaseSync(":memory:"); // any: node:sqlite types only exist when @types/node is loaded
  for (const f of ["0001_init", "0002_hub", "0003_status", "0005_showcase", "0006_freshness", "0007_drop_ci", "0008_hub_sync"]) raw.exec(readFileSync(new URL(`../../migrations/${f}.sql`, import.meta.url), "utf8"));
  const stmts = { n: 0 };
  // D1 binds ArrayBuffer as BLOB; node:sqlite wants a typed array.
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    bind: (...a: unknown[]) => stmt(sql, a.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x))),
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
