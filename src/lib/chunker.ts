// Step 2 of ingestion: split text into chunks small enough to embed and to fit in the prompt.
//
// Strategy (markdown-aware, recursive):
//   1. Split by markdown headings, remembering the heading path ("Handbook > Vacation").
//   2. Inside a section, pack whole paragraphs into a chunk until maxChars is reached.
//   3. A paragraph that is too long on its own is split by sentences, then by hard cut.
//   4. Each new chunk starts with the tail of the previous one (overlap), so a fact that
//      sits on a boundary is not lost.

export interface Chunk {
  index: number;
  heading: string | null;
  content: string;
}

export interface ChunkOptions {
  maxChars: number; // ~1000 chars ≈ 200–250 tokens
  overlapChars: number;
  markdown: boolean; // parse "# headings" only for real markdown files
}

const DEFAULTS: ChunkOptions = { maxChars: 1000, overlapChars: 150, markdown: true };
const MAX_HEADING_CHARS = 200; // a "# ..." line longer than this is text, not a heading

interface Section {
  heading: string | null;
  body: string;
}

function splitIntoSections(text: string, markdown: boolean): Section[] {
  // PDFs and plain text: one section, no heading parsing
  // (PDF extraction can glue a whole page into one line that happens to start with "#")
  if (!markdown) return [{ heading: null, body: text }];

  const sections: Section[] = [];
  const headingStack: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const body = current.join("\n").trim();
    const path = headingStack.filter(Boolean); // skips gaps when a doc jumps from # to ###
    if (body) sections.push({ heading: path.length ? path.join(" > ") : null, body });
    current = [];
  };

  for (const line of text.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match && match[2].length <= MAX_HEADING_CHARS) {
      flush();
      const level = match[1].length;
      headingStack.length = level - 1; // drop same-level and deeper headings
      headingStack[level - 1] = match[2];
    } else {
      current.push(line);
    }
  }
  flush();
  return sections;
}

function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  // try sentence boundaries first
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text];
  const parts: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (buf) parts.push(buf.trim()), (buf = "");
      for (let i = 0; i < sentence.length; i += maxChars) parts.push(sentence.slice(i, i + maxChars).trim());
      continue;
    }
    if ((buf + sentence).length > maxChars) {
      parts.push(buf.trim());
      buf = "";
    }
    buf += sentence;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function overlapTail(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return "";
  const tail = text.slice(-overlapChars);
  const firstSpace = tail.indexOf(" ");
  return firstSpace > 0 ? tail.slice(firstSpace + 1) : tail; // start on a word boundary
}

export function chunkText(text: string, options: Partial<ChunkOptions> = {}): Chunk[] {
  const { maxChars, overlapChars, markdown } = { ...DEFAULTS, ...options };
  const chunks: Chunk[] = [];

  for (const section of splitIntoSections(text, markdown)) {
    const paragraphs = section.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => splitLongText(p, maxChars));

    let buf = "";
    let hasNewText = false; // false when buf holds only the overlap copied from the previous chunk
    const push = () => {
      chunks.push({ index: chunks.length, heading: section.heading, content: buf.trim() });
      buf = overlapTail(buf, overlapChars);
      hasNewText = false;
    };

    for (const paragraph of paragraphs) {
      if (hasNewText && (buf + "\n\n" + paragraph).length > maxChars) push();
      buf = buf ? `${buf}\n\n${paragraph}` : paragraph;
      hasNewText = true;
    }
    if (hasNewText) push(); // last piece of the section
  }
  return chunks;
}

// The text we actually embed: heading + content gives the chunk context
// ("Vacation policy: 18 days" is better than just "18 days").
export function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

export function embeddingText(chunk: Pick<Chunk, "heading" | "content">): string {
  return chunk.heading ? `${chunk.heading}\n\n${chunk.content}` : chunk.content;
}
