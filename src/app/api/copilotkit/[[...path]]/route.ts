import { randomUUID } from "node:crypto";
import {
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import { makePactAgent } from "@/lib/pact/runtime/agent";
import { pactStore } from "@/lib/pact/server";
import { denialMessage } from "@/lib/pact/runtime/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PACT does not export contextual content through optional runtime telemetry.
process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";

const copilot = new CopilotRuntime({
  agents: () => ({ default: makePactAgent(randomUUID()) }),
});
const app = createCopilotHonoHandler({
  runtime: copilot,
  basePath: "/api/copilotkit",
});
const activeMissions = new Set<string>();

export const GET = app.fetch;
export const OPTIONS = app.fetch;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const missionId = url.searchParams.get("missionId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    return Response.json(
      { error: "Activate a mission before starting the agent." },
      { status: 403 },
    );
  }
  // Only an actual agent run spends the bounded run allowance. Suggestion,
  // connect and stop protocol requests are not model-run admissions.
  if (!url.pathname.endsWith("/run")) {
    return app.fetch(request);
  }
  if (activeMissions.has(missionId)) {
    return Response.json(
      { error: denialMessage("RUN_ALREADY_ACTIVE"), code: "RUN_ALREADY_ACTIVE" },
      { status: 409 },
    );
  }
  const decision = pactStore().reserveAgentRun(missionId, Date.now());
  if (decision.outcome !== "ALLOW") {
    return Response.json(
      { error: denialMessage(decision.reason), code: decision.reason },
      { status: 409 },
    );
  }
  activeMissions.add(missionId);
  try {
    const upstream = await app.fetch(request);
    if (!upstream.body) {
      activeMissions.delete(missionId);
      return upstream;
    }
    const reader = upstream.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            activeMissions.delete(missionId);
            controller.close();
          } else {
            controller.enqueue(next.value);
          }
        } catch (error) {
          activeMissions.delete(missionId);
          controller.error(error);
        }
      },
      async cancel(reason) {
        activeMissions.delete(missionId);
        await reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (error) {
    activeMissions.delete(missionId);
    throw error;
  }
}
