---
name: using-jira
description: You MUST use when querying JIRA issues, reading descriptions or comments, adding comments, searching with JQL, or transitioning issue status - wraps the JIRA REST API via a Bun script at ~/.local/bin/jira, rendering ticket text as Markdown (struck-out text means removed from scope); requires one-time credentials setup at ~/.config/jira/credentials
---

# Using JIRA

## Overview

Direct JIRA API access via a local script. No MCP dependency, no version issues, token-efficient.

Script: `scripts/jira` (bash launcher) → `scripts/jira.ts` (Bun). Symlinked to `~/.local/bin/jira`.
Requires `bash` and `bun`.

## ⚠️ Struck-out text means CANCELLED

Rich text is rendered as Markdown. `~~like this~~` means **the reporter removed that item from
scope — do not implement it.** Reporters strike acceptance criteria instead of deleting them, so
struck items stay visible in the ticket. Treating them as active work is the single most expensive
mistake you can make with this tool.

When summarising a ticket, say explicitly which items are struck out rather than silently dropping
them — the user may not know the scope changed.

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

**Install bun and symlink the script:**
```bash
command -v bun || curl -fsSL https://bun.sh/install | bash
ln -sf "$(pwd)/scripts/jira" ~/.local/bin/jira
```

## Quick Reference

| Operation | Command | API calls |
|-----------|---------|-----------|
| Issue header | `jira get PROJ-123` | 1 |
| Description (Markdown) | `jira describe PROJ-123` | 1 |
| Comments (formatted) | `jira comments PROJ-123` | 1 |
| **Header + description + comments** | **`jira show PROJ-123`** | **1** |
| Add comment | `jira comment PROJ-123 "text"` | 1 |
| Search JQL | `jira search "project=PROJ AND status=Open"` | 1 |
| List transitions | `jira transition PROJ-123` | 1 |
| Apply transition | `jira transition PROJ-123 "In Progress"` | 2 |
| Raw JSON / ADF | `jira --json get PROJ-123 \| jq ...` | 1 |
| Raw JSON, narrowed payload | `jira --json get PROJ-123 -f reporter,labels \| jq .fields` | 1 |

**Prefer `show` when you need everything** — one API call, fully rendered. Saves tokens and round-trips.

## How ticket text is rendered

Text commands read the **v2 API**, which returns Atlassian's own wiki-markup flattening of the
ticket, and convert that to Markdown. `--json` reads **v3** and returns raw ADF, so the untouched
tree stays reachable when you need it.

| In the ticket | You see |
|---|---|
| struck-out text | `~~text~~` — **removed from scope** |
| numbered list | `1.` `2.` with nesting indented |
| status lozenge | `**[ OPEN POINT ]**` |
| attachment / screenshot | `[image: filename.png]` |
| smart link (Figma, Confluence) | the URL |
| monospace | backticks |
| table | Markdown table |

## Linking other tickets in a comment

Write `[[PROJ-456]]` and the wrapper posts an ADF `inlineCard` — the same clickable issue card you
get by pasting a browse URL in the JIRA UI. A bare `PROJ-456` or `**PROJ-456**` stays dead text, so
use the markers when the reference matters.

```bash
jira comment PROJ-123 "Duplicate of [[PROJ-456]], closing"
```

Reading back, a link to another ticket renders as `[PROJ-456](https://…/browse/PROJ-456)`.

**Known gap:** checkbox items lose their TODO/DONE state — the v2 API does not carry it. If a
ticket's checkbox states matter, read `jira --json show PROJ-123` and look at
`taskItem.attrs.state` in the ADF.

## Examples

```bash
# Full ticket inspection in ONE call (recommended for "what is this ticket about?")
jira show PROJ-123

# Just the header (cheap status lookup)
jira get PROJ-123

# Add multiline comment (use $'...' for special chars)
jira comment PROJ-123 "Fixed in build 1.2.3 — see release notes"

# Link another ticket: [[KEY]] becomes a clickable issue card in the JIRA UI
jira comment PROJ-123 "Root cause is the same as [[PROJ-456]]"

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
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| **Planning work for a `~~struck-out~~` item** | It was cancelled. Exclude it and say so. |
| Three calls (`get` + `describe` + `comments`) to investigate ticket | Use `jira show` — one call, same info |
| Raw `curl` to `/rest/api/3/issue/{key}/comment` | Use `jira comments` (already calls that endpoint) |
| Hand-parsing ADF description JSON | Use `jira describe` or `jira show` — the wrapper renders it |
| Search prints `(no matching issues — JQL: ...)` → re-running with hardcoded `accountId` or a fuzzed status name | That's the answer. If the user's status word might not match JIRA's exact label (e.g. "rozpracované" → `In Progress` vs `Code review`), ask the user instead of guessing. |
| `Error: HTTP 410` | Atlassian removed that endpoint; the wrapper needs updating |
| `Error: not found (404)` even though issue exists | Token expired – verify with `curl -u user:token <JIRA_URL>/rest/api/3/myself` |
| `Error: bun not found` | `curl -fsSL https://bun.sh/install \| bash` |
| Comment with apostrophes breaks | Use `$'text with \'quotes\''` or pass via variable |
| Guessing transition name | Run `jira transition PROJ-123` (no arg) to list available names |

## Troubleshooting

```bash
# Test token validity
source ~/.config/jira/credentials
curl -sf -u "$JIRA_USER:$JIRA_TOKEN" "$JIRA_URL/rest/api/3/myself" | jq .displayName

# Raw response for debugging
jira --json get PROJ-123 | jq .fields.status

# Run the test suite (offline)
cd "$(dirname "$(readlink -f "$(command -v jira)")")/.." && bun test tests/unit
```
