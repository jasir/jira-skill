/**
 * Argument parsing and command routing.
 *
 * Parsing is separated from execution so both can be tested without a network:
 * `parseArgs` is pure, `run` takes an injected client.
 */

import { buildCommentDocument } from "./adf";
import { JiraClient, JiraError } from "./client";
import {
  changelogEntries,
  formatChangelog,
  formatComments,
  formatIssueHeader,
  formatSearchList,
} from "./format";
import { wikiToMarkdown } from "./wiki2md";

export type Command =
  | { name: "get"; key: string; fields?: string; json: boolean }
  | { name: "describe"; key: string; json: boolean }
  | { name: "comments"; key: string; json: boolean }
  | { name: "show"; key: string; json: boolean }
  | { name: "comment"; key: string; text: string }
  | { name: "comment-delete"; key: string; commentId: string }
  | { name: "search"; jql: string; max: number; json: boolean }
  | { name: "transition"; key: string; target?: string }
  | { name: "changelog"; key: string; max: number; skipSystem: boolean; json: boolean }
  | { name: "history"; key: string; maxChangelog: number; maxComments: number; skipSystem: boolean }
  | { name: "api"; method: string; path: string; query: Record<string, string>; body?: unknown }
  | { name: "help" };

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

export const HELP = `Usage: jira [--json] <command> [args...]

Commands:
  get <ISSUE-KEY> [-f f1,f2,...]    Issue header (with --json, pair -f to narrow the payload)
  describe <ISSUE-KEY>              Description as Markdown
  comments <ISSUE-KEY>              All comments (author, date, text)
  show <ISSUE-KEY>                  Header + description + comments (ONE API call)
  comment <ISSUE-KEY> <text>        Add comment ([[PROJ-1]] becomes a clickable issue card)
  comment-delete <ISSUE-KEY> <id>   Delete a comment (ids are shown by the comments command)
  search <JQL> [maxResults]         Search issues with JQL (default: 25)
  jql <JQL> [maxResults]            Alias for search
  transition <ISSUE-KEY> [status]   Transition issue status (no status = list available)
  changelog <ISSUE-KEY> [max]       Field-change history (default: 20)
  history <ISSUE-KEY> [maxLog] [maxComments]
                                    Header + changelog + comments in ONE call (default: 10, 5)
  api <METHOD> <path> [-q k=v] [-d json]
                                    Raw API v3 call — use instead of hand-writing curl

Flags:
  --json           Output raw JSON (API v3, so description/comments come back as ADF)
  --skip-system    changelog/history: hide Rank, IssueParentAssociation and friends

Rich text is read through API v2 and converted to Markdown. Struck-through text
(~~like this~~) means the reporter removed it from scope — do not implement it.

Examples:
  jira show PROJ-123
  jira get PROJ-123
  jira describe PROJ-123
  jira comment PROJ-123 "Fixed in build 1.2.3"
  jira comment PROJ-123 "Also covers [[PROJ-456]] — see there"
  jira search "project=PROJ AND status=Open AND assignee=currentUser()"
  jira transition PROJ-123 "In Progress"
  jira --json get PROJ-123 -f reporter,labels

Credentials: ~/.config/jira/credentials`;

/** Removes the flag from the argument list wherever it sits, and reports whether it was there. */
function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

/** Returns null on garbage so the caller can report it rather than passing NaN to the API. */
function positiveInt(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function parseArgs(argv: string[]): ParseResult {
  const args = [...argv];
  let json = false;
  if (args[0] === "--json") {
    json = true;
    args.shift();
  }

  const cmd = args.shift() ?? "help";
  const needKey = (): string | null => args.shift() ?? null;

  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      return { ok: true, command: { name: "help" } };

    case "get": {
      const key = needKey();
      if (!key) return { ok: false, error: "Usage: jira get <ISSUE-KEY> [-f field1,field2,...]" };
      let fields: string | undefined;
      if (args[0] === "-f" || args[0] === "--fields") {
        const flag = args.shift();
        fields = args.shift();
        if (!fields) return { ok: false, error: `Missing field list after ${flag}` };
      }
      return { ok: true, command: { name: "get", key, fields, json } };
    }

    case "describe":
    case "comments":
    case "show": {
      const key = needKey();
      if (!key) return { ok: false, error: `Usage: jira ${cmd} <ISSUE-KEY>` };
      return { ok: true, command: { name: cmd, key, json } };
    }

    case "comment": {
      const key = needKey();
      if (!key) return { ok: false, error: "Usage: jira comment <ISSUE-KEY> <text>" };
      const text = args.shift();
      if (!text) return { ok: false, error: "Missing comment text" };
      return { ok: true, command: { name: "comment", key, text } };
    }

    case "comment-delete": {
      const key = needKey();
      if (!key) return { ok: false, error: "Usage: jira comment-delete <ISSUE-KEY> <comment-id>" };
      const commentId = args.shift();
      if (!commentId) return { ok: false, error: "Missing comment id" };
      return { ok: true, command: { name: "comment-delete", key, commentId } };
    }

    case "changelog": {
      const key = needKey();
      if (!key) return { ok: false, error: "Usage: jira changelog <ISSUE-KEY> [max] [--skip-system]" };
      const skipSystem = takeFlag(args, "--skip-system");
      const max = positiveInt(args.shift(), 20);
      if (max === null) return { ok: false, error: "max must be a positive integer" };
      return { ok: true, command: { name: "changelog", key, max, skipSystem, json } };
    }

    case "history": {
      const key = needKey();
      if (!key) {
        return {
          ok: false,
          error: "Usage: jira history <ISSUE-KEY> [maxChangelog] [maxComments] [--skip-system]",
        };
      }
      const skipSystem = takeFlag(args, "--skip-system");
      const maxChangelog = positiveInt(args.shift(), 10);
      const maxComments = positiveInt(args.shift(), 5);
      if (maxChangelog === null || maxComments === null) {
        return { ok: false, error: "maxChangelog and maxComments must be positive integers" };
      }
      return { ok: true, command: { name: "history", key, maxChangelog, maxComments, skipSystem } };
    }

    case "api": {
      const method = args.shift()?.toUpperCase();
      const path = args.shift();
      if (!method || !path) {
        return { ok: false, error: "Usage: jira api <METHOD> <path> [-q key=val] [-d json]" };
      }

      const query: Record<string, string> = {};
      let body: unknown;
      while (args.length) {
        const flag = args.shift();
        const value = args.shift();
        if (value === undefined) return { ok: false, error: `Missing value after ${flag}` };

        if (flag === "-q" || flag === "--query") {
          const eq = value.indexOf("=");
          if (eq < 1) return { ok: false, error: `Query must be key=value, got: ${value}` };
          query[value.slice(0, eq)] = value.slice(eq + 1);
        } else if (flag === "-d" || flag === "--data") {
          try {
            body = JSON.parse(value);
          } catch {
            return { ok: false, error: `-d expects JSON, could not parse: ${value}` };
          }
        } else {
          return { ok: false, error: `Unknown flag for api: ${flag}` };
        }
      }

      return { ok: true, command: { name: "api", method, path: `/${path.replace(/^\/+/, "")}`, query, body } };
    }

    case "search":
    case "jql": {
      const jql = args.shift();
      if (!jql) return { ok: false, error: "Usage: jira search <JQL> [maxResults]" };
      const rawMax = args.shift();
      const max = rawMax === undefined ? 25 : Number(rawMax);
      if (!Number.isInteger(max) || max < 1) {
        return { ok: false, error: `maxResults must be a positive integer, got: ${rawMax}` };
      }
      return { ok: true, command: { name: "search", jql, max, json } };
    }

    case "transition": {
      const key = needKey();
      if (!key) return { ok: false, error: "Usage: jira transition <ISSUE-KEY> [status-name]" };
      return { ok: true, command: { name: "transition", key, target: args.shift() } };
    }

    default:
      return { ok: false, error: `Unknown command: ${cmd}\nRun 'jira help' for usage` };
  }
}

export interface Deps {
  client: JiraClient;
  out: (text: string) => void;
  err: (text: string) => void;
}

const SHOW_FIELDS = "summary,status,assignee,priority,description,comment";

export async function run(command: Command, deps: Deps): Promise<number> {
  const { client, out, err } = deps;
  const dumpJson = (value: unknown) => out(JSON.stringify(value, null, 2));

  try {
    switch (command.name) {
      case "help":
        out(HELP);
        return 0;

      case "get": {
        const issue = await client.request(3, `/issue/${command.key}`, {
          query: command.fields ? { fields: command.fields } : undefined,
        });
        command.json ? dumpJson(issue) : out(formatIssueHeader(issue, client.baseUrl));
        return 0;
      }

      case "describe": {
        if (command.json) {
          const issue = await client.request(3, `/issue/${command.key}`, {
            query: { fields: "description" },
          });
          dumpJson(issue.fields.description);
          return 0;
        }
        const issue = await client.request(2, `/issue/${command.key}`, {
          query: { fields: "description" },
        });
        out(wikiToMarkdown(issue.fields.description) || "(no description)");
        return 0;
      }

      case "comments": {
        const version = command.json ? 3 : 2;
        const payload = await client.request(version, `/issue/${command.key}/comment`);
        command.json ? dumpJson(payload) : out(formatComments(payload.comments));
        return 0;
      }

      case "show": {
        const version = command.json ? 3 : 2;
        const issue = await client.request(version, `/issue/${command.key}`, {
          query: { fields: SHOW_FIELDS },
        });
        if (command.json) {
          dumpJson(issue);
          return 0;
        }
        out(formatIssueHeader(issue, client.baseUrl));
        out("");
        out("── Description ──");
        out(wikiToMarkdown(issue.fields.description) || "(no description)");
        out("");
        out("── Comments ──");
        out(formatComments(issue.fields.comment?.comments));
        return 0;
      }

      case "comment": {
        const created = await client.request(3, `/issue/${command.key}/comment`, {
          method: "POST",
          body: { body: buildCommentDocument(command.text, client.baseUrl) },
        });
        out(`Comment added (id: ${created.id}) to ${command.key}`);
        return 0;
      }

      case "comment-delete": {
        await client.request(3, `/issue/${command.key}/comment/${command.commentId}`, {
          method: "DELETE",
        });
        out(`Comment deleted (id: ${command.commentId}) from ${command.key}`);
        return 0;
      }

      case "changelog": {
        const payload = await client.request(3, `/issue/${command.key}/changelog`, {
          query: { maxResults: String(Math.max(command.max, 100)) },
        });
        if (command.json) {
          dumpJson(payload);
          return 0;
        }
        out(
          formatChangelog(changelogEntries(payload), {
            limit: command.max,
            skipSystem: command.skipSystem,
          }),
        );
        return 0;
      }

      case "history": {
        // One call: header fields, comments and changelog all come back together.
        const issue = await client.request(2, `/issue/${command.key}`, {
          query: { fields: "summary,status,assignee,priority,comment", expand: "changelog" },
        });

        out(formatIssueHeader(issue, client.baseUrl));
        out("");
        out("── Changelog ──");
        out(
          formatChangelog(changelogEntries(issue), {
            limit: command.maxChangelog,
            skipSystem: command.skipSystem,
          }),
        );
        out("");
        out("── Comments ──");
        const comments = issue.fields?.comment?.comments ?? [];
        out(formatComments(comments.slice(-command.maxComments)));
        return 0;
      }

      case "api": {
        const payload = await client.request(3, command.path, {
          method: command.method,
          query: command.query,
          body: command.body,
        });
        dumpJson(payload);
        return 0;
      }

      case "search": {
        const result = await client.request(3, "/search/jql", {
          query: {
            jql: command.jql,
            maxResults: String(command.max),
            fields: "summary,status,assignee,priority",
          },
        });
        if (command.json) {
          dumpJson(result);
          return 0;
        }
        const issues = result.issues ?? [];
        out(issues.length ? formatSearchList(issues) : `(no matching issues — JQL: ${command.jql})`);
        return 0;
      }

      case "transition": {
        const { transitions = [] } = await client.request(
          3,
          `/issue/${command.key}/transitions`,
        );
        const names = transitions.map((t: any) => `  ${t.name}`).join("\n");

        if (!command.target) {
          out(`Available transitions for ${command.key}:`);
          out(names);
          return 0;
        }

        const match = transitions.find((t: any) => t.name === command.target);
        if (!match) {
          err(`Error: transition '${command.target}' not found for ${command.key}`);
          err("Available transitions:");
          err(names);
          return 1;
        }

        await client.request(3, `/issue/${command.key}/transitions`, {
          method: "POST",
          body: { transition: { id: match.id } },
        });
        out(`Transitioned ${command.key} → ${command.target}`);
        return 0;
      }
    }
  } catch (error) {
    err(error instanceof JiraError ? `Error: ${error.message}` : `Error: ${String(error)}`);
    return 1;
  }
}
