import "./load-env";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const { pool } = await import("../src/lib/db");
  const { config } = await import("../src/lib/config");

  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8").replaceAll(
    "{{EMBEDDING_DIM}}",
    String(config.embeddingDim),
  );
  await pool.query(sql);
  console.log(`Schema applied (embedding dimension: ${config.embeddingDim}).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
