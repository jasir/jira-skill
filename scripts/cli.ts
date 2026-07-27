/**
 * Argument parsing and command routing.
 *
 * Parsing is separated from execution so both can be tested without a network:
 * `parseArgs` is pure, `run` takes an injected client.
 */

import { buildCommentDocument } from "./adf";
import { JiraClient, JiraError } from "./client";
import { formatComments, formatIssueHeader, formatSearchList } from "./format";
import { wikiToMarkdown } from "./wiki2md";

export type Command =
  | { name: "get"; key: string; fields?: string; json: boolean }
  | { name: "describe"; key: string; json: boolean }
  | { name: "comments"; key: string; json: boolean }
  | { name: "show"; key: string; json: boolean }
  | { name: "comment"; key: string; text: string }
  | { name: "search"; jql: string; max: number; json: boolean }
  | { name: "transition"; key: string; target?: string }
  | { name: "help" };

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

export const HELP = `Usage: jira [--json] <command> [args...]

Commands:
  get <ISSUE-KEY> [-f f1,f2,...]    Issue header (with --json, pair -f to narrow the payload)
  describe <ISSUE-KEY>              Description as Markdown
  comments <ISSUE-KEY>              All comments (author, date, text)
  show <ISSUE-KEY>                  Header + description + comments (ONE API call)
  comment <ISSUE-KEY> <text>        Add comment ([[PROJ-1]] becomes a clickable issue card)
  search <JQL> [maxResults]         Search issues with JQL (default: 25)
  jql <JQL> [maxResults]            Alias for search
  transition <ISSUE-KEY> [status]   Transition issue status (no status = list available)

Flags:
  --json    Output raw JSON (API v3, so description/comments come back as ADF)

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
