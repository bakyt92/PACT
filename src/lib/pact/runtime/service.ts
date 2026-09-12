import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  evaluateAdmission,
  evaluateExecution,
  type Decision,
  type Evidence,
  type Execution,
  type Mission,
  type Proposal,
  type TaskPayload,
} from "../core";
import { projectPublicBrief, VOICE_AI_BRIEF } from "./brief";
import { denialMessage, PactError } from "./errors";
import type {
  Clock,
  PactStore,
  SearchProvider,
  ServiceTokenVerifier,
  TaskProvider,
} from "./ports";

const searchInput = z
  .object({
    missionId: z.uuid(),
    query: z.string().trim().min(3).max(500),
  })
  .strict();
const proposalInput = z
  .object({
    missionId: z.uuid(),
    title: z.string().trim().min(1).max(170),
    description: z.string().trim().min(1).max(3000),
    evidenceIds: z.array(z.uuid()).min(1).max(8),
  })
  .strict();

function deny(decision: Decision, status = 409): never {
  if (decision.outcome === "ALLOW") throw new Error("Expected a denial.");
  throw new PactError(decision.reason, denialMessage(decision.reason), status);
}

function canonicalProposalHash(input: {
  proposalId: string;
  missionId: string;
  authorityEpoch: number;
  constitutionVersion: string;
  contractVersion: string;
  payload: TaskPayload;
}): string {
  const value = JSON.stringify({
    proposalId: input.proposalId,
    missionId: input.missionId,
    authorityEpoch: input.authorityEpoch,
    constitutionVersion: input.constitutionVersion,
    contractVersion: input.contractVersion,
    payload: {
      kind: input.payload.kind,
      workspaceId: input.payload.workspaceId,
      unassigned: input.payload.unassigned,
      title: input.payload.title,
      description: input.payload.description,
      evidence: input.payload.evidence.map(({ id, url }) => ({ id, url })),
    },
  });
  return createHash("sha256").update(value).digest("hex");
}

export interface RuntimeSnapshot {
  brief: ReturnType<typeof projectPublicBrief>;
  privacy: { status: "DECLARED_PRIVATE_FIELDS_EXCLUDED" };
  mission: Mission | null;
  evidence: Evidence[];
  proposal: Proposal | null;
  execution: Execution | null;
  events: ReturnType<PactStore["listEvents"]>;
}

export class PactRuntimeService {
  constructor(
    private readonly store: PactStore,
    private readonly clock: Clock,
    private readonly searchProvider: SearchProvider,
    private readonly taskProvider: TaskProvider,
  ) {}

  snapshot(missionId?: string): RuntimeSnapshot {
    const mission = missionId
      ? this.store.getMission(missionId)
      : this.store.latestMission();
    const proposal = mission ? this.store.latestProposal(mission.id) : null;
    return {
      brief: projectPublicBrief(VOICE_AI_BRIEF),
      privacy: { status: "DECLARED_PRIVATE_FIELDS_EXCLUDED" },
      mission,
      evidence: mission ? this.store.listEvidence(mission.id) : [],
      proposal,
      execution: proposal ? this.store.getExecution(proposal.id) : null,
      events: mission ? this.store.listEvents(mission.id) : [],
    };
  }

  async activateMission(): Promise<Mission> {
    const identity = await this.taskProvider.identity();
    return this.store.activateMission({
      id: randomUUID(),
      workspaceId: identity.workspaceId,
      workspaceName: identity.name,
      now: this.clock.now(),
    });
  }

  revokeMission(missionId: string): Mission {
    z.uuid().parse(missionId);
    return this.store.revokeMission(missionId, this.clock.now());
  }

  admitAgentRun(missionId: string): Decision {
    z.uuid().parse(missionId);
    return this.store.reserveAgentRun(missionId, this.clock.now());
  }

  async searchPublic(input: unknown): Promise<Evidence[]> {
    const parsed = searchInput.parse(input);
    const decision = this.store.reserveSearchAttempt(
      parsed.missionId,
      this.clock.now(),
    );
    if (decision.outcome !== "ALLOW") deny(decision);

    const context = projectPublicBrief(VOICE_AI_BRIEF);
    try {
      const results = await this.searchProvider.search({
        query: parsed.query,
        context,
        maxResults: 3,
      });
      const now = this.clock.now();
      const evidence = results.map((result) => ({
        id: randomUUID(),
        missionId: parsed.missionId,
        title: result.title,
        url: result.url,
        excerpt: result.excerpt,
        createdAt: now,
      }));
      this.store.saveEvidence(evidence);
      return evidence;
    } catch (error) {
      this.store.appendEvent({
        missionId: parsed.missionId,
        type: "SEARCH_FAILED",
        reason: error instanceof PactError ? error.code : "SEARCH_PROVIDER_ERROR",
        at: this.clock.now(),
      });
      if (error instanceof PactError) throw error;
      throw new PactError(
        "SEARCH_PROVIDER_ERROR",
        "The admitted Exa search failed; the attempt remains consumed.",
        502,
      );
    }
  }

  createProposal(input: unknown): Proposal {
    const parsed = proposalInput.parse(input);
    const mission = this.store.getMission(parsed.missionId);
    if (!mission) {
      throw new PactError(
        "MISSION_NOT_ACTIVE",
        denialMessage("MISSION_NOT_ACTIVE"),
      );
    }
    const decision = evaluateAdmission({
      mission,
      capability: "task.propose",
      workspaceId: mission.workspaceId,
      now: this.clock.now(),
    });
    if (decision.outcome !== "ALLOW") deny(decision);

    const available = new Map(
      this.store.listEvidence(mission.id).map((item) => [item.id, item]),
    );
    const selected = parsed.evidenceIds.map((id) => available.get(id));
    if (selected.some((item) => !item)) {
      throw new PactError(
        "EVIDENCE_MISMATCH",
        "The proposal references evidence that was not stored for this mission.",
        400,
      );
    }
    const evidence = selected as Evidence[];
    const proposalId = randomUUID();
    const cleanTitle = parsed.title.replace(/^\[PACT DEMO\]\s*/i, "").trim();
    const sources = evidence
      .map((item) => `- [${item.id}] ${item.url}`)
      .join("\n");
    const payload: TaskPayload = {
      kind: "task.create",
      workspaceId: mission.workspaceId,
      unassigned: true,
      title: `[PACT DEMO] ${cleanTitle}`,
      description: `${parsed.description}\n\nEvidence:\n${sources}\n\nPACT mission: ${mission.id}\nPACT proposal: ${proposalId}`,
      evidence: evidence.map(({ id, url }) => ({ id, url })),
    };
    const common = {
      proposalId,
      missionId: mission.id,
      authorityEpoch: mission.authorityEpoch,
      constitutionVersion: mission.constitutionVersion,
      contractVersion: mission.contractVersion,
      payload,
    };
    const proposal: Proposal = {
      id: proposalId,
      missionId: mission.id,
      status: "PROPOSED",
      payload,
      payloadHash: canonicalProposalHash(common),
      constitutionVersion: mission.constitutionVersion,
      contractVersion: mission.contractVersion,
      authorityEpoch: mission.authorityEpoch,
      createdAt: this.clock.now(),
      approvedAt: null,
      approvedBy: null,
      approvalHash: null,
    };
    return this.store.insertProposal(proposal);
  }

  approveProposal(input: {
    proposalId: string;
    displayedHash: string;
    constitutionVersion: string;
    contractVersion: string;
    operator: string;
  }): Decision {
    const decision = this.store.approveProposal({
      ...input,
      now: this.clock.now(),
    });
    if (decision.outcome !== "ALLOW") deny(decision);
    return decision;
  }

  rejectProposal(proposalId: string, operator: string): Decision {
    z.uuid().parse(proposalId);
    const decision = this.store.rejectProposal(
      proposalId,
      operator,
      this.clock.now(),
    );
    if (decision.outcome !== "ALLOW") deny(decision);
    return decision;
  }

  async executeAuthorized(
    serviceToken: string,
    proposalId: string,
    verifier: ServiceTokenVerifier,
  ): Promise<Execution> {
    z.uuid().parse(proposalId);
    const identity = await verifier.verify(serviceToken);
    const proposal = this.store.getProposal(proposalId);
    if (!proposal) {
      throw new PactError(
        "ACTION_MISMATCH",
        denialMessage("ACTION_MISMATCH"),
        404,
      );
    }
    const mission = this.store.getMission(proposal.missionId)!;
    const preliminary = evaluateExecution({
      mission,
      proposal,
      now: this.clock.now(),
      workspaceId: mission.workspaceId,
    });
    if (preliminary.outcome !== "ALLOW") {
      if (preliminary.reason === "ALREADY_CLAIMED") {
        const existing = this.store.getExecution(proposalId);
        if (existing) return existing;
      }
      this.store.appendEvent({
        missionId: mission.id,
        proposalId,
        type: "DISPATCH_DENIED",
        reason: preliminary.reason,
        at: this.clock.now(),
      });
      deny(preliminary);
    }

    const providerIdentity = await this.taskProvider.identity();
    if (providerIdentity.workspaceId !== mission.workspaceId) {
      throw new PactError(
        "SCOPE_MISMATCH",
        denialMessage("SCOPE_MISMATCH"),
      );
    }

    let claimed = false;
    try {
      const created = await this.taskProvider.create(
        proposal.payload.title,
        proposal.payload.description,
        async () => {
          const claim = this.store.claimExecution({
            proposalId,
            workspaceId: providerIdentity.workspaceId,
            serviceSubject: identity.subject,
            now: this.clock.now(),
          });
          if (claim.decision.outcome !== "ALLOW") deny(claim.decision);
          claimed = true;
        },
      );
      this.store.updateExecution({
        proposalId,
        status: "ACKNOWLEDGED",
        providerId: created.id,
        providerUrl: created.url,
        now: this.clock.now(),
      });
      try {
        const observed = await this.taskProvider.get(created.id);
        const matches =
          observed.title === proposal.payload.title &&
          observed.description === proposal.payload.description;
        return this.store.updateExecution({
          proposalId,
          status: matches ? "VERIFIED" : "ACKNOWLEDGED",
          providerId: created.id,
          providerUrl: created.url ?? observed.url,
          observedTitle: observed.title,
          observedDescription: observed.description,
          errorCode: matches ? null : "READBACK_MISMATCH",
          now: this.clock.now(),
        });
      } catch {
        return this.store.updateExecution({
          proposalId,
          status: "ACKNOWLEDGED",
          providerId: created.id,
          providerUrl: created.url,
          errorCode: "READBACK_FAILED",
          now: this.clock.now(),
        });
      }
    } catch (error) {
      if (claimed) {
        this.store.updateExecution({
          proposalId,
          status: "UNKNOWN",
          errorCode: "PROVIDER_OUTCOME_UNKNOWN",
          now: this.clock.now(),
        });
        throw new PactError(
          "PROVIDER_OUTCOME_UNKNOWN",
          "The Ambiguous write outcome is unknown. The claim remains consumed and will not be resent.",
          502,
        );
      }
      if (error instanceof PactError) {
        if (error.code === "ALREADY_CLAIMED") {
          const existing = this.store.getExecution(proposalId);
          if (existing) return existing;
        }
        throw error;
      }
      throw new PactError(
        "AMBIGUOUS_PREWRITE_FAILED",
        "Ambiguous failed before a write claim was admitted.",
        502,
      );
    }
  }

  async refreshReceipt(proposalId: string): Promise<Execution> {
    z.uuid().parse(proposalId);
    const execution = this.store.getExecution(proposalId);
    if (!execution?.providerId) {
      throw new PactError(
        "RECEIPT_UNAVAILABLE",
        "No acknowledged provider record is available to read back.",
        409,
      );
    }
    const proposal = this.store.getProposal(proposalId)!;
    const observed = await this.taskProvider.get(execution.providerId);
    const matches =
      observed.title === proposal.payload.title &&
      observed.description === proposal.payload.description;
    return this.store.updateExecution({
      proposalId,
      status: matches ? "VERIFIED" : "ACKNOWLEDGED",
      providerId: execution.providerId,
      providerUrl: execution.providerUrl ?? observed.url,
      observedTitle: observed.title,
      observedDescription: observed.description,
      errorCode: matches ? null : "READBACK_MISMATCH",
      now: this.clock.now(),
    });
  }
}
