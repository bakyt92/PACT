import { resolve } from "node:path";
import { Auth0ClientCredentials, auth0Config, JoseServiceTokenVerifier } from "./adapters/auth0";
import { connectAmbiguous } from "./adapters/ambiguous";
import { ExaSearchProvider } from "./adapters/exa";
import { SqlitePactStore } from "./adapters/sqlite-store";
import { PactError } from "./runtime/errors";
import { PactRuntimeService } from "./runtime/service";
import type { SearchProvider } from "./runtime/ports";

const globalState = globalThis as typeof globalThis & {
  pactStore?: SqlitePactStore;
  auth0Client?: Auth0ClientCredentials;
};

function required(name: string, aliases: string[] = []): string {
  for (const candidate of [name, ...aliases]) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }
  throw new PactError(
    `${name}_NOT_CONFIGURED`,
    `Set ${name} in the root environment.`,
    503,
  );
}

export function pactStore(): SqlitePactStore {
  return (globalState.pactStore ??= new SqlitePactStore(
    resolve(process.env.PACT_DB_PATH || ".data/pact.sqlite"),
  ));
}

export function integrationConfiguration() {
  return {
    OpenAI: Boolean(process.env.OPENAI_API_KEY?.trim()),
    Exa: Boolean(process.env.EXA_API_KEY?.trim()),
    CopilotKit: true,
    Auth0: [
      "AUTH0_DOMAIN",
      "AUTH0_AUDIENCE",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
    ].every((name) => Boolean(process.env[name]?.trim())),
    Ambiguous: Boolean(
      process.env.AMBIGUOUS_API_KEY?.trim() || process.env.AMBIGUOS_KEY?.trim(),
    ),
  };
}

export function integrationStatuses() {
  const configured = integrationConfiguration();
  const mission = pactStore().latestMission();
  const proposal = mission ? pactStore().latestProposal(mission.id) : null;
  const execution = proposal ? pactStore().getExecution(proposal.id) : null;
  const evidence = mission ? pactStore().listEvidence(mission.id) : [];
  const events = mission ? pactStore().listEvents(mission.id) : [];
  const agentProducedProposal = Boolean(proposal);
  return {
    OpenAI: agentProducedProposal
      ? "VERIFIED"
      : configured.OpenAI
        ? "CONFIGURED"
        : "BLOCKED",
    Exa: evidence.length ? "VERIFIED" : configured.Exa ? "CONFIGURED" : "BLOCKED",
    CopilotKit: agentProducedProposal
      ? "VERIFIED"
      : events.some((event) => event.type === "AGENT_RUN_ADMITTED")
        ? "CONFIGURED"
        : "CONFIGURED",
    Auth0: execution
      ? "VERIFIED"
      : configured.Auth0
        ? "CONFIGURED"
        : "BLOCKED",
    Ambiguous: mission
      ? "VERIFIED"
      : configured.Ambiguous
        ? "CONFIGURED"
        : "BLOCKED",
  } as const;
}

export function connectPactRuntime(options?: { search?: SearchProvider }) {
  const ambiguous = connectAmbiguous(
    required("AMBIGUOUS_API_KEY", ["AMBIGUOS_KEY"]),
  );
  const search =
    options?.search ?? new ExaSearchProvider(required("EXA_API_KEY"));
  return {
    runtime: new PactRuntimeService(
      pactStore(),
      { now: Date.now },
      search,
      ambiguous.provider,
    ),
    close: ambiguous.close,
  };
}

export async function executeWithConfiguredServiceToken(
  runtime: PactRuntimeService,
  proposalId: string,
) {
  const config = auth0Config(process.env);
  const client = (globalState.auth0Client ??= new Auth0ClientCredentials(config));
  const token = await client.token();
  const verifier = new JoseServiceTokenVerifier(config);
  return runtime.executeAuthorized(token, proposalId, verifier);
}

export async function executeWithBearer(
  runtime: PactRuntimeService,
  proposalId: string,
  authorization: string | null,
) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const config = auth0Config(process.env);
  return runtime.executeAuthorized(
    token,
    proposalId,
    new JoseServiceTokenVerifier(config),
  );
}
