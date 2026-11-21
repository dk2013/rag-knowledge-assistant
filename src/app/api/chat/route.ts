// POST /api/chat  { messages: [{role, content}, ...] }
// Streams NDJSON events: {"type":"sources",...} → {"type":"token",...}* → {"type":"done"} (or {"type":"error"})
import { streamChat, modelLabel, type ChatMessage } from "@/lib/llm";
import { buildMessages } from "@/lib/prompt";
import { retrieve } from "@/lib/retrieve";
import { rewriteQuery } from "@/lib/rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { messages?: ChatMessage[] } | null;
  const messages = (body?.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  const question = messages.at(-1)?.role === "user" ? messages.at(-1)!.content.trim() : "";
  if (!question) return Response.json({ error: "Last message must be a non-empty user question" }, { status: 400 });
  if (question.length > 2000) return Response.json({ error: "Question is too long" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const started = Date.now();
        const history = messages.slice(0, -1);
        // 1. follow-up → standalone query ("and after 3 years?" → "vacation days after 3 years")
        const searchQuery = await rewriteQuery(question, history);
        const rewriteMs = Date.now() - started;
        // 2. search with the standalone query
        const chunks = await retrieve(searchQuery);
        send({
          type: "sources",
          model: modelLabel(),
          searchQuery: searchQuery !== question ? searchQuery : null,
          rewriteMs,
          retrievalMs: Date.now() - started - rewriteMs,
          sources: chunks.map((c, i) => ({
            n: i + 1,
            title: c.title,
            heading: c.heading,
            source: c.source,
            snippet: c.content.slice(0, 400),
            similarity: Number(c.similarity.toFixed(3)),
            vectorRank: c.vectorRank,
            keywordRank: c.keywordRank,
          })),
        });

        // 3. answer: original question + standalone version; the history was already used in step 1
        for await (const token of streamChat(buildMessages(question, chunks, searchQuery))) {
          send({ type: "token", text: token });
        }
        send({ type: "done", totalMs: Date.now() - started });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
