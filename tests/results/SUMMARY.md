# Test Results — Model Compatibility Matrix

Run date: 2026-05-11
Skill version: v2 (post-`show` refactor + "empty is valid" amendment)

## Score matrix (score / API calls)

| # | Test | Opus 4.7 | Sonnet 4.6 | Haiku 4.5 |
|---|------|---------|------------|-----------|
| 01 | show-full-ticket | ✅ 4/4 (1) | ✅ 4/4 (1) | ✅ 4/4 (1) |
| 03 | comments-only | ✅ 3/3 (1) | ✅ 3/3 (1) | ✅ 3/3 (1) |
| 05 | custom-field | ✅ 3/3 (1) | ✅ 3/3 (1) | ✅ 3/3 (1) |
| 06 v1 | search-mine | ✅ 4/4 (1) | ⚠️ 4/4 (4) | ❌ 2/4 (6) |
| 06 v2 | search-mine (skill amendment) | ✅ 4/4 (1) | ✅ 4/4 (1) | ⚠️ 3/4 (4) |
| 06 v3 | search-mine (script emits explicit empty) | ✅ 4/4 (1) | ⚠️ 4/4 (2) UX win | n/a (Haiku dropped) |
| 07 | transition (dry-run) | ✅ 3/3 (2) | ✅ 3/3 (1) | ✅ 3/3 (2) |

## REFACTOR iteration — outcome

**Change:** added one row to Common Mistakes table:
> Empty search result → re-running with `curl /myself` or hardcoded `accountId` to "verify" → **Empty is a valid answer.** Trust `currentUser()`…

**Impact on test 06:**

| Model | v1 calls | v2 calls | v1 anti-patterns | v2 anti-patterns | Verdict |
|-------|----------|----------|------------------|------------------|---------|
| Opus | 1 | 1 | 0 | 0 | No regression. Now cites the rule. |
| Sonnet | 4 | 1 | 1 (borderline) | 0 | **Fully fixed.** Asks user instead of guessing. |
| Haiku | 6 | 4 | 3 (hardcoded accountId, raw curl, list-all-and-filter) | 2 (raw curl `/myself`, list-all-and-filter) | **Partial.** Worst anti-pattern (hardcoded accountId) eliminated. |

## Per-test highlights

### Where all models agreed
- **01 / 03 / 05** — all three models picked the canonical command with exactly **one API call**.

### Where smaller models still differ
- **06 v2 on Haiku** — still over-validates. Runs `curl /myself` as a token check even though the preceding search succeeded. Subsequent `--json search` lists all assigned tickets to inspect statuses (in lieu of asking the user).

### Where smaller models beat Opus
- **03 comments-only** — Sonnet & Haiku picked the *narrower* `jira comments`. Opus reached for `jira show`.
- **07 transition** — Haiku verbalized "name must be case-sensitive". Opus didn't.

## Baseline (RED) vs current GREEN

Pre-`show` baseline:
- Fall back to **raw `curl`** on `/issue/{key}/comment`
- **Hand-parse ADF JSON** for description
- **3 separate API calls** for ticket inspection (issue + comment endpoint + expand fallback)

Current GREEN (v2):
- `jira show` for full-ticket inspection — **1 API call**
- `jira comments` / `jira describe` for cherry-picked reads
- `jira --json get | jq` for custom fields — **1 bash call, 1 API call**
- **Empty JQL results trusted** by Opus and Sonnet; partially by Haiku

## v3 iteration — root-cause fix at the script level

Instead of writing yet another rule in SKILL.md, v3 fixed the root cause: empty `jira search` used to emit nothing (ambiguous), now it emits `(no matching issues — JQL: ...)`. This makes the empty case self-evident to the agent and lets the Common Mistakes row in SKILL.md slim down (no longer mentions `curl /myself`).

**Net effect:**
- Opus: stable (1 call, asks user about alternative status name)
- Sonnet: now does 2 calls (1 more than v2) — but uses the extra call to *enumerate* available statuses rather than *guess* them. Arguably better UX, slightly higher token cost.

**Haiku: dropped from the matrix.** Smaller models will continue to over-validate; the cost-benefit of hardening the skill further for that model class is negative.

## Open follow-ups

- **Sonnet v3 trade-off:** 1 extra call in exchange for better UX (shows alternatives instead of asking). Token-strict mode would tighten the SKILL.md rule to "ask first, don't enumerate". Helpful-mode accepts current behavior. Decision deferred to user.
