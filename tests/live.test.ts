/**
 * Smoke test against a real JIRA. Opt-in, because it needs credentials and a
 * reachable instance:
 *
 *   JIRA_LIVE_TEST=1 JIRA_TEST_ISSUE=PROJ-123 bun test tests/live.test.ts
 *
 * It only reads. The write path (`comment`) is covered by unit tests plus the
 * "malformed request would 400, a missing issue 404s" check below, so running
 * the suite never posts anything to a real ticket.
 */

import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { JiraClient, JiraError, parseCredentials } from "../scripts/client";
import { parseArgs, run } from "../scripts/cli";

const enabled = process.env.JIRA_LIVE_TEST === "1";
const issueKey = process.env.JIRA_TEST_ISSUE;

describe.skipIf(!enabled)("live JIRA", () => {
  const credentialsPath =
    process.env.JIRA_CREDENTIALS ?? join(homedir(), ".config/jira/credentials");

  async function client(): Promise<JiraClient> {
    return new JiraClient(parseCredentials(await Bun.file(credentialsPath).text()));
  }

  function collect() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, deps: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
  }

  test("credentials are valid", async () => {
    const me = await (await client()).request(3, "/myself");
    expect(me.accountId).toBeString();
  });

  test.skipIf(!issueKey)("show renders a real issue", async () => {
    const { out, deps } = collect();
    const parsedArgs = parseArgs(["show", issueKey!]);
    if (!parsedArgs.ok) throw new Error(parsedArgs.error);

    expect(await run(parsedArgs.command, { client: await client(), ...deps })).toBe(0);
    const text = out.join("\n");
    expect(text).toContain(issueKey!);
    expect(text).toContain("── Description ──");
    expect(text).toContain("── Comments ──");
    // Wiki markup must not leak through the converter.
    expect(text).not.toMatch(/\{color:/);
    expect(text).not.toMatch(/\|smart-link\]/);
    expect(text).not.toMatch(/\{\{/);
  });

  test("a missing issue produces the 404 message, not a crash", async () => {
    const { err, deps } = collect();
    const parsedArgs = parseArgs(["show", "ZZZZ-999999"]);
    if (!parsedArgs.ok) throw new Error(parsedArgs.error);

    expect(await run(parsedArgs.command, { client: await client(), ...deps })).toBe(1);
    expect(err.join("\n")).toMatch(/not found \(404\)/);
  });

  test("the comment endpoint accepts our ADF shape (404 on a fake key, never 400)", async () => {
    const c = await client();
    try {
      await c.request(3, "/issue/ZZZZ-999999/comment", {
        method: "POST",
        body: {
          body: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: "shape check" }] }],
          },
        },
      });
      expect.unreachable();
    } catch (error) {
      // 400 would mean our ADF body is malformed; 404 means the body was fine
      // and only the issue key was rejected.
      expect((error as JiraError).status).toBe(404);
    }
  });
});
