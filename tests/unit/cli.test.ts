import { describe, expect, test } from "bun:test";
import { JiraClient } from "../../scripts/client";
import { parseArgs, run, type Command } from "../../scripts/cli";

const CREDS = { url: "https://example.atlassian.net", user: "me@example.com", token: "t0ken" };

function parsed(argv: string[]): Command {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.command;
}

function parseError(argv: string[]): string {
  const result = parseArgs(argv);
  if (result.ok) throw new Error("expected a parse error");
  return result.error;
}

describe("parseArgs", () => {
  test("no arguments falls back to help", () => {
    expect(parsed([]).name).toBe("help");
  });

  test("--json is accepted before the command", () => {
    expect(parsed(["--json", "get", "KNW-1"])).toEqual({
      name: "get",
      key: "KNW-1",
      fields: undefined,
      json: true,
    });
  });

  test("-f narrows the field list", () => {
    expect(parsed(["get", "KNW-1", "-f", "summary,labels"])).toMatchObject({
      fields: "summary,labels",
    });
  });

  test("search defaults to 25 results", () => {
    expect(parsed(["search", "project=KNW"])).toMatchObject({ max: 25 });
  });

  test("transition without a target means 'list them'", () => {
    expect(parsed(["transition", "KNW-1"])).toMatchObject({ target: undefined });
  });

  // The bash version printed `line 112: 1: Usage: ...` here — a broken ${1:?} message.
  test("a missing issue key produces a clean usage line", () => {
    expect(parseError(["describe"])).toBe("Usage: jira describe <ISSUE-KEY>");
    expect(parseError(["show"])).toBe("Usage: jira show <ISSUE-KEY>");
    expect(parseError(["get"])).toMatch(/^Usage: jira get <ISSUE-KEY>/);
  });

  test("a missing comment body is reported", () => {
    expect(parseError(["comment", "KNW-1"])).toBe("Missing comment text");
  });

  test("-f without a list is reported", () => {
    expect(parseError(["get", "KNW-1", "-f"])).toBe("Missing field list after -f");
  });

  test("a non-numeric maxResults is rejected instead of becoming NaN", () => {
    expect(parseError(["search", "project=KNW", "abc"])).toMatch(/positive integer, got: abc/);
  });

  test("an unknown command points at help", () => {
    expect(parseError(["frobnicate"])).toMatch(/Unknown command: frobnicate/);
  });

  test("comment-delete needs both a key and an id", () => {
    expect(parsed(["comment-delete", "KNW-1", "881685"])).toEqual({
      name: "comment-delete",
      key: "KNW-1",
      commentId: "881685",
    });
    expect(parseError(["comment-delete", "KNW-1"])).toBe("Missing comment id");
  });

  test("--skip-system is positional-independent", () => {
    expect(parsed(["changelog", "KNW-1", "--skip-system", "5"])).toMatchObject({
      max: 5,
      skipSystem: true,
    });
    expect(parsed(["changelog", "KNW-1", "5", "--skip-system"])).toMatchObject({
      max: 5,
      skipSystem: true,
    });
  });

  test("history defaults to 10 changelog entries and 5 comments", () => {
    expect(parsed(["history", "KNW-1"])).toMatchObject({ maxChangelog: 10, maxComments: 5 });
    expect(parsed(["history", "KNW-1", "3", "2"])).toMatchObject({
      maxChangelog: 3,
      maxComments: 2,
    });
  });

  test("api parses method, path and repeated -q pairs", () => {
    expect(parsed(["api", "get", "issue/KNW-1/watchers", "-q", "expand=x", "-q", "a=b"])).toEqual({
      name: "api",
      method: "GET",
      path: "/issue/KNW-1/watchers",
      query: { expand: "x", a: "b" },
      body: undefined,
    });
  });

  test("api keeps a value containing '=' intact", () => {
    expect(parsed(["api", "GET", "search/jql", "-q", "jql=project=KNW"])).toMatchObject({
      query: { jql: "project=KNW" },
    });
  });

  test("api rejects malformed query and data instead of sending them", () => {
    expect(parseError(["api", "GET", "x", "-q", "novalue"])).toMatch(/must be key=value/);
    expect(parseError(["api", "POST", "x", "-d", "{nope"])).toMatch(/-d expects JSON/);
    expect(parseError(["api", "GET", "x", "--bogus", "1"])).toMatch(/Unknown flag for api/);
  });
});

interface Route {
  match: RegExp;
  body: unknown;
}

function clientFor(routes: Route[], calls: string[] = []): JiraClient {
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    const route = routes.find((r) => r.match.test(String(url)));
    return new Response(JSON.stringify(route?.body ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return new JiraClient(CREDS, fetchImpl);
}

function collect() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}

const ISSUE = {
  key: "KNW-1",
  fields: {
    summary: "Replace the placeholders",
    status: { name: "In Progress" },
    assignee: { displayName: "Jane Doe" },
    priority: { name: "C" },
    description: "h3. Scope\n# keep this\n# -drop this-",
    comment: {
      comments: [
        { author: { displayName: "Ada" }, created: "2026-07-27T14:55:01.000+0200", body: "-nope-" },
      ],
    },
  },
};

describe("run", () => {
  test("show reads v2 and renders Markdown", async () => {
    const calls: string[] = [];
    const client = clientFor([{ match: /\/issue\/KNW-1/, body: ISSUE }], calls);
    const { out, deps } = collect();

    expect(await run(parsed(["show", "KNW-1"]), { client, ...deps })).toBe(0);

    expect(calls[0]).toContain("/rest/api/2/issue/KNW-1");
    const text = out.join("\n");
    expect(text).toContain("[In Progress] KNW-1: Replace the placeholders");
    expect(text).toContain("### Scope");
    expect(text).toContain("1. keep this");
    expect(text).toContain("2. ~~drop this~~");
    expect(text).toContain("── Ada — 2026-07-27 14:55");
    expect(text).toContain("~~nope~~");
  });

  test("--json switches show to v3 so the raw ADF stays reachable", async () => {
    const calls: string[] = [];
    const client = clientFor([{ match: /\/issue\/KNW-1/, body: ISSUE }], calls);
    const { deps } = collect();

    await run(parsed(["--json", "show", "KNW-1"]), { client, ...deps });
    expect(calls[0]).toContain("/rest/api/3/issue/KNW-1");
  });

  test("describe uses v2, get stays on v3", async () => {
    const calls: string[] = [];
    const client = clientFor([{ match: /\/issue\/KNW-1/, body: ISSUE }], calls);
    const { deps } = collect();

    await run(parsed(["describe", "KNW-1"]), { client, ...deps });
    await run(parsed(["get", "KNW-1"]), { client, ...deps });

    expect(calls[0]).toContain("/rest/api/2/");
    expect(calls[1]).toContain("/rest/api/3/");
  });

  test("an empty description says so instead of printing nothing", async () => {
    const client = clientFor([{ match: /./, body: { key: "KNW-1", fields: { description: null } } }]);
    const { out, deps } = collect();

    await run(parsed(["describe", "KNW-1"]), { client, ...deps });
    expect(out.join("\n")).toBe("(no description)");
  });

  test("an issue with no comments says so", async () => {
    const client = clientFor([{ match: /./, body: { comments: [] } }]);
    const { out, deps } = collect();

    await run(parsed(["comments", "KNW-1"]), { client, ...deps });
    expect(out.join("\n")).toBe("(no comments)");
  });

  test("an empty search result is explicit about the JQL", async () => {
    const client = clientFor([{ match: /search/, body: { issues: [] } }]);
    const { out, deps } = collect();

    await run(parsed(["search", "project=NOPE"]), { client, ...deps });
    expect(out.join("\n")).toBe("(no matching issues — JQL: project=NOPE)");
  });

  test("comment posts ADF to v3", async () => {
    const calls: string[] = [];
    const client = clientFor([{ match: /comment/, body: { id: "42" } }], calls);
    const { out, deps } = collect();

    await run(parsed(["comment", "KNW-1", "done"]), { client, ...deps });
    expect(calls[0]).toContain("/rest/api/3/issue/KNW-1/comment");
    expect(out.join("\n")).toBe("Comment added (id: 42) to KNW-1");
  });

  test("comment expands [[KEY]] into an inlineCard using the instance base URL", async () => {
    let sent = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ id: "42" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new JiraClient(CREDS, fetchImpl);
    const { deps } = collect();

    await run(parsed(["comment", "KNW-1", "see [[KNW-2]] too"]), { client, ...deps });

    expect(JSON.parse(sent).body.content[0].content).toEqual([
      { type: "text", text: "see " },
      {
        type: "inlineCard",
        attrs: { url: "https://example.atlassian.net/browse/KNW-2", localId: "link-KNW-2-0" },
      },
      { type: "text", text: " too" },
    ]);
  });

  test("transition without a target lists the available names", async () => {
    const client = clientFor([
      { match: /transitions/, body: { transitions: [{ id: "1", name: "Done" }] } },
    ]);
    const { out, deps } = collect();

    await run(parsed(["transition", "KNW-1"]), { client, ...deps });
    expect(out.join("\n")).toContain("  Done");
  });

  test("an unknown transition name fails with the list, not a silent no-op", async () => {
    const client = clientFor([
      { match: /transitions/, body: { transitions: [{ id: "1", name: "Done" }] } },
    ]);
    const { err, deps } = collect();

    expect(await run(parsed(["transition", "KNW-1", "Finished"]), { client, ...deps })).toBe(1);
    expect(err.join("\n")).toMatch(/transition 'Finished' not found/);
  });

  test("an HTTP failure exits non-zero with a readable message", async () => {
    const failing = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const client = new JiraClient(CREDS, failing);
    const { err, deps } = collect();

    expect(await run(parsed(["show", "KNW-1"]), { client, ...deps })).toBe(1);
    expect(err.join("\n")).toMatch(/Error: unauthorized \(401\)/);
  });

  test("comment-delete issues a DELETE", async () => {
    let method = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      method = String(init.method);
      return new Response("", { status: 204 });
    }) as unknown as typeof fetch;
    const { out, deps } = collect();

    await run(parsed(["comment-delete", "KNW-1", "42"]), {
      client: new JiraClient(CREDS, fetchImpl),
      ...deps,
    });

    expect(method).toBe("DELETE");
    expect(out.join("\n")).toBe("Comment deleted (id: 42) from KNW-1");
  });

  test("history gets header, changelog and comments in a single call", async () => {
    const calls: string[] = [];
    const client = clientFor(
      [
        {
          match: /issue\/KNW-1/,
          body: {
            key: "KNW-1",
            fields: {
              summary: "S",
              status: { name: "Done" },
              comment: { comments: [{ id: "7", author: { displayName: "Ada" }, body: "hi" }] },
            },
            changelog: {
              histories: [
                {
                  created: "2026-07-20T09:15:00.000+0200",
                  author: { displayName: "Ada" },
                  items: [{ field: "status", fromString: "To Do", toString: "Done" }],
                },
              ],
            },
          },
        },
      ],
      calls,
    );
    const { out, deps } = collect();

    await run(parsed(["history", "KNW-1"]), { client, ...deps });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("expand=changelog");
    const text = out.join("\n");
    expect(text).toContain("── Changelog ──");
    expect(text).toContain("status: To Do → Done");
    expect(text).toContain("── Comments ──");
    expect(text).toContain("(id: 7)");
  });

  test("api forwards method, query and body verbatim", async () => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const { out, deps } = collect();

    await run(parsed(["api", "post", "issue/KNW-1/watchers", "-d", '"acc-1"']), {
      client: new JiraClient(CREDS, fetchImpl),
      ...deps,
    });

    expect(calls[0].url).toContain("/rest/api/3/issue/KNW-1/watchers");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe('"acc-1"');
    expect(out.join("\n")).toBe('{\n  "ok": true\n}');
  });

  test("help does not need a client", async () => {
    const { out, deps } = collect();
    expect(await run(parsed(["help"]), { client: null as any, ...deps })).toBe(0);
    expect(out.join("\n")).toContain("Usage: jira");
  });
});
