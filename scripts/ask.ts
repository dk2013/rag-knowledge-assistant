import "./load-env";

// Usage: npm run ask -- "How many vacation days do new employees get?"
async function main() {
  const { retrieve } = await import("../src/lib/retrieve");
  const { buildMessages } = await import("../src/lib/prompt");
  const { streamChat, modelLabel } = await import("../src/lib/llm");
  const { pool } = await import("../src/lib/db");

  const question = process.argv.slice(2).join(" ") || "How many vacation days do new employees get?";
  console.log(`Q: ${question}\n`);

  const chunks = await retrieve(question);
  console.log("Retrieved passages:");
  chunks.forEach((c, i) =>
    console.log(
      `  [${i + 1}] ${c.title} — ${c.heading ?? "(no heading)"}  sim=${c.similarity.toFixed(3)} vec#${
        c.vectorRank ?? "-"
      } kw#${c.keywordRank ?? "-"}`,
    ),
  );

  process.stdout.write(`\nA (${modelLabel()}): `);
  for await (const token of streamChat(buildMessages(question, chunks))) process.stdout.write(token);
  process.stdout.write("\n");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
