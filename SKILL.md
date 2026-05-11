---
name: using-jira
description: Use when querying JIRA issues, adding comments, searching with JQL, or transitioning issue status - wraps JIRA REST API v3 via curl script at ~/.local/bin/jira with formatted output; requires one-time credentials setup at ~/.config/jira/credentials
---

# Using JIRA

## Overview

Direct JIRA API access via local bash script. No MCP dependency, no version issues, token-efficient.

Script: `scripts/jira` → symlinked to `~/.local/bin/jira`

## One-Time Setup

**Create credentials file:**

```bash
mkdir -p ~/.config/jira
cat > ~/.config/jira/credentials << 'EOF'
JIRA_URL=https://your-instance.atlassian.net
JIRA_USER=your.email@example.com
JIRA_TOKEN=<paste API token here>
EOF
chmod 600 ~/.config/jira/credentials
```

**Generate an API token:** `https://id.atlassian.com/manage-profile/security/api-tokens`

**Symlink script onto your PATH:**
```bash
ln -sf "$(pwd)/scripts/jira" ~/.local/bin/jira
```

## Quick Reference

| Operation | Command |
|-----------|---------|
| Get issue | `jira get PROJ-123` |
| Add comment | `jira comment PROJ-123 "text"` |
| Search JQL | `jira search "project=PROJ AND status=Open"` |
| Search alias | `jira jql "project=PROJ AND assignee=currentUser()"` |
| List transitions | `jira transition PROJ-123` |
| Apply transition | `jira transition PROJ-123 "In Progress"` |
| Raw JSON | `jira --json get PROJ-123` |

## Examples

```bash
# Get issue details
jira get PROJ-123
# → [In Progress] PROJ-123: Implement feature X
#   Assignee: Jane Doe
#   Priority:  Medium
#   URL:       https://your-instance.atlassian.net/browse/PROJ-123

# Add multiline comment (use $'...' for special chars)
jira comment PROJ-123 "Fixed in build 1.2.3 — see release notes"

# Find open issues in project
jira search "project=PROJ AND status='In Progress'"

# List what transitions are available, then apply one
jira transition PROJ-123
jira transition PROJ-123 "To Done"
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `Error: HTTP 410` on search | Atlassian removed `/rest/api/3/search` – script uses `/rest/api/3/search/jql` (already fixed) |
| `Error: not found (404)` even though issue exists | Token expired or wrong – verify with `curl -u user:token <JIRA_URL>/rest/api/3/myself` |
| Comment with apostrophes breaks | Use `$'text with \'quotes\''` or pass via variable |
| Transition name wrong | Run `jira transition PROJ-123` (no status arg) to list available names |
| 404 on auth failure | JIRA returns 404 (not 401) when token is invalid but issue exists – always verify token first |

## Troubleshooting

```bash
# Test token validity
source ~/.config/jira/credentials
curl -sf -u "$JIRA_USER:$JIRA_TOKEN" "$JIRA_URL/rest/api/3/myself" | jq .displayName

# Show available transitions (no guessing)
jira transition PROJ-123

# Raw response for debugging
jira --json get PROJ-123 | jq .fields.status
```
