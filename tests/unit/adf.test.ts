import { describe, expect, test } from "bun:test";
import { buildCommentDocument } from "../../scripts/adf";

const BASE = "https://example.atlassian.net";
const doc = (text: string) => buildCommentDocument(text, BASE);
const nodes = (text: string) => doc(text).content[0].content;

describe("plain comments keep working", () => {
  test("text with no markers is a single text node", () => {
    expect(doc("Fixed in build 1.2.3")).toEqual({
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Fixed in build 1.2.3" }] }],
    });
  });

  test("a bare issue key is NOT turned into a card", () => {
    expect(nodes("see KNW-30718 for details")).toEqual([
      { type: "text", text: "see KNW-30718 for details" },
    ]);
  });
});

describe("[[KEY]] markers", () => {
  test("become an inlineCard pointing at the browse URL", () => {
    expect(nodes("see [[KNW-30718]] please")).toEqual([
      { type: "text", text: "see " },
      {
        type: "inlineCard",
        attrs: { url: `${BASE}/browse/KNW-30718`, localId: "link-KNW-30718-0" },
      },
      { type: "text", text: " please" },
    ]);
  });

  test("a marker at the very start emits no leading empty text node", () => {
    expect(nodes("[[KNW-1]] first")).toMatchObject([
      { type: "inlineCard" },
      { type: "text", text: " first" },
    ]);
  });

  test("a marker at the very end emits no trailing empty text node", () => {
    expect(nodes("last [[KNW-1]]")).toMatchObject([{ type: "text" }, { type: "inlineCard" }]);
  });

  test("adjacent markers produce two cards and no empty text between them", () => {
    expect(nodes("[[KNW-1]][[KNW-2]]")).toMatchObject([
      { type: "inlineCard" },
      { type: "inlineCard" },
    ]);
  });

  test("localId is unique across the whole document", () => {
    const ids = doc("[[KNW-1]] a\n\n[[KNW-1]] b")
      .content.flatMap((p) => p.content ?? [])
      .filter((n) => n.type === "inlineCard")
      .map((n) => n.attrs!.localId);
    expect(ids).toEqual(["link-KNW-1-0", "link-KNW-1-1"]);
  });

  test("a lowercase key is not a marker", () => {
    expect(nodes("[[knw-1]]")).toEqual([{ type: "text", text: "[[knw-1]]" }]);
  });

  test("an unclosed marker is left as literal text", () => {
    expect(nodes("[[KNW-1 oops")).toEqual([{ type: "text", text: "[[KNW-1 oops" }]);
  });

  test("a trailing slash on the base URL does not double up", () => {
    const card = buildCommentDocument("[[KNW-1]]", "https://example.atlassian.net/")
      .content[0].content![0];
    expect(card.attrs!.url).toBe("https://example.atlassian.net/browse/KNW-1");
  });
});

describe("multiline comments", () => {
  test("a single newline becomes a hardBreak, not a raw newline in a text node", () => {
    expect(nodes("one\ntwo")).toEqual([
      { type: "text", text: "one" },
      { type: "hardBreak" },
      { type: "text", text: "two" },
    ]);
  });

  test("a blank line starts a new paragraph", () => {
    const d = doc("first para\n\nsecond para");
    expect(d.content).toHaveLength(2);
    expect(d.content[1].content).toEqual([{ type: "text", text: "second para" }]);
  });

  test("no text node ever contains a newline", () => {
    const d = doc("a\nb\n\nc [[KNW-1]] d\ne");
    const texts = d.content
      .flatMap((p) => p.content ?? [])
      .filter((n) => n.type === "text")
      .map((n) => n.text!);
    expect(texts.every((t) => !t.includes("\n"))).toBe(true);
  });

  test("an empty paragraph carries no empty content array", () => {
    expect(doc("").content[0]).toEqual({ type: "paragraph" });
  });
});
