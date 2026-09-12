import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  connectPactRuntime,
  executeWithConfiguredServiceToken,
  integrationStatuses,
} from "@/lib/pact/server";
import { PactError } from "@/lib/pact/runtime/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const origin = process.env.PACT_ORIGIN || "http://127.0.0.1:3100";
const cookieName = "pact-local-operator";
const command = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("activate") }).strict(),
  z
    .object({
      operation: z.literal("search"),
      missionId: z.uuid(),
      query: z.string(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("propose"),
      missionId: z.uuid(),
      title: z.string(),
      description: z.string(),
      evidenceIds: z.array(z.uuid()),
    })
    .strict(),
  z
    .object({
      operation: z.literal("approve"),
      proposalId: z.uuid(),
      displayedHash: z.string().regex(/^[a-f0-9]{64}$/),
      constitutionVersion: z.string(),
      contractVersion: z.string(),
    })
    .strict(),
  z
    .object({ operation: z.literal("reject"), proposalId: z.uuid() })
    .strict(),
  z.object({ operation: z.literal("revoke"), missionId: z.uuid() }).strict(),
  z.object({ operation: z.literal("execute"), proposalId: z.uuid() }).strict(),
  z.object({ operation: z.literal("receipt"), proposalId: z.uuid() }).strict(),
]);

function session(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

function operator(sessionId: string) {
  return `local-operator:${createHash("sha256").update(sessionId).digest("hex").slice(0, 12)}`;
}

function response(
  value: unknown,
  status = 200,
  newSession?: string,
): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(newSession
        ? {
            "Set-Cookie": `${cookieName}=${newSession}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          }
        : {}),
    },
  });
}

function safeError(error: unknown): Response {
  if (error instanceof PactError) {
    return response({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return response({ error: "Invalid PACT request.", code: "INVALID_REQUEST" }, 400);
  }
  return response(
    {
      error: "The operation failed at a protected server boundary.",
      code: "SERVER_BOUNDARY_ERROR",
    },
    502,
  );
}

export async function GET(request: Request) {
  const incoming = session(request);
  const newSession = incoming ? undefined : randomBytes(32).toString("hex");
  let connection: ReturnType<typeof connectPactRuntime> | undefined;
  try {
    connection = connectPactRuntime();
    return response(
      {
        ...connection.runtime.snapshot(
          new URL(request.url).searchParams.get("missionId") || undefined,
        ),
        integrations: integrationStatuses(),
      },
      200,
      newSession,
    );
  } catch (error) {
    return safeError(error);
  } finally {
    try {
      await connection?.close();
    } catch {
      // Never surface transport cleanup details.
    }
  }
}

export async function POST(request: Request) {
  const sessionId = session(request);
  if (
    request.headers.get("origin") !== origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return response(
      { error: "Use this app's trusted local controls.", code: "ORIGIN_DENIED" },
      403,
    );
  }
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) {
    return response(
      { error: "Reload the page to establish the local operator session.", code: "SESSION_REQUIRED" },
      403,
    );
  }
  let connection: ReturnType<typeof connectPactRuntime> | undefined;
  try {
    connection = connectPactRuntime();
    const input = command.parse(await request.json());
    const actor = operator(sessionId);
    let result: unknown;
    switch (input.operation) {
      case "activate":
        result = await connection.runtime.activateMission();
        break;
      case "search":
        result = await connection.runtime.searchPublic({
          missionId: input.missionId,
          query: input.query,
        });
        break;
      case "propose":
        result = connection.runtime.createProposal({
          missionId: input.missionId,
          title: input.title,
          description: input.description,
          evidenceIds: input.evidenceIds,
        });
        break;
      case "approve":
        result = connection.runtime.approveProposal({ ...input, operator: actor });
        break;
      case "reject":
        result = connection.runtime.rejectProposal(input.proposalId, actor);
        break;
      case "revoke":
        result = connection.runtime.revokeMission(input.missionId);
        break;
      case "execute":
        result = await executeWithConfiguredServiceToken(
          connection.runtime,
          input.proposalId,
        );
        break;
      case "receipt":
        result = await connection.runtime.refreshReceipt(input.proposalId);
        break;
    }
    return response({ result });
  } catch (error) {
    return safeError(error);
  } finally {
    try {
      await connection?.close();
    } catch {
      // Never surface transport cleanup details.
    }
  }
}
