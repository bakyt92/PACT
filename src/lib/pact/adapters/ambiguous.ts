/** Narrow task-only adapter derived from the verified starter boundary. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import {
  CallToolResultSchema,
  type CallToolResult,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ProviderTask, TaskProvider } from "../runtime/ports";
import { PactError } from "../runtime/errors";

export interface McpConnection {
  listTools(params?: { cursor?: string }): Promise<ListToolsResult>;
  callTool(input: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<CallToolResult>;
}

const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  url: z.url().nullable().optional(),
});
const identitySchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  display_name: z.string().min(1),
});
const validators = new AjvJsonSchemaValidator();

function providerPayload(result: CallToolResult): unknown {
  if (result.isError) {
    throw new PactError(
      "AMBIGUOUS_REJECTED",
      "Ambiguous rejected the operation; check workspace task permissions.",
      502,
    );
  }
  if (result.structuredContent) return result.structuredContent;
  const text = result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
  try {
    return JSON.parse(text);
  } catch {
    throw new PactError(
      "AMBIGUOUS_UNREADABLE",
      "Ambiguous returned an unreadable result; no record is confirmed.",
      502,
    );
  }
}

function providerTask(value: unknown): ProviderTask {
  const parsed = taskSchema.safeParse(value);
  if (!parsed.success) {
    throw new PactError(
      "AMBIGUOUS_INVALID_TASK",
      "Ambiguous returned an invalid task record.",
      502,
    );
  }
  const { id, title, description, url } = parsed.data;
  if (url) {
    const link = new URL(url);
    if (
      link.protocol !== "https:" ||
      link.username ||
      link.password ||
      link.hostname !== "app.ambiguous.ai"
    ) {
      throw new PactError(
        "AMBIGUOUS_UNSAFE_LINK",
        "Ambiguous returned an unsafe record link.",
        502,
      );
    }
  }
  return { id, title, description: description ?? "", url: url ?? null };
}

export class AmbiguousTaskProvider implements TaskProvider {
  constructor(private readonly connection: McpConnection) {}

  private async call(
    name: string,
    args: Record<string, unknown>,
    beforeCall?: () => Promise<void>,
  ) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.connection.listTools(cursor ? { cursor } : {});
      const tool = page.tools.find((candidate) => candidate.name === name);
      if (tool) {
        const valid = validators.getValidator(tool.inputSchema)(args);
        if (!valid.valid) {
          throw new PactError(
            "AMBIGUOUS_SCHEMA_CHANGED",
            `Ambiguous ${name} schema changed; review the live schema before writing.`,
            502,
          );
        }
        await beforeCall?.();
        return providerPayload(
          await this.connection.callTool({ name, arguments: args }),
        );
      }
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) {
        throw new PactError(
          "AMBIGUOUS_SCHEMA_PAGINATION",
          "Ambiguous tool schema pagination repeated a cursor.",
          502,
        );
      }
      if (cursor) seen.add(cursor);
    } while (cursor);
    throw new PactError(
      "AMBIGUOUS_SCHEMA_UNAVAILABLE",
      `Ambiguous ${name} schema is unavailable in the connected workspace.`,
      502,
    );
  }

  async identity() {
    const parsed = identitySchema.safeParse(await this.call("auth_whoami", {}));
    if (!parsed.success) {
      throw new PactError(
        "AMBIGUOUS_IDENTITY_INVALID",
        "Ambiguous identity has no usable workspace.",
        502,
      );
    }
    return {
      id: parsed.data.id,
      workspaceId: parsed.data.workspace_id,
      name: parsed.data.display_name,
    };
  }

  async create(
    title: string,
    description: string,
    beforeWrite: () => Promise<void>,
  ) {
    const result = z
      .object({ task: z.unknown() })
      .parse(await this.call("create_task", { title, description }, beforeWrite));
    return providerTask(result.task);
  }

  async get(id: string) {
    z.uuid().parse(id);
    const result = z
      .object({ task: z.unknown() })
      .parse(await this.call("get_task", { id }));
    const task = providerTask(result.task);
    if (task.id !== id) {
      throw new PactError(
        "AMBIGUOUS_ID_MISMATCH",
        "Ambiguous returned a different task ID than requested.",
        502,
      );
    }
    return task;
  }
}

export function connectAmbiguous(apiKey: string): {
  provider: TaskProvider;
  close(): Promise<void>;
} {
  if (!apiKey.trim()) {
    throw new PactError(
      "AMBIGUOUS_NOT_CONFIGURED",
      "Set AMBIGUOUS_API_KEY in the root environment.",
      503,
    );
  }
  const client = new Client({ name: "pact", version: "0.2.0" });
  let connected: Promise<void> | undefined;
  const connect = () =>
    (connected ??= client.connect(
      new StreamableHTTPClientTransport(new URL("https://app.ambiguous.ai/mcp"), {
        requestInit: {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
        },
      }),
      { timeout: 15_000 },
    ));
  const connection: McpConnection = {
    async listTools(params) {
      await connect();
      return client.listTools(params ?? {}, { timeout: 15_000 });
    },
    async callTool(input) {
      await connect();
      return CallToolResultSchema.parse(
        await client.callTool(input, CallToolResultSchema, { timeout: 20_000 }),
      );
    },
  };
  return {
    provider: new AmbiguousTaskProvider(connection),
    close: () => client.close(),
  };
}

