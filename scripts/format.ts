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
  author?: { displayName?: string };
  created?: string;
  body?: string;
}

export function formatComments(comments: CommentLike[] | undefined): string {
  if (!comments?.length) return "(no comments)";

  return comments
    .map((c) => {
      const author = c.author?.displayName ?? "Unknown";
      const when = (c.created ?? "").slice(0, 16).replace("T", " ");
      return `── ${author} — ${when}\n${wikiToMarkdown(c.body)}\n`;
    })
    .join("\n");
}
