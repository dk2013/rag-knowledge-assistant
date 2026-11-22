// Step 3 of ingestion (and step 1 of answering): turn text into vectors.
// Texts with similar meaning get vectors that point in similar directions.
import { config } from "./config";
import { ProviderError, providerError } from "./llm";

// nomic-embed-text was trained with task prefixes; using them noticeably improves retrieval.
const NOMIC_PREFIX = { document: "search_document: ", query: "search_query: " } as const;
type Kind = keyof typeof NOMIC_PREFIX;

async function embedWithOllama(texts: string[], kind: Kind): Promise<number[][]> {
  const usePrefix = config.embeddingModel.startsWith("nomic-embed-text");
  const res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: usePrefix ? texts.map((t) => NOMIC_PREFIX[kind] + t) : texts,
    }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  if (!config.openaiApiKey) throw new ProviderError("The AI provider is not configured (OPENAI_API_KEY is empty).");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openaiApiKey}` },
    // text-embedding-3-* can shorten vectors; we ask for the same size as the DB column
    body: JSON.stringify({ model: config.openaiEmbeddingModel, input: texts, dimensions: config.embeddingDim }),
  });
  if (!res.ok) throw await providerError("OpenAI embeddings", res);
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embed(texts: string[], kind: Kind): Promise<number[][]> {
  const batchSize = 32; // keep requests small and predictable
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vectors =
      config.embeddingProvider === "openai" ? await embedWithOpenAI(batch) : await embedWithOllama(batch, kind);
    for (const v of vectors) {
      if (v.length !== config.embeddingDim) {
        throw new Error(`Embedding has ${v.length} dimensions, but EMBEDDING_DIM is ${config.embeddingDim}`);
      }
    }
    out.push(...vectors);
  }
  return out;
}

export const embedDocuments = (texts: string[]) => embed(texts, "document");
export const embedQuery = async (text: string) => (await embed([text], "query"))[0];
