import { describe, expect, test } from "bun:test";
import { JiraClient, JiraError, parseCredentials } from "../../scripts/client";

const CREDS = { url: "https://example.atlassian.net", user: "me@example.com", token: "t0ken" };

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(reply: { status: number; body: string }, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(reply.body, { status: reply.status });
  }) as unknown as typeof fetch;
}

describe("parseCredentials", () => {
  test("reads the three keys", () => {
    expect(
      parseCredentials("JIRA_URL=https://x.atlassian.net\nJIRA_USER=a@b.c\nJIRA_TOKEN=abc"),
    ).toEqual({ url: "https://x.atlassian.net", user: "a@b.c", token: "abc" });
  });

  test("ignores comments and blank lines, strips quotes and a trailing slash", () => {
    const creds = parseCredentials(
      '# comment\n\nJIRA_URL="https://x.atlassian.net/"\nJIRA_USER=a@b.c\nJIRA_TOKEN=abc\n',
    );
    expect(creds.url).toBe("https://x.atlassian.net");
  });

  test("names the missing keys", () => {
    expect(() => parseCredentials("JIRA_URL=https://x.atlassian.net")).toThrow(
      /missing: JIRA_USER, JIRA_TOKEN/,
    );
  });
});

describe("HTTP error mapping", () => {
  const cases: [number, RegExp][] = [
    [401, /unauthorized \(401\).*token expired/s],
    [404, /not found \(404\).*404 for auth errors too/s],
    [410, /gone \(410\).*removed this endpoint/s],
  ];

  for (const [status, expected] of cases) {
    test(`HTTP ${status} gets an actionable message`, async () => {
      const client = new JiraClient(CREDS, mockFetch({ status, body: "{}" }));
      expect(client.request(3, "/issue/X-1")).rejects.toThrow(expected);
    });
  }

  test("surfaces errorMessages from the body", async () => {
    const client = new JiraClient(
      CREDS,
      mockFetch({ status: 400, body: JSON.stringify({ errorMessages: ["Bad JQL"] }) }),
    );
    expect(client.request(3, "/search/jql")).rejects.toThrow(/HTTP 400\nBad JQL/);
  });

  test("surfaces per-field errors from the body", async () => {
    const client = new JiraClient(
      CREDS,
      mockFetch({ status: 400, body: JSON.stringify({ errors: { summary: "is required" } }) }),
    );
    expect(client.request(3, "/issue")).rejects.toThrow(/summary: is required/);
  });

  test("carries the status code on the error", async () => {
    const client = new JiraClient(CREDS, mockFetch({ status: 503, body: "" }));
    await client.request(3, "/x").then(
      () => expect.unreachable(),
      (error: JiraError) => expect(error.status).toBe(503),
    );
  });

  test("an HTML error page does not surface as a JSON parse crash", async () => {
    const client = new JiraClient(CREDS, mockFetch({ status: 200, body: "<html>nope</html>" }));
    expect(client.request(3, "/x")).rejects.toThrow(/non-JSON body/);
  });

  test("an empty 204 body returns null rather than throwing", async () => {
    const client = new JiraClient(CREDS, mockFetch({ status: 204, body: "" }));
    expect(await client.request(3, "/issue/X-1/transitions")).toBeNull();
  });

  test("a network failure is reported as such", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new JiraClient(CREDS, failing);
    expect(client.request(3, "/x")).rejects.toThrow(/network error.*ECONNREFUSED/s);
  });
});

describe("request building", () => {
  test("puts the API version in the path and encodes the query", async () => {
    const calls: Call[] = [];
    const client = new JiraClient(CREDS, mockFetch({ status: 200, body: "{}" }, calls));
    await client.request(2, "/issue/KNW-1", { query: { fields: "description,summary" } });

    expect(calls[0].url).toBe(
      "https://example.atlassian.net/rest/api/2/issue/KNW-1?fields=description%2Csummary",
    );
  });

  test("sends basic auth", async () => {
    const calls: Call[] = [];
    const client = new JiraClient(CREDS, mockFetch({ status: 200, body: "{}" }, calls));
    await client.request(3, "/myself");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa("me@example.com:t0ken")}`);
  });

  test("serialises a POST body and sets the content type", async () => {
    const calls: Call[] = [];
    const client = new JiraClient(CREDS, mockFetch({ status: 200, body: "{}" }, calls));
    await client.request(3, "/issue/X/comment", { method: "POST", body: { a: 1 } });

    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe('{"a":1}');
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  test("a GET carries no body and no content type", async () => {
    const calls: Call[] = [];
    const client = new JiraClient(CREDS, mockFetch({ status: 200, body: "{}" }, calls));
    await client.request(3, "/issue/X");

    expect(calls[0].init.body).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});
