# Issue #1 — CLI enhancements

**Source of truth:** https://github.com/jasir/jira-skill/issues/1
**Status: delivered 2026-07-27.** All seven items are implemented on `main`.

This file deliberately does **not** copy the spec. The previous version did, went stale, and was
deleted. Read the issue itself:

```bash
gh issue view 1 --repo jasir/jira-skill
```

What lives here is the part GitHub cannot know: how the issue landed against the
**2026-07-27 v2/Markdown rewrite** (see `2026-07-27-wiki-markdown-rendering-design.md`).

## Outcome

| Issue item | Where it landed |
|---|---|
| 1. `[[KEY]]` → ADF `inlineCard` | `scripts/adf.ts`. Verified live: JIRA stores an `inlineCard` node, not text. |
| 2. `jira comment-delete` | `cli.ts`. Comment ids are printed by `jira comments` so there is something to pass. |
| 3. `jira api <METHOD> <path>` | `cli.ts`, with `-q key=val` and `-d json`. |
| 4. `jira changelog` / `jira history` | `cli.ts` + `formatChangelog` in `format.ts`. `history` needs one API call, not two — `expand=changelog` rides along with the fields request. |
| 5. Output: `inlineCard` → key, comment ids | Reading through v2 turns a ticket link into `[PROJ-456](…/browse/PROJ-456)`; ids are in the comment header. |
| 6. Documentation | SKILL.md and README. |
| 7. Tests | `tests/unit/adf.test.ts`, `tests/unit/format.test.ts`, plus routing tests in `cli.test.ts`. |

## Where the implementation departs from the issue

- **"Node/Python client — stay bash+curl+jq" no longer holds.** The wrapper is TypeScript on Bun as
  of 2026-07-27, and `jq` is not a dependency. Implementation notes in the issue referencing
  `_adf2text`, `_curl` or `_fmt_comments` describe shell functions that no longer exist; their
  equivalents are `wiki2md.ts`, `client.ts` and `format.ts`.
- **Changelog values are truncated.** The issue did not anticipate that a description edit records
  both full versions of the field. One such entry produced ~2000 characters of raw wiki markup.
  Values are flattened to a single line and cut at 120 characters with the real length reported;
  `jira --json changelog` still returns everything.
- **Multiline comments were being built wrongly.** The bash implementation put the whole comment,
  newlines included, into one ADF `text` node. Paragraphs now split on blank lines and single
  newlines become `hardBreak` nodes.
- **`history` costs one call, not two.** The issue budgeted ≤2.
