# Issue #1 — CLI enhancements

**Source of truth:** https://github.com/jasir/jira-skill/issues/1 (state: OPEN, updated 2026-05-20)

This file deliberately does **not** copy the spec. The previous version did, went stale, and was
deleted. Read the issue itself:

```bash
gh issue view 1 --repo jasir/jira-skill
```

What lives here instead is the part GitHub cannot know: how the issue reconciles with the
**2026-07-27 v2/Markdown rewrite** (see `2026-07-27-wiki-markdown-rendering-design.md`).

## Reconciliation after the rewrite

| Issue item | Status |
|---|---|
| 1. `[[KEY]]` → ADF `inlineCard` in `jira comment` | **Open.** Write path still posts a single text node; the ADF is now built in `cli.ts` (`case "comment"`), so the expansion belongs there. |
| 2. `jira comment-delete` | **Open.** `client.request` already supports `method`, so this is a routing case in `cli.ts`. |
| 3. `jira api <METHOD> <path>` | **Open.** `JiraClient.request` is exactly this, minus a CLI surface. |
| 4. `jira changelog` / `jira history` | **Open.** |
| 5. Output: `inlineCard` → `[KEY]`, comment ids | **Partly delivered.** Text is now read through API v2, where smart links arrive as URLs and are rendered as such — so `inlineCard` no longer vanishes. Comment ids are still not printed. |
| 6. Docs | **Superseded.** SKILL.md and README were rewritten; new sections must be added to those, not the versions the issue describes. |
| 7. Tests `10`–`13` | **Stubs removed.** They described unimplemented commands and duplicated the issue's own table. The issue holds that spec; write scenarios when the commands land. |

## Invalidated by the rewrite

The issue's non-goal **"Node/Python client — stay bash+curl+jq"** no longer holds. The wrapper is
TypeScript on Bun as of 2026-07-27; `jq` is not a dependency. Implementation notes in the issue that
reference `_adf2text`, `_curl` or `_fmt_comments` refer to shell functions that no longer exist —
their equivalents are `wiki2md.ts`, `client.ts` and `format.ts`.

**When picking this issue up, update the issue body first**, then implement. Do not resurrect a
hand-maintained copy of it here.
