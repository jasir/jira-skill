/**
 * Building ADF for the write path — the mirror of wiki2md.ts.
 *
 * Comments are posted as ADF. A plain `text` node containing "KNW-123" renders
 * as dead text in the JIRA UI; a clickable issue card is an `inlineCard` node
 * pointing at the browse URL. `[[KEY]]` markers in the comment text are expanded
 * into those cards.
 *
 * Pure functions, no I/O.
 */

export const ISSUE_KEY = /[A-Z][A-Z0-9]+-\d+/;
const MARKER = /\[\[([A-Z][A-Z0-9]+-\d+)\]\]/g;

export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

export interface AdfDocument {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

/**
 * One line of text → alternating `text` and `inlineCard` nodes.
 * `[[KNW-1]]` becomes a card; a bare `KNW-1` is left alone, so existing
 * comment text keeps working unchanged.
 */
function inlineNodes(line: string, baseUrl: string, counter: { n: number }): AdfNode[] {
  const nodes: AdfNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(MARKER)) {
    const key = match[1];
    const before = line.slice(cursor, match.index);
    if (before) nodes.push({ type: "text", text: before });

    nodes.push({
      type: "inlineCard",
      attrs: { url: `${baseUrl}/browse/${key}`, localId: `link-${key}-${counter.n++}` },
    });
    cursor = match.index + match[0].length;
  }

  const rest = line.slice(cursor);
  if (rest) nodes.push({ type: "text", text: rest });

  return nodes;
}

/**
 * Blank lines separate paragraphs; single newlines become hard breaks. The bash
 * version put the whole comment — newlines included — into one text node, which
 * is not valid ADF.
 */
export function buildCommentDocument(text: string, baseUrl: string): AdfDocument {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const counter = { n: 0 };

  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.split("\n"));

  const content: AdfNode[] = paragraphs.map((lines) => {
    const nodes: AdfNode[] = [];
    lines.forEach((line, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      nodes.push(...inlineNodes(line, trimmedBase, counter));
    });
    // An empty paragraph must not carry an empty content array.
    return nodes.length ? { type: "paragraph", content: nodes } : { type: "paragraph" };
  });

  return { type: "doc", version: 1, content };
}
