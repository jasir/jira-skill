# Test Results — Model Compatibility Matrix

Run date: 2026-05-11
Skill version: post-`show`-command refactor

## Score matrix (score / API calls)

| # | Test | Opus 4.7 | Sonnet 4.6 | Haiku 4.5 |
|---|------|---------|------------|-----------|
| 01 | show-full-ticket | ✅ 4/4 (1) | ✅ 4/4 (1) | ✅ 4/4 (1) |
| 03 | comments-only | ✅ 3/3 (1) | ✅ 3/3 (1) | ✅ 3/3 (1) |
| 05 | custom-field | ✅ 3/3 (1) | ✅ 3/3 (1) | ✅ 3/3 (1) |
| 06 | search-mine | ✅ 4/4 (1) | ⚠️ 4/4 (4) | ❌ 2/4 (6) |
| 07 | transition (dry-run) | ✅ 3/3 (2) | ✅ 3/3 (1) | ✅ 3/3 (2) |

**Overall:** 14/15 passes. One real failure: test 06 on Haiku.

## Per-test highlights

### Where all models agreed
- **01 / 03 / 05** — all three models picked the canonical command (`show` / `comments` / `--json get | jq`) with exactly **one API call**. The skill's Quick Reference table is doing its job.

### Where smaller models differ from Opus
- **06 search-mine** — Opus trusted the empty `currentUser()` result. Sonnet made 3 extra verification calls. Haiku made 5 extra calls *plus* hardcoded accountId *plus* raw curl to `/myself`. The wrapper's design was fine; the skill's wording isn't strict enough about *trusting* empty JQL results.
- **07 transition** — Haiku was the only model that **verbally stated** the case-sensitivity rule for transition names, even though all three models did the right thing.

### Where smaller models beat Opus
- **03 comments-only** — Sonnet & Haiku picked the *narrower* `jira comments` command. Opus reached for the broader `jira show`. Both work; smaller models were more literal.

## Baseline (RED) vs GREEN summary

Pre-refactor RED behavior (before `show`/`describe`/`comments` were added):
- Agent fell back to **raw `curl`** on `/issue/{key}/comment` because the wrapper had no read command
- Agent **hand-parsed ADF JSON** for description
- Agent made **3 separate API calls** (issue + comment endpoint + expand fallback)

Post-refactor GREEN behavior (all three models):
- `jira show` is the default for full-ticket inspection — **1 API call**
- `jira comments` / `jira describe` for cherry-picked reads
- `jira --json get | jq` for custom fields — **1 bash call, 1 API call**
- **Zero raw `curl` invocations** in tests 01/03/05/07 across all models

## REFACTOR signal — open follow-up

**Test 06 weakness on smaller models:** when a JQL search with `currentUser()` returns no issues, smaller models distrust the result and chase it with raw curl + hardcoded accountId.

Proposed skill amendment (not yet implemented):
> Empty result from a JQL search is a valid answer. Do **not** fall back to raw `curl` on `/myself`, do **not** substitute `assignee=currentUser()` with a hardcoded accountId. If the user might have phrased the status name differently (e.g. "rozpracované" vs "In Progress" vs "Code review"), re-ask the user rather than guessing.

This would be a `08-empty-result-trust.json` test plus a Common Mistakes row in SKILL.md.
