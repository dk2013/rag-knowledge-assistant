// The full ingestion pipeline: file → text → chunks → embeddings → PostgreSQL.
import { createHash } from "node:crypto";
import { chunkText, embeddingText, isMarkdownFile } from "./chunker";
import { pool, toVectorLiteral } from "./db";
import { embedDocuments } from "./embeddings";
import { parseToText, titleFromFileName } from "./parse";

export interface IngestResult {
  fileName: string;
  status: "ingested" | "skipped" | "error";
  documentId?: number;
  chunks?: number;
  message?: string;
}

export async function ingestFile(fileName: string, data: Uint8Array): Promise<IngestResult> {
  try {
    const text = await parseToText(fileName, data);
    if (!text) return { fileName, status: "error", message: "No text found in file" };

    // Same content uploaded twice → skip instead of creating duplicates
    const contentHash = createHash("sha256").update(text).digest("hex");
    const existing = await pool.query("SELECT id FROM documents WHERE content_hash = $1", [contentHash]);
    if (existing.rowCount) {
      return { fileName, status: "skipped", documentId: Number(existing.rows[0].id), message: "Already ingested" };
    }

    const chunks = chunkText(text, { markdown: isMarkdownFile(fileName) });
    if (!chunks.length) return { fileName, status: "error", message: "No text chunks could be extracted" };
    // Embeddings are computed before opening the transaction: slow network calls
    // should not hold a database transaction open.
    const vectors = await embedDocuments(chunks.map(embeddingText));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const doc = await client.query(
        `INSERT INTO documents (title, source, mime_type, content_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [titleFromText(text) ?? titleFromFileName(fileName), fileName, mimeFromName(fileName), contentHash],
      );
      const documentId = Number(doc.rows[0].id);
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO chunks (document_id, chunk_index, heading, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [documentId, chunks[i].index, chunks[i].heading, chunks[i].content, toVectorLiteral(vectors[i])],
        );
      }
      await client.query("COMMIT");
      return { fileName, status: "ingested", documentId, chunks: chunks.length };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return { fileName, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

// Use the first markdown "# Title" as the document title when there is one
function titleFromText(text: string): string | null {
  const match = /^#\s+(.+?)\s*$/m.exec(text);
  return match ? match[1].slice(0, 200) : null;
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  return "text/plain";
}
