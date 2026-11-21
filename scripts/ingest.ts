import "./load-env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Usage: npm run ingest -- ./sample-docs
async function main() {
  const { ingestFile } = await import("../src/lib/ingest");
  const { isSupported } = await import("../src/lib/parse");
  const { pool } = await import("../src/lib/db");

  const dir = resolve(process.argv[2] ?? "sample-docs");
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && isSupported(f));
  if (!files.length) throw new Error(`No supported files in ${dir}`);

  console.log(`Ingesting ${files.length} file(s) from ${dir}`);
  for (const file of files) {
    const started = Date.now();
    const result = await ingestFile(file, new Uint8Array(readFileSync(join(dir, file))));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `  ${result.status.padEnd(8)} ${file}${result.chunks ? ` → ${result.chunks} chunks` : ""} (${secs}s)${
        result.message ? ` — ${result.message}` : ""
      }`,
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
