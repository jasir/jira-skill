import { describe, expect, test } from "bun:test";
import { wikiToMarkdown } from "../../scripts/wiki2md";

describe("strike — the reason this module exists", () => {
  test("converts -text- to ~~text~~", () => {
    expect(wikiToMarkdown("-dropped from scope-")).toBe("~~dropped from scope~~");
  });

  test("converts strike inside an ordered list item", () => {
    expect(wikiToMarkdown("# keep this\n# -drop this-")).toBe("1. keep this\n2. ~~drop this~~");
  });

  test("handles a struck item ending in a closing paren", () => {
    expect(wikiToMarkdown("# -aggregate filters (non applied)-")).toBe(
      "1. ~~aggregate filters (non applied)~~",
    );
  });

  test("leaves hyphenated words alone", () => {
    expect(wikiToMarkdown("split-tunnel e-mail non-blocking")).toBe(
      "split-tunnel e-mail non-blocking",
    );
  });

  test("leaves a lone dash alone", () => {
    expect(wikiToMarkdown("range 1 - 5 and a - b")).toBe("range 1 - 5 and a - b");
  });
});

describe("lists", () => {
  test("numbers an ordered list", () => {
    expect(wikiToMarkdown("# one\n# two\n# three")).toBe("1. one\n2. two\n3. three");
  });

  test("nests ordered lists and restarts numbering per level", () => {
    expect(wikiToMarkdown("# Packaging\n# Convenience\n## Feature flag\n## B2B x B2C")).toBe(
      "1. Packaging\n2. Convenience\n  1. Feature flag\n  2. B2B x B2C",
    );
  });

  test("renders bullets as dashes", () => {
    expect(wikiToMarkdown("* alpha\n* beta")).toBe("- alpha\n- beta");
  });

  test("restarts numbering after a blank line", () => {
    expect(wikiToMarkdown("# one\n# two\n\n# fresh")).toBe("1. one\n2. two\n\n1. fresh");
  });

  test("restarts numbering after a heading", () => {
    expect(wikiToMarkdown("# one\nh2. Section\n# fresh")).toBe("1. one\n## Section\n1. fresh");
  });
});

describe("inline marks", () => {
  test("bold, italics, underline, monospace", () => {
    expect(wikiToMarkdown("*bold* _em_ +under+ {{mono}}")).toBe(
      "**bold** *em* <u>under</u> `mono`",
    );
  });

  test("strips the colour wrapper but keeps a status lozenge", () => {
    expect(wikiToMarkdown("{color:#97A0AF}*[ OPEN POINT ]*{color} question?")).toBe(
      "**[ OPEN POINT ]** question?",
    );
  });

  test("does not treat a multiplication asterisk as bold", () => {
    expect(wikiToMarkdown("value * 100 / 2")).toBe("value * 100 / 2");
  });
});

describe("links and images", () => {
  test("collapses a smart link whose text repeats the URL", () => {
    expect(wikiToMarkdown("FIGMA: [https://example.com/x|https://example.com/x|smart-link]")).toBe(
      "FIGMA: https://example.com/x",
    );
  });

  test("keeps a labelled link as a Markdown link", () => {
    expect(wikiToMarkdown("see [the design|https://example.com/x]")).toBe(
      "see [the design](https://example.com/x)",
    );
  });

  test("unwraps a bare bracketed URL", () => {
    expect(wikiToMarkdown("[https://example.com/x]")).toBe("https://example.com/x");
  });

  test("names a link to another ticket", () => {
    expect(
      wikiToMarkdown("caused by [https://x.atlassian.net/browse/KNW-30718|https://x.atlassian.net/browse/KNW-30718|smart-link]"),
    ).toBe("caused by [KNW-30718](https://x.atlassian.net/browse/KNW-30718)");
  });

  test("does not re-wrap a browse URL that is already a Markdown link", () => {
    expect(wikiToMarkdown("see [the ticket|https://x.atlassian.net/browse/KNW-1]")).toBe(
      "see [the ticket](https://x.atlassian.net/browse/KNW-1)",
    );
  });

  test("leaves a non-issue URL alone", () => {
    expect(wikiToMarkdown("docs at https://x.atlassian.net/wiki/spaces/AB")).toBe(
      "docs at https://x.atlassian.net/wiki/spaces/AB",
    );
  });

  test("names an attachment instead of dropping it", () => {
    expect(wikiToMarkdown('!screen-1.png|width=686,alt="screen-1.png"!')).toBe(
      "[image: screen-1.png]",
    );
  });
});

describe("code blocks are protected", () => {
  test("does not convert wiki syntax inside a code block", () => {
    const src = "{code:bash}\nrun --dry-run- -x- *not bold*\n{code}";
    expect(wikiToMarkdown(src)).toBe("```bash\nrun --dry-run- -x- *not bold*\n```");
  });

  test("reads the language from a title=…|language=… attribute", () => {
    expect(wikiToMarkdown("{code:title=Foo|language=php}\n$a = 1;\n{code}")).toBe(
      "```php\n$a = 1;\n```",
    );
  });

  test("emits a plain fence for {code} without attributes", () => {
    expect(wikiToMarkdown("{code}\nplain\n{code}")).toBe("```\nplain\n```");
  });

  test("handles {noformat}", () => {
    expect(wikiToMarkdown("{noformat}\n-raw-\n{noformat}")).toBe("```\n-raw-\n```");
  });

  test("converts prose surrounding a code block", () => {
    expect(wikiToMarkdown("-gone-\n{code}\n-kept-\n{code}\n-also gone-")).toBe(
      "~~gone~~\n```\n-kept-\n```\n~~also gone~~",
    );
  });
});

describe("block structure", () => {
  test("headings", () => {
    expect(wikiToMarkdown("h1. One\nh3. Three")).toBe("# One\n### Three");
  });

  test("table gains a separator row", () => {
    expect(wikiToMarkdown("||Eligibility||Fee||\n|None|Not displayed|")).toBe(
      "| Eligibility | Fee |\n| --- | --- |\n| None | Not displayed |",
    );
  });

  test("blockquote via bq.", () => {
    expect(wikiToMarkdown("bq. quoted line")).toBe("> quoted line");
  });

  test("{quote} block", () => {
    expect(wikiToMarkdown("{quote}\nline one\nline two\n{quote}")).toBe("> line one\n> line two");
  });

  test("panel keeps its title", () => {
    expect(wikiToMarkdown("{panel:title=Watch out}\nbody text\n{panel}")).toBe(
      "> **Watch out**\n>\n> body text",
    );
  });

  test("horizontal rule", () => {
    expect(wikiToMarkdown("above\n----\nbelow")).toBe("above\n---\nbelow");
  });
});

describe("edge cases", () => {
  test("empty and nullish input", () => {
    expect(wikiToMarkdown("")).toBe("");
    expect(wikiToMarkdown(null)).toBe("");
    expect(wikiToMarkdown(undefined)).toBe("");
  });

  test("collapses runs of blank lines", () => {
    expect(wikiToMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("normalises CRLF", () => {
    expect(wikiToMarkdown("a\r\nb")).toBe("a\nb");
  });

  test("plain prose passes through unchanged", () => {
    const prose = "PHP must take over at request time in SpaRouter::createResponse().";
    expect(wikiToMarkdown(prose)).toBe(prose);
  });
});
