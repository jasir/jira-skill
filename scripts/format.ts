/** Rendering of JIRA payloads into the plain text an agent reads. */

import { wikiToMarkdown } from "./wiki2md";

export interface IssueLike {
  key: string;
  fields: Record<string, any>;
}

export function formatIssueHeader(issue: IssueLike, baseUrl: string): string {
  const f = issue.fields ?? {};
  return [
    `[${f.status?.name ?? "?"}] ${issue.key}: ${f.summary ?? ""}`,
    `Assignee:  ${f.assignee?.displayName ?? "Unassigned"}`,
    `Priority:  ${f.priority?.name ?? "—"}`,
    `URL:       ${baseUrl}/browse/${issue.key}`,
  ].join("\n");
}

export function formatSearchList(issues: IssueLike[]): string {
  return issues
    .map((i) => `[${i.fields?.status?.name ?? "?"}] ${i.key}: ${i.fields?.summary ?? ""}`)
    .join("\n");
}

export interface CommentLike {
  id?: string;
  author?: { displayName?: string };
  created?: string;
  body?: string;
}

/** Ids are printed because `jira comment-delete` needs them. */
export function formatComments(comments: CommentLike[] | undefined): string {
  if (!comments?.length) return "(no comments)";

  return comments
    .map((c) => {
      const author = c.author?.displayName ?? "Unknown";
      const id = c.id ? ` (id: ${c.id})` : "";
      return `── ${author} — ${shortDate(c.created)}${id}\n${wikiToMarkdown(c.body)}\n`;
    })
    .join("\n");
}

function shortDate(value: string | undefined): string {
  return (value ?? "").slice(0, 16).replace("T", " ");
}

export interface ChangelogEntry {
  created?: string;
  author?: { displayName?: string };
  items?: { field?: string; fromString?: string; from?: string; toString?: string; to?: string }[];
}

/** Fields JIRA writes for its own bookkeeping — noise in a human-read history. */
export const SYSTEM_FIELDS = ["IssueParentAssociation", "Rank", "WorklogId", "Attachment"];

/**
 * `expand=changelog` returns `{changelog: {histories}}`, the dedicated endpoint
 * returns `{values}`. Both shapes land here.
 */
export function changelogEntries(payload: any): ChangelogEntry[] {
  return payload?.values ?? payload?.changelog?.histories ?? payload?.histories ?? [];
}

export function formatChangelog(
  entries: ChangelogEntry[],
  options: { limit?: number; skipSystem?: boolean } = {},
): string {
  const { limit, skipSystem = false } = options;

  const rendered = [...entries]
    .sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""))
    .slice(limit === undefined ? 0 : -limit)
    .map((entry) => {
      const items = (entry.items ?? []).filter(
        (item) => !skipSystem || !SYSTEM_FIELDS.includes(item.field ?? ""),
      );
      if (!items.length) return null;

      const header = `${shortDate(entry.created)} — ${entry.author?.displayName ?? "Unknown"}`;
      const changes = items.map(
        (i) => `  ${i.field ?? "field"}: ${value(i.fromString ?? i.from)} → ${value(i.toString ?? i.to)}`,
      );
      return [header, ...changes].join("\n");
    })
    .filter((block): block is string => block !== null);

  return rendered.length ? rendered.join("\n\n") : "(no changelog entries)";
}

/**
 * A changelog says *that* something changed. Printing both full versions of a
 * long field — a rewritten description runs to hundreds of lines of raw wiki
 * markup — buries the fact in noise and costs an agent its context window.
 * The untruncated values remain available via `jira --json changelog`.
 */
export const VALUE_LIMIT = 120;

function value(raw: string | undefined | null): string {
  if (raw === undefined || raw === null || raw === "") return "(empty)";

  const flattened = String(raw).replace(/\s+/g, " ").trim();
  if (flattened === "") return "(empty)";

  return flattened.length <= VALUE_LIMIT
    ? flattened
    : `${flattened.slice(0, VALUE_LIMIT)}… (${flattened.length} chars)`;
}
