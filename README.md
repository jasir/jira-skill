# jira-skill

A thin bash wrapper around the JIRA REST API v3 — packaged as a Claude Code / Cursor **skill** so an AI assistant can read tickets, add comments, search with JQL, and transition issues without any MCP server running.

The wrapper is just `curl` + `jq`. No Node, no Python, no daemons, no version drift.

## Why

- **MCP-free.** Works in any CLI agent (Claude Code, Cursor, plain shell). No `mcp-atlassian` to install, no Python virtualenv to maintain.
- **Token-efficient.** Output is pre-formatted text — one line per issue in lists, four lines for a single issue — instead of raw JSON.
- **Predictable.** A handful of subcommands, real exit codes, clear error messages (including the "JIRA returns 404 on auth failure" gotcha).

## What's in here

```
.
├── SKILL.md         # Skill manifest – instructions the AI agent reads
├── scripts/jira     # The bash wrapper (curl + jq)
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

| Operation | Command |
|-----------|---------|
| Get issue | `jira get PROJ-123` |
| Add comment | `jira comment PROJ-123 "text"` |
| Search JQL | `jira search "project=PROJ AND status=Open"` |
| List transitions | `jira transition PROJ-123` |
| Apply transition | `jira transition PROJ-123 "In Progress"` |
| Raw JSON | `jira --json get PROJ-123` |

See [`SKILL.md`](SKILL.md) for the full reference, examples, and troubleshooting.

## License

MIT — see [LICENSE](LICENSE).
