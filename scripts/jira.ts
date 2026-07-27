#!/usr/bin/env bun
/** Entry point. Wiring only — the logic lives in cli.ts / client.ts / wiki2md.ts. */

import { homedir } from "node:os";
import { join } from "node:path";
import { CREDENTIALS_HELP, JiraClient, JiraError, parseCredentials } from "./client";
import { parseArgs, run } from "./cli";

const credentialsPath = process.env.JIRA_CREDENTIALS ?? join(homedir(), ".config/jira/credentials");

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}

// `help` must work before credentials exist, or a fresh install is a dead end.
if (parsed.command.name === "help") {
  const code = await run(parsed.command, {
    client: null as unknown as JiraClient,
    out: console.log,
    err: console.error,
  });
  process.exit(code);
}

const file = Bun.file(credentialsPath);
if (!(await file.exists())) {
  console.error(`Error: missing credentials file: ${credentialsPath}\n\n${CREDENTIALS_HELP}`);
  process.exit(1);
}

let client: JiraClient;
try {
  client = new JiraClient(parseCredentials(await file.text()));
} catch (error) {
  const detail = error instanceof JiraError ? error.message : String(error);
  console.error(`Error: ${detail} (${credentialsPath})\n\n${CREDENTIALS_HELP}`);
  process.exit(1);
}

process.exit(await run(parsed.command, { client, out: console.log, err: console.error }));
