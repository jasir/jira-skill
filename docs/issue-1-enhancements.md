# Issue #1 — CLI enhancements (tracking doc)

**GitHub:** https://github.com/jasir/jira-skill/issues/1

**Status:** OPEN (implementation pending)

## Summary

- `[[KEY]]` in `jira comment` → ADF `inlineCard` (clickable issue in JIRA UI)
- `jira comment-delete`
- `jira api METHOD path` (agents must not hand-write curl with credentials)
- `jira changelog` / `jira history`
- CLI: comment ids, `inlineCard` in `_adf2text`
- TDD tests `10`–`13`, SKILL.md + README

Full spec and acceptance criteria are in the GitHub issue.

## Origin

KNW-30344 / KNW-30718 — duplicate comments and non-clickable `**KNW-30718**` links (May 2026).
