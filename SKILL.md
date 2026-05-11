---
name: using-jira
description: Use when querying JIRA issues, adding comments, searching with JQL, or transitioning issue status - wraps JIRA REST API v3 via curl script at ~/.local/bin/jira with formatted output; requires one-time credentials setup at ~/.config/jira/credentials
---

# Using JIRA

## Overview

Direct JIRA API access via local bash script. No MCP dependency, no version issues, token-efficient.

Script: `$BRAIN/skills/jira-skill/scripts/jira` → symlinked to `~/.local/bin/jira`

## One-Time Setup

**Create credentials file** (copy token from Claude Desktop config):

```bash
mkdir -p ~/.config/jira
cat > ~/.config/jira/credentials << 'EOF'
JIRA_URL=https://mallfresh.atlassian.net
JIRA_USER=jaroslav.povolny@kosik.cz
JIRA_TOKEN=<paste token here>
EOF
chmod 600 ~/.config/jira/credentials
```

**Where to find the current token:**
```bash
# Extract from Claude Desktop config (source of truth)
jq -r '.mcpServers["mcp-atlassian"].args[]' ~/.config/Claude/claude_desktop_config.json | grep token | sed 's/--jira-token=//'
```

**Token expired?** Generate new one at: `https://id.atlassian.com/manage-profile/security/api-tokens`
Then update `~/.config/jira/credentials`.

**Symlink script:**
```bash
ln -sf "$BRAIN/skills/jira-skill/scripts/jira" ~/.local/bin/jira
```

## Quick Reference

| Operation | Command |
|-----------|---------|
| Get issue | `jira get KNW-123` |
| Add comment | `jira comment KNW-123 "text"` |
| Search JQL | `jira search "project=KNW AND status=Open"` |
| Search alias | `jira jql "project=KNW AND assignee=currentUser()"` |
| List transitions | `jira transition KNW-123` |
| Apply transition | `jira transition KNW-123 "In Progress"` |
| Raw JSON | `jira --json get KNW-123` |

## Examples

```bash
# Get issue details
jira get KNW-29279
# → [Testing] KNW-29279: počítání počtu kusů pro přidání receptu
#   Assignee: Jaroslav Povol
#   Priority:  Medium
#   URL:       https://mallfresh.atlassian.net/browse/KNW-29279

# Add multiline comment (use $'...' for special chars)
jira comment KNW-29279 "Debug panel je za FF kosik.ff.recipesDebug"

# Find open issues in project
jira search "project=KNW AND status='In Progress'"

# List what transitions are available, then apply one
jira transition KNW-29279
jira transition KNW-29279 "To Done"
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `Error: HTTP 410` on search | Atlassian removed `/rest/api/3/search` – script now uses `/rest/api/3/search/jql` (already fixed) |
| `Error: not found (404)` even though issue exists | Token expired or wrong – check with `curl -u user:token https://mallfresh.atlassian.net/rest/api/3/myself` |
| Comment with apostrophes breaks | Use `$'text with \'quotes\''` or pass via variable |
| Transition name wrong | Run `jira transition KNW-123` (no status arg) to list available names |
| 404 on auth failure | JIRA returns 404 (not 401) when token is invalid but issue exists – always verify token first |

## Troubleshooting

```bash
# Test token validity
source ~/.config/jira/credentials
curl -sf -u "$JIRA_USER:$JIRA_TOKEN" "$JIRA_URL/rest/api/3/myself" | jq .displayName

# Show available transitions (no guessing)
jira transition KNW-29279

# Raw response for debugging
jira --json get KNW-29279 | jq .fields.status
```
