// Retrieval: find the chunks most relevant to a question.
//
// Hybrid search = two searches combined:
//   • vector search — finds chunks with similar MEANING ("time off" ≈ "vacation")
//   • keyword search (PostgreSQL full-text) — finds exact TERMS (product names, codes, "SEV-1")
// Results are merged with Reciprocal Rank Fusion (RRF): score = Σ 1 / (k + rank).
// RRF only uses positions in each list, so we don't need to normalise two different score scales.
import { config } from "./config";
import { pool, toVectorLiteral } from "./db";
import { embedQuery } from "./embeddings";

export interface RetrievedChunk {
  id: number;
  documentId: number;
  title: string;
  source: string;
  heading: string | null;
  content: string;
  similarity: number; // cosine similarity 0..1 from vector search
  vectorRank: number | null;
  keywordRank: number | null;
  score: number; // RRF score used for final ordering
}

const RRF_K = 60; // standard constant from the original RRF paper
const CANDIDATES = 20; // how many results each search contributes before fusion

// Turn a natural question into an OR query for to_tsquery: "how many sick days" → "how | many | sick | days".
// Stop words ("how", "many") are dropped by PostgreSQL itself; OR keeps partial matches.
export function toKeywordQuery(question: string): string {
  const words = question.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  return [...new Set(words)].join(" | ");
}

// "vector" and "keyword" modes exist to compare against hybrid in evals (npm run eval)
export type SearchMode = "hybrid" | "vector" | "keyword";

export async function retrieve(
  question: string,
  topK = config.topK,
  mode: SearchMode = "hybrid",
): Promise<RetrievedChunk[]> {
  const queryVector = toVectorLiteral(await embedQuery(question));
  const keywordQuery = toKeywordQuery(question);
  const vectorWeight = mode === "keyword" ? 0 : 1;
  const keywordWeight = mode === "vector" ? 0 : 1;

  const { rows } = await pool.query(
    `
    WITH vector_search AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    ),
    keyword_search AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS rank
      FROM chunks, to_tsquery('english', $2) AS q
      WHERE $2 <> '' AND tsv @@ q
      ORDER BY ts_rank_cd(tsv, q) DESC
      LIMIT $3
    ),
    fused AS (
      SELECT COALESCE(v.id, k.id) AS id,
             v.rank AS vector_rank,
             k.rank AS keyword_rank,
             $6 * COALESCE(1.0 / ($4 + v.rank), 0) + $7 * COALESCE(1.0 / ($4 + k.rank), 0) AS score
      FROM vector_search v
      FULL OUTER JOIN keyword_search k ON v.id = k.id
    )
    SELECT c.id, c.document_id, d.title, d.source, c.heading, c.content,
           1 - (c.embedding <=> $1::vector) AS similarity,
           f.vector_rank, f.keyword_rank, f.score
    FROM fused f
    JOIN chunks c ON c.id = f.id
    JOIN documents d ON d.id = c.document_id
    WHERE f.score > 0
    ORDER BY f.score DESC
    LIMIT $5
    `,
    [queryVector, keywordQuery, CANDIDATES, RRF_K, topK, vectorWeight, keywordWeight],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    documentId: Number(r.document_id),
    title: r.title,
    source: r.source,
    heading: r.heading,
    content: r.content,
    similarity: Number(r.similarity),
    vectorRank: r.vector_rank === null ? null : Number(r.vector_rank),
    keywordRank: r.keyword_rank === null ? null : Number(r.keyword_rank),
    score: Number(r.score),
  }));
}
