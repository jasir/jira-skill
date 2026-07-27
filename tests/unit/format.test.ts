import { describe, expect, test } from "bun:test";
import {
  VALUE_LIMIT,
  changelogEntries,
  formatChangelog,
  formatComments,
} from "../../scripts/format";

const ENTRIES = [
  {
    created: "2026-07-20T09:15:00.000+0200",
    author: { displayName: "Ada" },
    items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
  },
  {
    created: "2026-07-21T11:00:00.000+0200",
    author: { displayName: "Grace" },
    items: [
      { field: "Rank", fromString: "", toString: "0|i0007:" },
      { field: "assignee", fromString: null, toString: "Grace" },
    ],
  },
];

describe("changelogEntries handles both payload shapes", () => {
  test("dedicated endpoint returns {values}", () => {
    expect(changelogEntries({ values: ENTRIES })).toHaveLength(2);
  });

  test("expand=changelog returns {changelog:{histories}}", () => {
    expect(changelogEntries({ changelog: { histories: ENTRIES } })).toHaveLength(2);
  });

  test("an issue with no changelog yields an empty list, not a crash", () => {
    expect(changelogEntries({})).toEqual([]);
    expect(changelogEntries(null)).toEqual([]);
  });
});

describe("formatChangelog", () => {
  test("renders author, date and each field transition", () => {
    expect(formatChangelog([ENTRIES[0]])).toBe(
      "2026-07-20 09:15 — Ada\n  status: To Do → In Progress",
    );
  });

  test("empty values read as (empty) rather than blank", () => {
    expect(formatChangelog([ENTRIES[1]])).toContain("assignee: (empty) → Grace");
  });

  test("--skip-system hides bookkeeping fields", () => {
    const output = formatChangelog(ENTRIES, { skipSystem: true });
    expect(output).not.toContain("Rank");
    expect(output).toContain("assignee");
  });

  test("an entry left empty by --skip-system disappears entirely", () => {
    const rankOnly = [{ ...ENTRIES[1], items: [ENTRIES[1].items[0]] }];
    expect(formatChangelog(rankOnly, { skipSystem: true })).toBe("(no changelog entries)");
  });

  test("limit keeps the most recent entries, oldest first", () => {
    const output = formatChangelog(ENTRIES, { limit: 1 });
    expect(output).toContain("Grace");
    expect(output).not.toContain("Ada");
  });

  test("entries are sorted by date even when the API returns them unsorted", () => {
    const output = formatChangelog([ENTRIES[1], ENTRIES[0]]);
    expect(output.indexOf("Ada")).toBeLessThan(output.indexOf("Grace"));
  });

  test("no entries at all", () => {
    expect(formatChangelog([])).toBe("(no changelog entries)");
  });

  // A rewritten description arrives as hundreds of lines of raw wiki markup.
  test("a long value is truncated and its real length reported", () => {
    const long = "x".repeat(500);
    const output = formatChangelog([
      { created: "2026-07-20T09:15:00.000+0200", items: [{ field: "description", toString: long }] },
    ]);

    expect(output).toContain(`${"x".repeat(VALUE_LIMIT)}… (500 chars)`);
    expect(output.length).toBeLessThan(250);
  });

  test("a value at exactly the limit is not truncated", () => {
    const exact = "y".repeat(VALUE_LIMIT);
    expect(formatChangelog([{ items: [{ field: "summary", toString: exact }] }])).toContain(exact);
    expect(formatChangelog([{ items: [{ field: "summary", toString: exact }] }])).not.toContain("…");
  });

  test("newlines are flattened so one change stays on one line", () => {
    const output = formatChangelog([{ items: [{ field: "summary", toString: "a\nb\n\nc" }] }]);
    expect(output).toContain("summary: (empty) → a b c");
    expect(output.split("\n")).toHaveLength(2);
  });

  test("a whitespace-only value reads as (empty)", () => {
    expect(formatChangelog([{ items: [{ field: "summary", toString: "  \n " }] }])).toContain(
      "(empty) → (empty)",
    );
  });
});

describe("comment ids", () => {
  test("are printed so comment-delete has something to take", () => {
    const output = formatComments([
      { id: "881685", author: { displayName: "Ada" }, created: "2026-07-27T14:55:00.000+0200", body: "text" },
    ]);
    expect(output).toContain("── Ada — 2026-07-27 14:55 (id: 881685)");
  });

  test("a comment without an id still renders", () => {
    expect(formatComments([{ author: { displayName: "Ada" }, body: "text" }])).toContain("── Ada");
  });
});
