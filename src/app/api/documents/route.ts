// GET  /api/documents → list of documents with chunk counts
// POST /api/documents → multipart upload (field "files"), runs the ingestion pipeline for each file
import { config } from "@/lib/config";
import { pool } from "@/lib/db";
import { ingestFile } from "@/lib/ingest";
import { isSupported } from "@/lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET() {
  const { rows } = await pool.query(`
    SELECT d.id, d.title, d.source, d.mime_type, d.created_at, count(c.id)::int AS chunks
    FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
    GROUP BY d.id ORDER BY d.created_at DESC
  `);
  return Response.json({ documents: rows, readOnly: config.demoMode, repoUrl: config.repoUrl || null });
}

const DEMO_READ_ONLY_ERROR =
  "The public demo is read-only. Run the project locally to upload and delete your own documents.";

export async function POST(req: Request) {
  if (config.demoMode) return Response.json({ error: DEMO_READ_ONLY_ERROR }, { status: 403 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "No files uploaded" }, { status: 400 });

  const results = [];
  for (const file of files) {
    if (!isSupported(file.name)) {
      results.push({ fileName: file.name, status: "error", message: "Unsupported file type" });
    } else if (file.size > MAX_FILE_BYTES) {
      results.push({ fileName: file.name, status: "error", message: "File is larger than 10 MB" });
    } else {
      results.push(await ingestFile(file.name, new Uint8Array(await file.arrayBuffer())));
    }
  }
  return Response.json({ results });
}
