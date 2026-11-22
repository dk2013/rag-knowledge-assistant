"use client";

import { useEffect, useRef, useState } from "react";

interface Source {
  n: number;
  title: string;
  heading: string | null;
  source: string;
  snippet: string;
  similarity: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  searchQuery?: string | null; // the standalone query used for search when the question was a follow-up
  meta?: string;
  error?: string;
}

const SUGGESTIONS = [
  "How many vacation days do new employees get?",
  "What is the response time for a SEV-1 incident?",
  "Which RouteWise plan includes SSO?",
  "Can I use SMS codes for MFA?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ docs: number; repoUrl: string | null } | null>(null);

  // In the public demo, tell visitors what the knowledge base contains.
  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => d.readOnly && setDemo({ docs: d.documents?.length ?? 0, repoUrl: d.repoUrl ?? null }))
      .catch(() => {});
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);

  const update = (fn: (last: Message) => Message) =>
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: question.trim() }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // skip empty assistant turns (e.g. a failed answer) so they don't confuse the model
          messages: history.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);

      // Read the NDJSON stream: one JSON event per line
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let model = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "sources") {
            model = event.model;
            update((m) => ({ ...m, sources: event.sources, searchQuery: event.searchQuery }));
          } else if (event.type === "token") {
            update((m) => ({ ...m, content: m.content + event.text }));
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          } else if (event.type === "done") {
            update((m) => ({ ...m, meta: `${model} · ${(event.totalMs / 1000).toFixed(1)}s` }));
          } else if (event.type === "error") {
            update((m) => ({ ...m, error: event.message }));
          }
        }
      }
    } catch (err) {
      update((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex-1 space-y-6 pb-6">
        {messages.length === 0 && (
          <div className="py-10 text-center">
            <h1 className="text-2xl font-semibold">Ask your knowledge base</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Answers come only from the uploaded documents, with numbered citations to the exact passages.
            </p>
            {demo && (
              <p className="mx-auto mt-3 max-w-xl text-xs text-[var(--muted)]">
                Public demo · the knowledge base is {demo.docs} sample documents about a fictional logistics company
                (handbook, product FAQ, security policy, onboarding guide)
                {demo.repoUrl ? (
                  <>
                    {" · "}
                    <a href={demo.repoUrl} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">
                      source code
                    </a>
                  </>
                ) : null}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-[var(--accent)] px-4 py-2 text-white">{m.content}</div>
            </div>
          ) : (
            <AssistantMessage key={i} message={m} pending={busy && i === messages.length - 1} />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-4 flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[0_1rem_0_0_var(--bg)]"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Ask a question about your documents…"
          className="flex-1 resize-none bg-transparent px-2 py-2 outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

function AssistantMessage({ message, pending }: { message: Message; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  // Turn "[2]" into clickable citation chips and "**text**" into bold (minimal markdown)
  const parts = message.content.split(/(\[\d+\]|\*\*[^*\n]+\*\*)/g);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
      {message.searchQuery && (
        <p className="mb-2 text-xs text-[var(--muted)]">
          Searched for: <span className="italic">&ldquo;{message.searchQuery}&rdquo;</span>
        </p>
      )}
      {message.error ? (
        <p className="text-sm text-red-500">{message.error}</p>
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">
          {parts.map((part, i) => {
            if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
            const match = /^\[(\d+)\]$/.exec(part);
            if (!match) return <span key={i}>{part}</span>;
            const n = Number(match[1]);
            return (
              <button
                key={i}
                onClick={() => {
                  setOpen(true);
                  setActive(n);
                }}
                className="mx-0.5 rounded bg-[var(--accent-soft)] px-1 align-super text-xs text-[var(--accent)]"
              >
                {n}
              </button>
            );
          })}
          {pending && !message.content && (
            <span className="text-[var(--muted)]">{message.sources ? "Writing the answer…" : "Searching documents…"}</span>
          )}
        </p>
      )}

      {message.sources && message.sources.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <button onClick={() => setOpen(!open)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
            {open ? "▾" : "▸"} {message.sources.length} sources{message.meta ? ` · ${message.meta}` : ""}
          </button>
          {open && (
            <ol className="mt-2 space-y-2">
              {message.sources.map((s) => (
                <li
                  key={s.n}
                  className={`rounded-lg border p-3 text-sm ${
                    active === s.n ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[var(--accent-soft)] px-1.5 text-xs text-[var(--accent)]">{s.n}</span>
                    <span className="font-medium">{s.title}</span>
                    {s.heading && <span className="text-[var(--muted)]">— {s.heading.split(" > ").at(-1)}</span>}
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      similarity {(s.similarity * 100).toFixed(0)}% · vector #{s.vectorRank ?? "–"} · keyword #
                      {s.keywordRank ?? "–"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[var(--muted)]">{s.snippet.replace(/\*\*/g, "")}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
