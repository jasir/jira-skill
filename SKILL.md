---
name: using-jira
description: You MUST use when querying JIRA issues, reading descriptions or comments, adding comments, searching with JQL, or transitioning issue status - wraps JIRA REST API v3 via curl script at ~/.local/bin/jira with formatted output; requires one-time credentials setup at ~/.config/jira/credentials
---

# Using JIRA

## Overview

Direct JIRA API access via local bash script. No MCP dependency, no version issues, token-efficient.

Script: `scripts/jira` → symlinked to `~/.local/bin/jira`. Requires `bash`, `curl`, `jq`.

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

| Operation | Command | API calls |
|-----------|---------|-----------|
| Issue header | `jira get PROJ-123` | 1 |
| Description (plain text) | `jira describe PROJ-123` | 1 |
| Comments (formatted) | `jira comments PROJ-123` | 1 |
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

**Prefer `show` when you need everything** — one API call, fully rendered (description ADF → plain text, comments with author/date). Saves tokens and round-trips.

## Examples

```bash
# Full ticket inspection in ONE call (recommended for "what is this ticket about?")
jira show PROJ-123

# Just the header (cheap status lookup)
jira get PROJ-123

# Add multiline comment (use $'...' for special chars)
jira comment PROJ-123 "Fixed in build 1.2.3 — also relates to [[KNW-30718]]"

# Remove a duplicate comment by id
jira comments PROJ-123
jira comment-delete PROJ-123 881685

# Find your open issues
jira search "project=PROJ AND status='In Progress' AND assignee=currentUser()"

# Custom field that isn't in formatted output → --json + jq
jira --json get PROJ-123 | jq -r '.fields.reporter.displayName, .fields.labels[]'

# Bulk extraction with NARROWED payload (-f tells JIRA to skip everything else)
# A full `--json get` returns ~200 fields; -f drops it to just what you need.
jira --json get PROJ-123 -f summary,reporter,labels,parent | jq '{
  summary: .fields.summary,
  reporter: .fields.reporter.displayName,
  labels: .fields.labels,
  parent: .fields.parent.key
}'

# List then apply a transition (status name must match exactly)
jira transition PROJ-123
jira transition PROJ-123 "To Done"

# Generic endpoint wrapper (prefer dedicated commands first)
jira api GET issue/PROJ-123/changelog -q maxResults=20
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Three calls (`get` + `describe` + `comments`) to investigate ticket | Use `jira show` — one call, same info |
| Raw `curl` to `/rest/api/3/issue/{key}/comment` | Use `jira comments` (already calls that endpoint) |
| Raw `curl` for non-wrapped endpoint | Use `jira api <METHOD> <path>`; keep raw curl only for troubleshooting |
| Hand-parsing ADF description JSON | Use `jira describe` or `jira show` — wrapper renders ADF to text |
| `jira comment ... "**KNW-30718**"` expecting clickable issue card | Use `[[KNW-30718]]` inside comment text |
| Search prints `(no matching issues — JQL: ...)` → re-running with hardcoded `accountId` or a fuzzed status name | That's the answer. If the user's status word might not match JIRA's exact label (e.g. "rozpracované" → `In Progress` vs `Code review`), ask the user instead of guessing. |
| `Error: HTTP 410` on search | Atlassian removed `/rest/api/3/search` — script uses `/rest/api/3/search/jql` (already fixed) |
| `Error: not found (404)` even though issue exists | Token expired – verify with `curl -u user:token <JIRA_URL>/rest/api/3/myself` |
| Comment with apostrophes breaks | Use `$'text with \'quotes\''` or pass via variable |
| Guessing transition name | Run `jira transition PROJ-123` (no arg) to list available names |
| Looking for comment edit history via API | Not available in this wrapper/API flow — delete + re-post comment instead |

## Troubleshooting

```bash
# Test token validity
source ~/.config/jira/credentials
curl -sf -u "$JIRA_USER:$JIRA_TOKEN" "$JIRA_URL/rest/api/3/myself" | jq .displayName

# Raw response for debugging
jira --json get PROJ-123 | jq .fields.status
```
