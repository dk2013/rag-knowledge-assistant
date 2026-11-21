// Query rewriting (a.k.a. "condense question"): turn a follow-up like "and after three years?"
// into a standalone search query using the conversation so far.
// Why: retrieval only sees ONE string. "And after three years?" has no useful words to embed or match,
// so search returns random passages. The chat model sees the history, the search engine does not.
import { complete, type ChatMessage } from "./llm";

// The examples use a made-up domain on purpose: copying cases from the eval set would be cheating.
const REWRITE_PROMPT = `You rewrite the user's latest message into a standalone search query for a document search engine.

Rules:
- If the latest message depends on the conversation (it says "it", "that", "they", or is incomplete like "and for managers?" or "what about X?"), add the missing subject from the conversation.
- If the latest message is a complete question about a new topic, return it unchanged.
- Keep every key word the user wrote (names, products, terms such as "SMS").
- Do not answer the question and do not copy numbers from the assistant's answers.
- Output only the query on one line, without quotes or explanations.

Examples (conversation: User: "How much does the Pro plan cost?" Assistant: "The Pro plan costs 30 USD per month."):
Latest message: does it include SSO? → Query: Does the Pro plan include SSO?
Latest message: and the Team plan? → Query: How much does the Team plan cost?
Latest message: and after the first year? → Query: How much does the Pro plan cost after the first year?
Latest message: why not weekly billing? → Query: Why is there no weekly billing for the Pro plan?
Latest message: who can buy it? → Query: Who can buy the Pro plan?
Latest message: What is the refund policy? → Query: What is the refund policy?`;

const MAX_QUERY_CHARS = 300;

function transcript(history: ChatMessage[]): string {
  return history
    .slice(-4) // the last two exchanges are enough to resolve "it" and "that"
    .map((m) => {
      const text = m.content.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
      return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
    })
    .join("\n");
}

// Small models sometimes add a prefix, quotes or a second line; keep only the query itself.
export function cleanRewrite(raw: string, fallback: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  const query = (line ?? "")
    .replace(/^(→\s*)?(standalone search query|search query|query)\s*:\s*/i, "")
    .replace(/^["'“]|["'”]$/g, "")
    .trim();
  return query && query.length <= MAX_QUERY_CHARS ? query : fallback;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Cheap signals that a message cannot stand on its own: very short, starts with "and…/what about…",
// or points back with "it/that/they".
export function looksLikeFollowUp(question: string): boolean {
  const words = normalize(question).split(" ").filter(Boolean);
  return (
    words.length <= 4 ||
    /^(and|but|also|or|so|what about|how about)\b/i.test(question.trim()) ||
    /\b(it|its|that|this|these|those|they|them|there)\b/i.test(question)
  );
}

export async function rewriteQuery(question: string, history: ChatMessage[]): Promise<string> {
  // First message of a conversation: nothing to resolve, so skip the extra LLM call.
  const previousQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  if (!previousQuestion) return question;
  const raw = await complete(
    [
      { role: "system", content: REWRITE_PROMPT },
      {
        role: "user",
        content: `Conversation:\n${transcript(history)}\nLatest message: ${question}\nQuery:`,
      },
    ],
    { temperature: 0, maxTokens: 64 }, // deterministic and short
  );
  const rewritten = cleanRewrite(raw, question);
  if (normalize(rewritten) !== normalize(question)) return rewritten;

  // The model returned the message unchanged. That is right for a new topic, but a small model sometimes
  // does it for an obvious follow-up too ("And after three years?"). Guard: glue the previous question in front.
  return looksLikeFollowUp(question) ? `${previousQuestion} ${question}` : question;
}
