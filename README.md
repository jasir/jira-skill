# jira-skill

A thin bash wrapper around the JIRA REST API v3 — packaged as a Claude Code / Cursor **skill** so an AI assistant can read tickets, add comments, search with JQL, and transition issues without any MCP server running.

The wrapper is just `curl` + `jq`. No Node, no Python, no daemons, no version drift.

## Why

- **MCP-free.** Works in any CLI agent (Claude Code, Cursor, plain shell). No `mcp-atlassian` to install, no Python virtualenv to maintain.
- **Token-efficient.** Output is pre-formatted text. `jira show` returns header + description + comments in *one* API call with the ADF (Atlassian Document Format) already rendered to plain text — no raw JSON for the agent to wade through.
- **Predictable.** A handful of subcommands, real exit codes, clear error messages (including the "JIRA returns 404 on auth failure" gotcha and an explicit `(no matching issues — JQL: ...)` line on empty searches so the agent doesn't second-guess).
- **TDD-tested.** The repo ships test scenarios (`tests/*.json`) and result snapshots across Opus 4.7 / Sonnet 4.6, so behavior changes don't regress silently.

## What's in here

```
.
├── SKILL.md         # Skill manifest – instructions the AI agent reads
├── scripts/jira     # The bash wrapper (curl + jq)
├── tests/           # TDD scenarios + per-model result snapshots
└── README.md        # This file
```

## Install

```bash
git clone https://github.com/jasir/jira-skill.git
cd jira-skill

# 1. Symlink the script onto your PATH
mkdir -p ~/.local/bin
ln -sf "$(pwd)/scripts/jira" ~/.local/bin/jira

# 2. Create credentials (generate token at https://id.atlassian.com/manage-profile/security/api-tokens)
mkdir -p ~/.config/jira
cat > ~/.config/jira/credentials << 'EOF'
JIRA_URL=https://your-instance.atlassian.net
JIRA_USER=your.email@example.com
JIRA_TOKEN=<paste API token here>
EOF
chmod 600 ~/.config/jira/credentials

# 3. Verify
jira get PROJ-123
```

Requires `bash`, `curl`, and `jq`.

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

| Operation | Command | API calls |
|-----------|---------|-----------|
| Issue header | `jira get PROJ-123` | 1 |
| Description (plain text, ADF rendered) | `jira describe PROJ-123` | 1 |
| Comments (author, date, text) | `jira comments PROJ-123` | 1 |
| **Header + description + comments** | **`jira show PROJ-123`** | **1** |
| Add comment | `jira comment PROJ-123 "text with [[OTHER-123]]"` | 1 |
| Delete comment | `jira comment-delete PROJ-123 881685` | 1 |
| Changelog | `jira changelog PROJ-123 20 --skip-system` | 1 |
| Combined history | `jira history PROJ-123 10 5 --skip-system` | 2 |
| Generic REST API | `jira api GET issue/PROJ-123/changelog -q maxResults=20` | 1 |
| Search JQL | `jira search "project=PROJ AND status=Open"` | 1 |
| List transitions | `jira transition PROJ-123` | 1 |
| Apply transition | `jira transition PROJ-123 "In Progress"` | 2 |
| Raw JSON (custom extraction) | `jira --json get PROJ-123 \| jq ...` | 1 |
| Raw JSON, narrowed payload | `jira --json get PROJ-123 -f reporter,labels \| jq .fields` | 1 |

The last row matters: a default `--json get` returns ~200 fields. `-f` narrows that to the ones you actually need — a real context-window saving when an AI agent reads the response.

See [`SKILL.md`](SKILL.md) for the full reference, examples, and troubleshooting.

## Linking issues in comments

Use `[[KEY]]` inside `jira comment` text for clickable JIRA issue cards:

```bash
jira comment PROJ-123 "Also covers [[KNW-30718]]"
```

`**KNW-30718**` (markdown bold) or plain `KNW-30718` will not create an inline issue card in JIRA UI.

## History and API access

- `jira changelog PROJ-123 [maxResults] [--skip-system]` prints formatted field history.
- `jira history PROJ-123 [maxChangelog] [maxComments] [--skip-system]` prints header + recent changelog + recent comments.
- `jira api <METHOD> <path> [-q key=val] [-d json | -f file.json]` gives generic access under `/rest/api/3/`.

Use dedicated commands first; use `jira api` for endpoints not yet wrapped. Keep raw `curl` only for troubleshooting token checks (`/myself`).

## Tests

The `tests/` directory holds JSON scenarios (`<NN>-<name>.json`) — each scenario is a prompt + expected behaviors + anti-patterns to check against. Results per model live in `tests/results/`, and `tests/results/SUMMARY.md` keeps the compatibility matrix.

Each scenario is small enough to drive an Agent invocation directly. The format is intentionally model-agnostic so you can re-run against any new release.

## License

MIT — see [LICENSE](LICENSE).
