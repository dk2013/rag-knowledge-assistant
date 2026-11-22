"use client";

import { useEffect, useState } from "react";

interface Doc {
  id: number;
  title: string;
  source: string;
  chunks: number;
  created_at: string;
}

interface UploadResult {
  fileName: string;
  status: "ingested" | "skipped" | "error";
  chunks?: number;
  message?: string;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [readOnly, setReadOnly] = useState(false); // public demo: no uploads or deletes
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/documents");
    const data = await res.json();
    setDocs(data.documents ?? []);
    setReadOnly(Boolean(data.readOnly));
    setRepoUrl(data.repoUrl ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    setUploading(true);
    setResults([]);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      setResults(data.results ?? [{ fileName: "upload", status: "error", message: data.error }]);
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this document and all its chunks?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload Markdown, text or PDF files. Each file is split into chunks, embedded and stored in PostgreSQL
          (pgvector).
        </p>
      </div>

      {readOnly ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 text-sm">
          <p className="font-medium">This public demo is read-only.</p>
          <p className="mt-1 text-[var(--muted)]">
            The knowledge base contains sample documents about a fictional company. To upload your own Markdown, text or
            PDF files, run the project locally
            {repoUrl ? (
              <>
                {" "}
                (
                <a href={repoUrl} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">
                  source code on GitHub
                </a>
                )
              </>
            ) : null}
            .
          </p>
        </div>
      ) : (
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center ${
          dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel)]"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".md,.markdown,.txt,.pdf"
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <span className="font-medium">{uploading ? "Ingesting…" : "Drop files here or click to upload"}</span>
        <span className="mt-1 text-xs text-[var(--muted)]">.md, .txt, .pdf · up to 10 MB each</span>
      </label>
      )}

      {results.length > 0 && (
        <ul className="space-y-1 text-sm">
          {results.map((r, i) => (
            <li key={i} className={r.status === "error" ? "text-red-500" : "text-[var(--muted)]"}>
              {r.status === "ingested" ? "✓" : r.status === "skipped" ? "•" : "✗"} {r.fileName}
              {r.chunks ? ` — ${r.chunks} chunks` : ""}
              {r.message ? ` — ${r.message}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-normal">Title</th>
              <th className="px-4 py-2 font-normal">File</th>
              <th className="px-4 py-2 text-right font-normal">Chunks</th>
              <th className="px-4 py-2 font-normal">Added</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{d.title}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{d.source}</td>
                <td className="px-4 py-2 text-right">{d.chunks}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{new Date(d.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  {!readOnly && (
                    <button onClick={() => remove(d.id)} className="text-xs text-red-500 hover:underline">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
