import { Pool } from "pg";
import { config } from "./config";

// One connection pool per process. In Next.js dev mode modules reload on every change,
// so the pool is cached on globalThis to avoid opening new connections each time.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  globalForPg.pgPool ?? new Pool({ connectionString: config.databaseUrl, max: 10 });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

// pgvector accepts vectors as text like "[0.12,-0.03,...]"
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
