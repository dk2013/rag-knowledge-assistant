// Generation: stream the model's answer token by token.
// One interface, two providers: local Ollama (free, private) or OpenAI (hosted).
import { config } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Errors whose message is safe and useful to show to a visitor of the public demo.
export class ProviderError extends Error {}

// Turn an HTTP error from a model provider into a short message. Quota and auth problems get a friendly
// text; the raw response (which can contain account details) is only logged on the server.
export async function providerError(provider: string, res: Response): Promise<Error> {
  const body = await res.text();
  console.error(`${provider} error ${res.status}: ${body.slice(0, 500)}`);
  if (res.status === 429 && /quota|billing|credit/i.test(body)) {
    return new ProviderError("The demo has used up its AI budget for now. Please try again later.");
  }
  if (res.status === 429) return new ProviderError("The AI provider is busy. Please try again in a minute.");
  if (res.status === 401 || res.status === 403) return new ProviderError("The AI provider is not configured correctly.");
  return new Error(`${provider} request failed: ${res.status}`);
}

export interface ChatOptions {
  temperature?: number; // default 0.1: low temperature = fewer creative "facts"
  maxTokens?: number; // cap the output length (useful for short helper calls like query rewriting)
}

// Reads a streaming HTTP body line by line (both Ollama NDJSON and OpenAI SSE are line-based).
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

async function* streamOllama(messages: ChatMessage[], opts: ChatOptions): AsyncGenerator<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: true,
      options: { temperature: opts.temperature ?? 0.1, ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}) },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
  for await (const line of readLines(res.body)) {
    const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
    if (data.error) throw new Error(data.error);
    if (data.message?.content) yield data.message.content;
    if (data.done) return;
  }
}

async function* streamOpenAI(messages: ChatMessage[], opts: ChatOptions): AsyncGenerator<string> {
  if (!config.openaiApiKey) throw new ProviderError("The AI provider is not configured (OPENAI_API_KEY is empty).");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({
      model: config.openaiChatModel,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.1,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
  });
  if (!res.ok || !res.body) throw await providerError("OpenAI chat", res);
  for await (const line of readLines(res.body)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return;
    const data = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
    const token = data.choices?.[0]?.delta?.content;
    if (token) yield token;
  }
}

export function streamChat(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
  return config.llmProvider === "openai" ? streamOpenAI(messages, opts) : streamOllama(messages, opts);
}

// Non-streaming helper: collect the whole answer into one string.
export async function complete(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  let text = "";
  for await (const token of streamChat(messages, opts)) text += token;
  return text;
}

export function modelLabel(): string {
  return config.llmProvider === "openai" ? `OpenAI ${config.openaiChatModel}` : `Ollama ${config.chatModel}`;
}
