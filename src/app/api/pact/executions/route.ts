import { z } from "zod";
import { connectPactRuntime, executeWithBearer } from "@/lib/pact/server";
import { PactError } from "@/lib/pact/runtime/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ proposalId: z.uuid() }).strict();

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON is required." }, { status: 400 });
  }
  let connection: ReturnType<typeof connectPactRuntime> | undefined;
  try {
    connection = connectPactRuntime();
    const { proposalId } = bodySchema.parse(await request.json());
    const execution = await executeWithBearer(
      connection.runtime,
      proposalId,
      request.headers.get("authorization"),
    );
    return Response.json({ execution }, { status: 200 });
  } catch (error) {
    if (error instanceof PactError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json({ error: "Invalid protected execution request." }, { status: 400 });
  } finally {
    try {
      await connection?.close();
    } catch {
      // Cleanup cannot change the authorization response.
    }
  }
}

