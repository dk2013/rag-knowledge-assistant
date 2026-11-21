// DELETE /api/documents/:id → removes the document; its chunks go too (ON DELETE CASCADE)
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  const result = await pool.query("DELETE FROM documents WHERE id = $1", [id]);
  return result.rowCount
    ? Response.json({ deleted: Number(id) })
    : Response.json({ error: "Not found" }, { status: 404 });
}
