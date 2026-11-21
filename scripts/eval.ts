import "./load-env";
import { readFileSync } from "node:fs";

// Usage:
//   npm run eval                    → single questions: retrieval quality for vector / keyword / hybrid search
//   npm run eval -- --followups     → follow-up questions in a conversation: raw vs concat vs query rewriting
//   add --answers to either one     → also generate answers and check that each contains the expected fact
//
// Metrics:
//   hit@k — share of questions where the correct passage is in the top k results
//   MRR   — mean reciprocal rank: 1 if the right passage is first, 0.5 if second, 0.33 if third…

interface Case {
  question: string;
  source: string;
  heading: string;
  answer: string | string[]; // expected fact (or acceptable alternatives) that must appear in the answer
}

interface FollowUpCase extends Case {
  history: { role: "user" | "assistant"; content: string }[];
}

async function main() {
  const { retrieve } = await import("../src/lib/retrieve");
  const { buildMessages } = await import("../src/lib/prompt");
  const { complete, modelLabel } = await import("../src/lib/llm");
  const { rewriteQuery } = await import("../src/lib/rewrite");
  const { pool } = await import("../src/lib/db");
  type Mode = import("../src/lib/retrieve").SearchMode;
  type Chunk = import("../src/lib/retrieve").RetrievedChunk;

  const withAnswers = process.argv.includes("--answers");
  const followupMode = process.argv.includes("--followups");
  const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}%`.padEnd(8);

  // 1-based rank of the expected passage, 0 if it is not in the results
  const rankOf = (results: Chunk[], c: Case) =>
    results.findIndex((r) => r.source === c.source && (r.heading ?? "").includes(c.heading)) + 1;

  const answerOk = (answer: string, c: Case) => {
    const text = answer.replace(/\[\d+\]/g, "").toLowerCase(); // ignore citation markers like [1]
    return (Array.isArray(c.answer) ? c.answer : [c.answer]).some((a) => text.includes(a.toLowerCase()));
  };

  const scoreRow = (label: string, ranks: number[]) => {
    const n = ranks.length;
    const hit = (k: number) => ranks.filter((r) => r >= 1 && r <= k).length;
    const mrr = ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / n;
    console.log(`${label.padEnd(10)}${pct(hit(1), n)}${pct(hit(3), n)}${pct(hit(6), n)}${mrr.toFixed(2)}`);
  };

  // --- Single questions ---
  if (!followupMode) {
    const cases: Case[] = JSON.parse(readFileSync("eval/questions.json", "utf8"));
    const modes: Mode[] = ["vector", "keyword", "hybrid"];
    console.log(`Retrieval eval on ${cases.length} questions\n`);
    console.log("mode      hit@1   hit@3   hit@6   MRR");
    for (const mode of modes) {
      const ranks: number[] = [];
      for (const c of cases) ranks.push(rankOf(await retrieve(c.question, 6, mode), c));
      scoreRow(mode, ranks);
    }

    if (withAnswers) {
      console.log(`\nAnswer eval (${modelLabel()}, hybrid retrieval)`);
      let correct = 0;
      for (const c of cases) {
        const answer = await complete(buildMessages(c.question, await retrieve(c.question)));
        const ok = answerOk(answer, c);
        if (ok) correct++;
        console.log(`  ${ok ? "✓" : "✗"} ${c.question}${ok ? "" : `\n      expected "${c.answer}", got: ${answer.replace(/\s+/g, " ").slice(0, 160)}`}`);
      }
      console.log(`Answer accuracy: ${correct}/${cases.length} (${Math.round((correct / cases.length) * 100)}%)`);
    }
  }

  // --- Follow-up questions in a conversation ---
  if (followupMode) {
    const followups: FollowUpCase[] = JSON.parse(readFileSync("eval/followups.json", "utf8"));
    const lastUser = (f: FollowUpCase) => [...f.history].reverse().find((m) => m.role === "user")?.content ?? "";

    // Rewrite once per case (it is an LLM call) and reuse the result below.
    const rewrites: string[] = [];
    for (const f of followups) rewrites.push(await rewriteQuery(f.question, f.history));

    const strategies: Record<string, (f: FollowUpCase, i: number) => string> = {
      raw: (f) => f.question, // search with the follow-up as typed
      concat: (f) => `${lastUser(f)} ${f.question}`, // cheap baseline: glue the previous question in front
      rewrite: (_f, i) => rewrites[i], // LLM rewrites it into a standalone query
    };

    console.log(`Follow-up retrieval eval on ${followups.length} conversations (hybrid search)\n`);
    console.log("strategy  hit@1   hit@3   hit@6   MRR");
    for (const [name, toQuery] of Object.entries(strategies)) {
      const ranks: number[] = [];
      for (const [i, f] of followups.entries()) ranks.push(rankOf(await retrieve(toQuery(f, i)), f));
      scoreRow(name, ranks);
    }

    console.log("\nRewrites:");
    followups.forEach((f, i) => console.log(`  "${f.question}" → "${rewrites[i]}"`));

    if (withAnswers) {
      console.log(`\nFollow-up answer eval (${modelLabel()}, rewrite + hybrid retrieval)`);
      let correct = 0;
      for (const [i, f] of followups.entries()) {
        const chunks = await retrieve(rewrites[i]);
        const answer = await complete(buildMessages(f.question, chunks, rewrites[i]));
        const ok = answerOk(answer, f);
        if (ok) correct++;
        console.log(`  ${ok ? "✓" : "✗"} ${f.question}${ok ? "" : `\n      expected "${f.answer}", got: ${answer.replace(/\s+/g, " ").slice(0, 160)}`}`);
      }
      console.log(`Follow-up answer accuracy: ${correct}/${followups.length} (${Math.round((correct / followups.length) * 100)}%)`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
