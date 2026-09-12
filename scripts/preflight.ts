import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  Auth0ClientCredentials,
  auth0Config,
  JoseServiceTokenVerifier,
} from "../src/lib/pact/adapters/auth0";

type Status = "CONFIGURED" | "VERIFIED" | "BLOCKED" | "NOT_RUN";
const observed: Record<string, { status: Status; detail: string }> = {};
const mark = (name: string, status: Status, detail: string) => {
  observed[name] = { status, detail };
};

async function openai() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return mark("OpenAI", "BLOCKED", "OPENAI_API_KEY missing");
  const model = (process.env.OPENAI_MODEL || process.env.MODEL || "gpt-4.1-mini").trim();
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: "Reply with only OK.", max_output_tokens: 16 }),
    });
    mark("OpenAI", response.ok ? "VERIFIED" : "BLOCKED", response.ok ? `model ${model}` : `HTTP ${response.status}`);
  } catch {
    mark("OpenAI", "BLOCKED", "timeout or network failure");
  }
}

async function exa() {
  const key = process.env.EXA_API_KEY?.trim();
  if (!key) return mark("Exa", "BLOCKED", "EXA_API_KEY missing");
  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "voice interaction clinical documentation France", type: "fast", numResults: 1 }),
    });
    mark("Exa", response.ok ? "VERIFIED" : "BLOCKED", response.ok ? "bounded search returned" : `HTTP ${response.status}`);
  } catch {
    mark("Exa", "BLOCKED", "timeout or network failure");
  }
}

async function ambiguous() {
  const key = (process.env.AMBIGUOUS_API_KEY || process.env.AMBIGUOS_KEY)?.trim();
  if (!key) return mark("Ambiguous", "BLOCKED", "AMBIGUOUS_API_KEY missing");
  const client = new Client({ name: "pact-preflight", version: "0.2.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://app.ambiguous.ai/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
      { timeout: 15_000 },
    );
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 15_000 });
      pages.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor && pages.length < 200);
    const required = ["auth_whoami", "create_task", "get_task"];
    const available = required.filter((name) => pages.some((tool) => tool.name === name));
    const identity = CallToolResultSchema.parse(
      await client.callTool({ name: "auth_whoami", arguments: {} }, CallToolResultSchema, { timeout: 15_000 }),
    );
    mark(
      "Ambiguous",
      available.length === required.length && !identity.isError ? "VERIFIED" : "BLOCKED",
      `identity read; tools ${available.join(",") || "missing"}`,
    );
  } catch {
    mark("Ambiguous", "BLOCKED", "identity/catalog unavailable");
  } finally {
    try { await client.close(); } catch { /* sanitized cleanup */ }
  }
}

async function auth0() {
  try {
    const config = auth0Config(process.env);
    mark("Auth0", "CONFIGURED", "configuration complete");
    const token = await new Auth0ClientCredentials(config).token();
    await new JoseServiceTokenVerifier(config).verify(token);
    mark("Auth0", "VERIFIED", `audience and ${config.requiredScope} verified`);
  } catch (error) {
    mark(
      "Auth0",
      "BLOCKED",
      error instanceof Error && error.message.startsWith("Set AUTH0_")
        ? error.message
        : "token mint/verification failed",
    );
  }
}

await Promise.all([openai(), exa(), ambiguous(), auth0()]);
mark("CopilotKit", "NOT_RUN", "start the app, then verify /api/copilotkit/info and one agent run");
for (const name of ["OpenAI", "Exa", "CopilotKit", "Auth0", "Ambiguous"]) {
  const result = observed[name];
  console.log(`${name}=${result.status} ${result.detail}`);
}

