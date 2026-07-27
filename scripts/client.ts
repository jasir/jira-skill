/**
 * JIRA REST client.
 *
 * `fetch` is injectable so the error paths — the ones that actually broke in
 * production, e.g. Atlassian removing /rest/api/3/search (HTTP 410) — can be
 * tested offline.
 */

export interface Credentials {
  url: string;
  user: string;
  token: string;
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JiraError";
  }
}

export function parseCredentials(raw: string): Credentials {
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*(JIRA_URL|JIRA_USER|JIRA_TOKEN)\s*=\s*(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const missing = ["JIRA_URL", "JIRA_USER", "JIRA_TOKEN"].filter((k) => !values[k]);
  if (missing.length) {
    throw new JiraError(`credentials file is missing: ${missing.join(", ")}`);
  }

  return {
    url: values.JIRA_URL.replace(/\/+$/, ""),
    user: values.JIRA_USER,
    token: values.JIRA_TOKEN,
  };
}

export const CREDENTIALS_HELP = `Create it with:
  mkdir -p ~/.config/jira
  cat > ~/.config/jira/credentials << 'EOF'
  JIRA_URL=https://your-instance.atlassian.net
  JIRA_USER=your@email.com
  JIRA_TOKEN=ATATT3x...
  EOF
  chmod 600 ~/.config/jira/credentials`;

export class JiraClient {
  constructor(
    private readonly creds: Credentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get baseUrl(): string {
    return this.creds.url;
  }

  /**
   * @param version 2 for rich text as wiki markup, 3 for ADF
   */
  async request(
    version: 2 | 3,
    path: string,
    init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
  ): Promise<any> {
    const url = new URL(`${this.creds.url}/rest/api/${version}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${this.creds.user}:${this.creds.token}`)}`,
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (cause) {
      throw new JiraError(`network error talking to ${this.creds.url}: ${String(cause)}`);
    }

    const text = await response.text();

    if (!response.ok) throw new JiraError(errorMessage(response.status, text), response.status);
    if (text.trim() === "") return null;

    try {
      return JSON.parse(text);
    } catch {
      throw new JiraError(`JIRA returned a non-JSON body (HTTP ${response.status})`, response.status);
    }
  }
}

function errorMessage(status: number, body: string): string {
  if (status === 401) {
    return "unauthorized (401) - token expired? Update ~/.config/jira/credentials";
  }
  if (status === 404) {
    return "not found (404) - check issue key, project access, or token validity (JIRA returns 404 for auth errors too)";
  }
  if (status === 410) {
    return "gone (410) - Atlassian removed this endpoint; the wrapper needs updating";
  }

  const details = extractErrorDetails(body);
  return details ? `HTTP ${status}\n${details}` : `HTTP ${status}`;
}

function extractErrorDetails(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const messages: string[] = [...(parsed.errorMessages ?? [])];
    for (const [field, message] of Object.entries(parsed.errors ?? {})) {
      messages.push(`${field}: ${message}`);
    }
    return messages.join("\n");
  } catch {
    return "";
  }
}
