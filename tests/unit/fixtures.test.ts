/**
 * Whole-document regression tests.
 *
 * Fixtures are synthetic on purpose: this repository is public, so real ticket
 * text cannot be committed. Each one reproduces constructs measured in real
 * descriptions — struck-out scope items, nested ordered lists, status lozenges,
 * tables, attachments, smart links.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { wikiToMarkdown } from "../../scripts/wiki2md";

const DIR = join(import.meta.dir, "..", "fixtures");
const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".wiki"))
  .map((f) => f.replace(/\.wiki$/, ""));

describe("fixtures", () => {
  test("there are fixtures to run", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    test(name, async () => {
      const wiki = await Bun.file(join(DIR, `${name}.wiki`)).text();
      const expected = await Bun.file(join(DIR, `${name}.md`)).text();
      expect(wikiToMarkdown(wiki)).toBe(expected.replace(/\s+$/, ""));
    });
  }
});
