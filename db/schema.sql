-- pgvector adds the "vector" column type and similarity operators (<=> cosine distance)
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per uploaded file
CREATE TABLE IF NOT EXISTS documents (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT        NOT NULL,
  source        TEXT        NOT NULL,          -- original file name
  mime_type     TEXT,
  content_hash  TEXT        NOT NULL UNIQUE,   -- sha256 of the text: re-uploading the same file is skipped
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per chunk (piece of a document) with its embedding
CREATE TABLE IF NOT EXISTS chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  BIGINT  NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INT     NOT NULL,
  heading      TEXT,                            -- "Section > Subsection" the chunk belongs to
  content      TEXT    NOT NULL,
  embedding    vector({{EMBEDDING_DIM}}) NOT NULL,
  -- full-text search column for the keyword half of hybrid search, kept in sync automatically
  tsv          tsvector GENERATED ALWAYS AS (
                 to_tsvector('english', coalesce(heading, '') || ' ' || content)
               ) STORED
);

-- HNSW index: approximate nearest-neighbour search, fast even with millions of vectors
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS chunks_tsv_gin ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id);
