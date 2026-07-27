# jira-skill

A small JIRA REST client — packaged as a Claude Code / Cursor **skill** so an AI assistant can read tickets, add comments, search with JQL, and transition issues without any MCP server running.

Written in TypeScript, run with [Bun](https://bun.sh). No daemons, no virtualenv, no MCP.

## Why

- **MCP-free.** Works in any CLI agent (Claude Code, Cursor, plain shell). No `mcp-atlassian` to install, no Python virtualenv to maintain.
- **Readable ticket text.** Rich text comes back as Markdown: struck-out scope as `~~text~~`, numbered lists as `1.`, tables as tables, attachments named rather than dropped. An agent that cannot see a strikethrough will happily implement cancelled work.
- **Token-efficient.** `jira show` returns header + description + comments in _one_ API call, already rendered — no raw JSON for the agent to wade through.
- **Predictable.** A handful of subcommands, real exit codes, clear error messages (including the "JIRA returns 404 on auth failure" gotcha and an explicit `(no matching issues — JQL: ...)` line on empty searches so the agent doesn't second-guess).
- **Tested.** Offline unit tests for the converter, the HTTP error paths and argument parsing, plus behavioural scenarios run against real models.

## How it reads rich text

JIRA stores rich text as ADF (Atlassian Document Format), a JSON tree. Rather than re-implementing
a renderer for every node type — and silently losing whichever types it does not know — this client
reads text through the **v2 API**, which hands back Atlassian's own flattening into wiki markup, and
converts that to Markdown.

`--json` still reads **v3** and returns raw ADF, so nothing is out of reach.

| In the ticket | You see |
|---|---|
| struck-out text | `~~text~~` — **removed from scope** |
| numbered list, nested | `1.` `2.`, indented per level |
| status lozenge | `**[ OPEN POINT ]**` |
| attachment | `[image: filename.png]` |
| smart link | the URL |
| link to another ticket | `[PROJ-456](…/browse/PROJ-456)` |
| table | Markdown table |

Known gap: checkbox items lose their TODO/DONE state — the v2 API does not carry it. Use
`jira --json show PROJ-123` and read `taskItem.attrs.state` when it matters.

## What's in here

```
.
├── SKILL.md              # Skill manifest – instructions the AI agent reads
├── scripts/
│   ├── jira              # bash launcher (resolves bun, then execs jira.ts)
│   ├── jira.ts           # entry point
│   ├── cli.ts            # argument parsing + command routing
│   ├── client.ts         # REST client, injectable fetch
│   ├── wiki2md.ts        # wiki markup → Markdown (pure, read side)
│   ├── adf.ts            # Markdown-ish text → ADF (pure, write side)
│   └── format.ts         # issue/comment/search rendering
├── tests/
│   ├── unit/             # offline unit + fixture tests (bun test)
│   ├── fixtures/         # synthetic wiki → markdown document pairs
│   ├── live.test.ts      # opt-in smoke test against a real JIRA
│   ├── <NN>-<name>.json  # behavioural scenarios for model runs
│   └── results/          # per-model scenario results
└── docs/                 # design notes
```

## Install

```bash
git clone https://github.com/jasir/jira-skill.git
cd jira-skill

# 1. Install bun if you don't have it
command -v bun || curl -fsSL https://bun.sh/install | bash

# 2. Symlink the launcher onto your PATH
mkdir -p ~/.local/bin
ln -sf "$(pwd)/scripts/jira" ~/.local/bin/jira

# 3. Create credentials (generate token at https://id.atlassian.com/manage-profile/security/api-tokens)
mkdir -p ~/.config/jira
cat > ~/.config/jira/credentials << 'EOF'
JIRA_URL=https://your-instance.atlassian.net
JIRA_USER=your.email@example.com
JIRA_TOKEN=<paste API token here>
EOF
chmod 600 ~/.config/jira/credentials

# 4. Verify
jira get PROJ-123
```

Requires `bash` and `bun`. The bash launcher exists because `BUN_INSTALL` is usually exported from
`~/.bashrc`, which non-interactive shells skip — it finds bun anyway, and prints an install command
instead of `env: bun: No such file` when bun really is missing.

## Use as a skill

### Claude Code / Cursor with skills support

Drop (or symlink) the repository into a directory the agent reads as a skills folder, e.g.:

```bash
ln -s "$(pwd)" ~/.claude/skills/jira-skill
```

The agent picks up `SKILL.md` and will invoke the `jira` command when the user asks about tickets.

### Plain CLI

It's just a script — call `jira help` for usage.

## Commands

| Operation                              | Command                                                     | API calls |
| -------------------------------------- | ----------------------------------------------------------- | --------- |
| Issue header                           | `jira get PROJ-123`                                         | 1         |
| Description (Markdown)                 | `jira describe PROJ-123`                                    | 1         |
| Comments (author, date, text)          | `jira comments PROJ-123`                                    | 1         |
| **Header + description + comments**    | **`jira show PROJ-123`**                                    | **1**     |
| Add comment                            | `jira comment PROJ-123 "text"`                              | 1         |
| Comment linking another ticket          | `jira comment PROJ-123 "see [[PROJ-456]]"`                  | 1         |
| Delete comment                         | `jira comment-delete PROJ-123 881685`                       | 1         |
| Field-change history                   | `jira changelog PROJ-123 [max] [--skip-system]`             | 1         |
| **Header + changelog + comments**      | **`jira history PROJ-123`**                                 | **1**     |
| Raw REST call                          | `jira api GET issue/PROJ-123/watchers`                      | 1         |
| Search JQL                             | `jira search "project=PROJ AND status=Open"`                | 1         |
| List transitions                       | `jira transition PROJ-123`                                  | 1         |
| Apply transition                       | `jira transition PROJ-123 "In Progress"`                    | 2         |
| Raw JSON / ADF                         | `jira --json get PROJ-123 \| jq ...`                        | 1         |
| Raw JSON, narrowed payload             | `jira --json get PROJ-123 -f reporter,labels \| jq .fields` | 1         |

The last row matters: a default `--json get` returns ~200 fields. `-f` narrows that to the ones you actually need — a real context-window saving when an AI agent reads the response.

See [`SKILL.md`](SKILL.md) for the full reference, examples, and troubleshooting.

## Tests

```bash
bun test tests/unit                                          # offline, fast
JIRA_LIVE_TEST=1 JIRA_TEST_ISSUE=PROJ-123 bun test tests/live.test.ts
```

The live suite only reads. The write path is checked by posting a well-formed comment body to a
non-existent issue key and asserting a 404 rather than a 400, so running the tests never comments on
a real ticket.

`tests/fixtures/*.wiki` → `*.md` are whole-document regression pairs. They are **synthetic**: this
repository is public, so real ticket text is not committed.

`tests/<NN>-<name>.json` are behavioural scenarios — a prompt plus expected behaviours and
anti-patterns — driven against real models, with results in `tests/results/`. Unit tests prove the
converter emits `~~`; only a scenario proves an agent acts on it.

## License

MIT — see [LICENSE](LICENSE).
