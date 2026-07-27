/**
 * Atlassian wiki markup → Markdown.
 *
 * JIRA REST API v2 returns rich text fields as wiki markup (Atlassian converts the
 * ADF tree for us). This module turns that into Markdown, which reads far better
 * for an LLM: `~~struck out~~` instead of `-struck out-`, `1.` instead of `#`.
 *
 * Pure function, no I/O — everything here is unit-tested offline.
 */

const SENTINEL = "\u0000";

/** Content inside these must survive untouched, or a `-flag-` in a code sample
 *  would come out as `~~flag~~`. */
function extractProtectedBlocks(src: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const stash = (rendered: string): string => {
    blocks.push(rendered);
    return `${SENTINEL}${blocks.length - 1}${SENTINEL}`;
  };

  let text = src.replace(
    /\{code(?::([^}]*))?\}\n?([\s\S]*?)\{code\}/g,
    (_m, attrs: string | undefined, body: string) =>
      stash("```" + codeLanguage(attrs) + "\n" + body.replace(/\n$/, "") + "\n```"),
  );

  text = text.replace(
    /\{noformat(?::[^}]*)?\}\n?([\s\S]*?)\{noformat\}/g,
    (_m, body: string) => stash("```\n" + body.replace(/\n$/, "") + "\n```"),
  );

  return { text, blocks };
}

/** `{code:html}` → html, `{code:title=X|language=php}` → php, `{code}` → "" */
function codeLanguage(attrs: string | undefined): string {
  if (!attrs) return "";
  const explicit = attrs.match(/(?:^|\|)language=([^|]+)/);
  if (explicit) return explicit[1].trim();
  const first = attrs.split("|")[0].trim();
  return first.includes("=") ? "" : first;
}

function inline(s: string): string {
  // {color:#97A0AF}*[ OPEN POINT ]*{color} → *[ OPEN POINT ]*  (bold applied below)
  s = s.replace(/\{color:[^}]*\}([\s\S]*?)\{color\}/g, "$1");

  // [text|url], [text|url|smart-link]; a bare URL as the text collapses to the URL
  s = s.replace(
    /\[([^\]|]*)\|([^\]|]+)(?:\|[^\]]*)?\]/g,
    (_m, text: string, url: string) =>
      text.trim() === "" || text.trim() === url.trim() ? url.trim() : `[${text.trim()}](${url.trim()})`,
  );
  s = s.replace(/\[((?:https?|ftp|mailto):[^\]\s|]+)\]/gi, "$1");

  // !image.png|width=686,alt="…"! — v2 carries the filename only, no fetchable id
  s = s.replace(/!([^!\s][^!\n]*)!/g, (_m, body: string) => `[image: ${body.split("|")[0].trim()}]`);

  s = s.replace(/\{\{([^}\n]+)\}\}/g, "`$1`");

  // -struck out- → ~~struck out~~ (the whole reason this module exists)
  s = s.replace(/(^|[\s(\[])-(?=\S)([^-\n]{1,300}?)(?<=\S)-(?=[\s).,;:!?\]]|$)/g, "$1~~$2~~");
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, "$1**$2**");
  s = s.replace(/(^|[^_\w])_(?!\s)([^_\n]+?)(?<!\s)_(?![_\w])/g, "$1*$2*");
  s = s.replace(/(^|[^+\w])\+(?!\s)([^+\n]+?)(?<!\s)\+(?![+\w])/g, "$1<u>$2</u>");

  return s;
}

function splitTableCells(line: string, header: boolean): string[] {
  const sep = header ? "||" : "|";
  let s = line.trim();
  if (s.startsWith(sep)) s = s.slice(sep.length);
  if (s.endsWith(sep)) s = s.slice(0, -sep.length);
  return s.split(sep).map((c) => c.trim());
}

/**
 * Block-level pass: headings, lists, tables, quotes, panels, rules.
 * Ordered-list numbering is tracked per nesting depth, so `#`/`##` nest correctly.
 */
function blockPass(text: string): string {
  const out: string[] = [];
  const counters: number[] = [];
  const types: string[] = [];
  let inQuote = false;
  let tableRows = 0;

  const resetLists = () => {
    counters.length = 0;
    types.length = 0;
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");

    if (/^\{quote\}$/.test(line)) {
      inQuote = !inQuote;
      continue;
    }
    const panel = line.match(/^\{panel(?::([^}]*))?\}$/);
    if (panel && !inQuote) {
      const title = panel[1]?.match(/title=([^|]+)/)?.[1];
      inQuote = true;
      if (title) out.push(`> **${title.trim()}**`, ">");
      continue;
    }
    if (panel && inQuote) {
      inQuote = false;
      continue;
    }
    if (inQuote) {
      out.push(line === "" ? ">" : `> ${line}`);
      continue;
    }

    // Tables: ||header||header|| followed by |cell|cell|
    if (/^\s*\|/.test(line)) {
      const header = line.trimStart().startsWith("||");
      const cells = splitTableCells(line, header);
      out.push(`| ${cells.join(" | ")} |`);
      if (++tableRows === 1) out.push(`| ${cells.map(() => "---").join(" | ")} |`);
      continue;
    }
    tableRows = 0;

    const heading = line.match(/^h([1-6])\.\s*(.*)$/);
    if (heading) {
      resetLists();
      out.push(`${"#".repeat(Number(heading[1]))} ${heading[2]}`);
      continue;
    }

    if (/^bq\.\s?/.test(line)) {
      out.push(`> ${line.replace(/^bq\.\s?/, "")}`);
      continue;
    }

    if (/^-{4,}$/.test(line)) {
      out.push("---");
      continue;
    }

    const list = line.match(/^([*#]+)\s+(.*)$/);
    if (list) {
      const markers = list[1];
      const depth = markers.length;

      if (counters.length > depth) {
        counters.length = depth;
        types.length = depth;
      }
      while (counters.length < depth) {
        counters.push(0);
        types.push(markers[counters.length - 1]);
      }
      if (types[depth - 1] !== markers[depth - 1]) {
        types[depth - 1] = markers[depth - 1];
        counters[depth - 1] = 0;
      }

      const bullet = markers[depth - 1] === "#" ? `${++counters[depth - 1]}.` : "-";
      out.push(`${"  ".repeat(depth - 1)}${bullet} ${list[2]}`);
      continue;
    }

    if (line === "") resetLists();
    out.push(line);
  }

  return out.join("\n");
}

const PLACEHOLDER_LINE = new RegExp(`^${SENTINEL}\\d+${SENTINEL}$`);

export function wikiToMarkdown(src: string | null | undefined): string {
  if (!src) return "";

  const { text, blocks } = extractProtectedBlocks(src.replace(/\r\n/g, "\n"));

  const rendered = blockPass(text)
    .split("\n")
    .map((line) => (PLACEHOLDER_LINE.test(line.trim()) ? line : inline(line)))
    .join("\n");

  return rendered
    .replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"), (_m, i: string) => blocks[Number(i)])
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}
