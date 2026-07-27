# Design: readable ticket text via API v2 + Bun rewrite

Date: 2026-07-27
Status: approved

## Problem

The ADF→text renderer (`_ADF_JQ`, a jq expression embedded in `scripts/jira`) silently
drops most of a ticket's meaning. Its `else` branch recurses into `.content` and ignores
everything else, which has two consequences:

1. Nodes whose meaning lives in `attrs` rather than `content` (`status`, `media`,
   `inlineCard`, `emoji`, `date`, `mention`) render as the **empty string**.
2. Marks are never read at all — `strike`, `strong`, `code`, `link` are lost.

Measured over 100 recent descriptions in one project:

| construct | occurrences | current behaviour |
|---|---|---|
| `strong` / `code` / `underline` / `em` | 162 / 124 / 55 / 50 | formatting dropped |
| `status` lozenge | 75 | **vanishes** |
| `media` (screenshots) | 52 | vanishes |
| `strike` | 17 | **vanishes** |
| `inlineCard` (smart links) | 17 | vanishes, URL included |
| `textColor` | 18 | vanishes |
| `orderedList` | 12 | rendered as bullets, numbering lost |
| `table` | 11 | cells concatenated into one sentence |
| `taskItem` | 5 | items concatenated, TODO/DONE state lost |

The dangerous one is `strike`. A requirement struck out by the reporter reads to an agent
as an active requirement, so the agent implements cancelled work.

## Decision

**Read rich text through REST API v2, which returns wiki markup instead of ADF, then
convert that wiki markup to Markdown.**

Rationale: v2 and v3 are two serialisations of the same data, not two feature levels.
v2 hands us Atlassian's own flattening of the ADF tree, which stays correct as Atlassian
adds node types. A hand-written ADF renderer would start going stale the day it is
written — that is precisely how the current bug arose.

Measured coverage on the same 100 descriptions: the current renderer has eight classes of
silent loss, v2 has one (`taskItem` state).

Rejected: hand-written ADF→Markdown renderer. Better tunability, but it reproduces the
root cause (our code must know every node type) for a one-class gain. It stays cheaply
reachable later behind a flag if v2 disappoints.

**Rewrite `scripts/jira` from bash to Bun/TypeScript.** The HTTP layer has failed in
production before (Atlassian removed `/rest/api/3/search`, see the 410 entry in SKILL.md)
and cannot be tested in bash without a live JIRA. In TypeScript `fetch` is injectable, so
error paths become offline unit tests.

## Architecture

```
scripts/jira          bash wrapper — resolves the bun binary, execs jira.ts
scripts/jira.ts       entry point (thin)
scripts/cli.ts        argument parsing + command routing; takes injected deps
scripts/client.ts     JiraClient — fetch + HTTP error mapping; fetch injectable
scripts/wiki2md.ts    pure function: wiki markup → Markdown
scripts/format.ts     issue header, comment list, search result list
```

The bash wrapper exists because `BUN_INSTALL` is exported from `~/.bashrc`, which
non-interactive shells skip. `#!/usr/bin/env bun` therefore fails in some agent contexts.
The wrapper falls back to `~/.bun/bin/bun` and, if bun is absent, prints an install
command instead of `env: bun: No such file`.

### Endpoint split

| command | endpoint | why |
|---|---|---|
| `describe`, `show`, `comments` (text) | `/rest/api/2` | wiki markup, then converted |
| `get`, `search`, `transition` | `/rest/api/3` | no rich text involved; unchanged |
| `comment` (write) | `/rest/api/3` | body must be ADF |
| any command with `--json` | `/rest/api/3` | raw ADF stays available as an escape hatch |

### Conversion rules

Applied to prose only. Content inside `{code}` and `{noformat}` is passed through
untouched, so a `-flag-` in a code sample does not become `~~flag~~`.

| wiki markup | Markdown |
|---|---|
| `-text-` | `~~text~~` |
| `*text*` | `**text**` |
| `_text_` | `*text*` |
| `+text+` | `<u>text</u>` |
| `{{text}}` | `` `text` `` |
| `{color:#hex}…{color}` | wrapper removed, content kept |
| `h1.`…`h6.` | `#`…`######` |
| `#`, `##`, `###` line prefix | `1.`, nested `1.` (2 spaces per level) |
| `*`, `**` line prefix | `-`, nested `-` |
| `[text\|url]`, `[text\|url\|smart-link]` | `[text](url)`, or bare URL when text == url |
| `[url]` | `url` |
| `!file.png\|width=686!` | `[image: file.png]` |
| `{code:lang}…{code}` | fenced block with language |
| `{noformat}…{noformat}` | fenced block |
| `{quote}…{quote}`, `bq. text` | `> text` |
| `{panel:title=X}…{panel}` | `> **X**` + quoted body |
| `\|\|h1\|\|h2\|\|` / `\|c1\|c2\|` | Markdown table with separator row |
| `----` | `---` |

## Accepted limitations

- `taskItem` loses its TODO/DONE state. v2 does not carry it; it cannot be recovered.
  Documented in SKILL.md, with `jira --json` (v3 ADF) as the escape hatch.
- Underline has no Markdown equivalent; `<u>` is used rather than dropping it silently.
- The conversion is **not idempotent**, and cannot be: wiki markup and Markdown share `#` with
  opposite meanings, so `wikiToMarkdown(wikiToMarkdown("h3. Title"))` yields `    1. Title`.
  Single-pass use is enforced by the architecture — only `cli.ts` calls the converter, once per
  field — so this is a documented property rather than a defect to engineer around.

## Testing

| layer | covers | offline |
|---|---|---|
| `tests/unit/wiki2md.test.ts` | each conversion rule, code-block protection, strike edge cases | yes |
| `tests/unit/client.test.ts` | 401 / 404 / 410 / malformed body, via mock fetch | yes |
| `tests/unit/cli.test.ts` | argument parsing, command routing, missing-argument errors | yes |
| `tests/fixtures/*.wiki` → `*.md` | whole-document regression | yes |
| `tests/live.test.ts` | smoke against real JIRA, opt-in via `JIRA_LIVE_TEST=1` | no |
| `tests/20-struck-out-items.json` | agent must not plan struck-out requirements | no (model run) |

Fixtures are **synthetic**. This repository is public, so real ticket content cannot be
committed. They reproduce the constructs measured above with invented text.

The behavioural scenario is the test that guards the original complaint: unit tests prove
`~~` is emitted, only the scenario proves an agent acts on it.

## Definition of done

All eight commands verified side by side (old script vs new) against live JIRA before the
`~/.local/bin/jira` symlink is switched.
