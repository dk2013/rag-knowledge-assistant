// POST /api/chat  { messages: [{role, content}, ...] }
// Streams NDJSON events: {"type":"sources",...} → {"type":"token",...}* → {"type":"done"} (or {"type":"error"})
import { config } from "@/lib/config";
import { streamChat, modelLabel, ProviderError, type ChatMessage } from "@/lib/llm";
import { buildMessages } from "@/lib/prompt";
import { retrieve } from "@/lib/retrieve";
import { checkRateLimit, clientIp, isServiceCall } from "@/lib/rate-limit";
import { rewriteQuery } from "@/lib/rewrite";

const MAX_BODY_CHARS = 50_000; // a conversation is a few KB; anything bigger is not a real chat

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return Response.json({ error: "Request is too large" }, { status: 413 });
  let body: { messages?: ChatMessage[] } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10); // only recent turns matter (rewriting uses the last 4)
  const question = messages.at(-1)?.role === "user" ? messages.at(-1)!.content.trim() : "";
  if (!question) return Response.json({ error: "Last message must be a non-empty user question" }, { status: 400 });
  if (question.length > 2000) return Response.json({ error: "Question is too long" }, { status: 400 });

  // checked after validation, so malformed requests don't use up a visitor's quota
  // trusted services (the AI sales agent demo) skip the per-IP limit; the daily limit still applies
  const limit = checkRateLimit(clientIp(req), Date.now(), { skipPerIp: isServiceCall(req) });
  if (!limit.ok) {
    return Response.json({ error: limit.message }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

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
        console.error("chat failed:", err);
        // In the public demo show only messages meant for visitors; locally show the real error.
        const message =
          err instanceof ProviderError || !config.demoMode
            ? err instanceof Error
              ? err.message
              : String(err)
            : "Something went wrong. Please try again.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
