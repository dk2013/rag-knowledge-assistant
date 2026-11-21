// Step 1 of ingestion: turn an uploaded file into plain text.
export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf"];

export function isSupported(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function parseToText(fileName: string, data: Uint8Array): Promise<string> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // unpdf wraps Mozilla's PDF.js and works in plain Node without native dependencies
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return normalize(Array.isArray(text) ? text.join("\n\n") : text);
  }

  if (isSupported(lower)) {
    return normalize(new TextDecoder("utf-8").decode(data));
  }

  throw new Error(`Unsupported file type: ${fileName}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n") // Windows line endings
    .replace(/[ \t]+\n/g, "\n") // trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse big gaps
    .trim();
}

export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
