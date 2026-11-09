import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * База данных опциональна. Если `DATABASE_URL` задан — используем PostgreSQL.
 * Если нет — приложение работает автономно и хранит единый JSON-документ
 * в локальном файле (см. src/lib/persistence.ts).
 */
const databaseUrl = process.env.DATABASE_URL;

export const hasDatabase = Boolean(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool: Pool | null =
  databaseUrl
    ? (globalForDb.__arenaNextJsPostgresqlPool ??
      (globalForDb.__arenaNextJsPostgresqlPool = new Pool({ connectionString: databaseUrl })))
    : null;

export const db = pool ? drizzle(pool) : (null as unknown as ReturnType<typeof drizzle>);

