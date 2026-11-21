// All settings come from environment variables (.env), with safe local defaults.
function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export type Provider = "ollama" | "openai";

export const config = {
  databaseUrl: env("DATABASE_URL", "postgres://rag:rag@localhost:5433/rag"),
  llmProvider: env("LLM_PROVIDER", "ollama") as Provider,
  embeddingProvider: env("EMBEDDING_PROVIDER", "ollama") as Provider,
  ollamaUrl: env("OLLAMA_URL", "http://localhost:11434"),
  chatModel: env("CHAT_MODEL", "llama3.2"),
  embeddingModel: env("EMBEDDING_MODEL", "nomic-embed-text"),
  openaiApiKey: env("OPENAI_API_KEY", ""),
  openaiChatModel: env("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
  openaiEmbeddingModel: env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  embeddingDim: Number(env("EMBEDDING_DIM", "768")),
  topK: Number(env("TOP_K", "6")),
};
