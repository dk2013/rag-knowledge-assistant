import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { chunkText, isMarkdownFile } from "../src/lib/chunker";
import { parseToText } from "../src/lib/parse";

// Usage: npm run inspect -- ./some-file.pdf
// Shows the extracted text and the chunks a file produces, without touching the database.
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run inspect -- <file>");
  const text = await parseToText(basename(file), new Uint8Array(readFileSync(file)));
  console.log(`Extracted ${text.length} chars:\n${JSON.stringify(text.slice(0, 500))}\n`);
  const chunks = chunkText(text, { markdown: isMarkdownFile(file) });
  console.log(`${chunks.length} chunk(s):`);
  for (const c of chunks) console.log(`  #${c.index} [${c.heading ?? "-"}] ${c.content.length} chars: ${c.content.slice(0, 80).replace(/\n/g, " ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
