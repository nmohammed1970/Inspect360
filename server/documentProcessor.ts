import mammoth from 'mammoth';
import { readFile } from "fs/promises";
import { ObjectStorageService } from "./objectStorage";

export interface ProcessedDocument {
  extractedText: string;
  pageCount?: number;
  error?: string;
}

export async function extractTextFromFile(
  fileUrl: string,
  fileType: string
): Promise<ProcessedDocument> {
  try {
    const fileBuffer = await readDocumentBytes(fileUrl);

    if (fileType === 'pdf' || fileType === 'application/pdf') {
      return await extractTextFromPDF(fileBuffer);
    } else if (
      fileType === 'docx' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return await extractTextFromWord(fileBuffer);
    } else if (fileType === 'txt' || fileType === 'text/plain') {
      return {
        extractedText: fileBuffer.toString('utf-8'),
      };
    } else {
      return {
        extractedText: '',
        error: `Unsupported file type: ${fileType}`,
      };
    }
  } catch (error: any) {
    console.error('[Document Processor] Error extracting text:', error);
    return {
      extractedText: '',
      error: error.message || 'Failed to extract text from document',
    };
  }
}

async function readDocumentBytes(fileUrl: string): Promise<Buffer> {
  let pathname = fileUrl;
  try {
    pathname = new URL(fileUrl).pathname;
  } catch {
    pathname = fileUrl;
  }
  if (pathname.startsWith("/objects/")) {
    const file = await new ObjectStorageService().getObjectEntityFile(pathname);
    return readFile(file.name);
  }
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function extractTextFromPDF(buffer: Buffer): Promise<ProcessedDocument> {
  let parser: { getText: () => Promise<{ text?: string; total?: number }>; destroy: () => Promise<void> } | null = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return {
      extractedText: result.text || "",
      pageCount: result.total,
    };
  } catch (error: any) {
    console.error("[PDF Parser] Error:", error);
    return {
      extractedText: "",
      error: error.message || "Failed to parse PDF",
    };
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function extractTextFromWord(buffer: Buffer): Promise<ProcessedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      extractedText: result.value,
    };
  } catch (error: any) {
    console.error('[Word Parser] Error:', error);
    return {
      extractedText: '',
      error: error.message || 'Failed to parse Word document',
    };
  }
}

export function chunkText(text: string, chunkSize: number = 2000): string[] {
  const sentences = text.split(/[.!?]\s+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= chunkSize) {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

const SEARCH_STOP_WORDS = new Set([
  "the", "and", "for", "with", "what", "does", "about", "this", "that", "from",
  "your", "have", "how", "can", "are", "was", "you", "please", "say", "says",
]);

export function knowledgeBaseSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || SEARCH_STOP_WORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }
  return terms.slice(0, 8);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findRelevantChunks(
  text: string,
  query: string,
  maxChunks: number = 3
): string[] {
  const chunks = chunkText(text);
  const queryTerms = knowledgeBaseSearchTerms(query);

  const scoredChunks = chunks.map((chunk) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const matches = (chunkLower.match(new RegExp(escapeRegExp(term), "g")) || []).length;
      score += matches;
    }

    return { chunk, score };
  });

  return scoredChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map((item) => item.chunk);
}

export function buildKnowledgeBaseContext(
  documents: { id: string; title: string; extractedText?: string | null }[],
  query: string,
): { contextText: string; usedDocIds: string[] } {
  const passages: string[] = [];
  const usedDocIds: string[] = [];

  for (const doc of documents.slice(0, 3)) {
    const text = (doc.extractedText || "").trim();
    if (!text) continue;
    const relevant = findRelevantChunks(text, query, 2);
    const passage = relevant.length > 0 ? relevant.join("\n\n") : text.slice(0, 1500);
    passages.push(`${doc.title}\n${passage}`);
    usedDocIds.push(doc.id);
  }

  const contextText = passages.length > 0
    ? `Based on the Inspect360 knowledge base:\n\n${passages.join("\n\n---\n\n")}\n\n`
    : "";

  return { contextText, usedDocIds };
}
