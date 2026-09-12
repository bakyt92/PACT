import type {
  Decision,
  Evidence,
  Execution,
  Mission,
  PactEvent,
  Proposal,
} from "../core";
import type { PublicBrief } from "./brief";

export interface Clock {
  now(): number;
}

export interface SearchResult {
  title: string;
  url: string;
  excerpt: string;
}

export interface SearchProvider {
  search(input: {
    query: string;
    context: PublicBrief;
    maxResults: number;
  }): Promise<SearchResult[]>;
}

export interface ProviderTask {
  id: string;
  title: string;
  description: string;
  url: string | null;
}

export interface TaskProvider {
  identity(): Promise<{ id: string; workspaceId: string; name: string }>;
  create(
    title: string,
    description: string,
    beforeWrite: () => Promise<void>,
  ): Promise<ProviderTask>;
  get(id: string): Promise<ProviderTask>;
}

export interface VerifiedServiceIdentity {
  subject: string;
  scopes: string[];
  expiresAt: number;
}

export interface ServiceTokenVerifier {
  verify(token: string): Promise<VerifiedServiceIdentity>;
}

export interface ClaimResult {
  decision: Decision;
  execution: Execution | null;
}

export interface PactStore {
  activateMission(input: {
    id: string;
    workspaceId: string;
    workspaceName: string;
    now: number;
    lifetimeMs?: number;
  }): Mission;
  getMission(id: string): Mission | null;
  latestMission(): Mission | null;
  revokeMission(id: string, now: number): Mission;
  reserveSearchAttempt(id: string, now: number): Decision;
  reserveAgentRun(id: string, now: number): Decision;
  saveEvidence(items: Evidence[]): void;
  listEvidence(missionId: string): Evidence[];
  insertProposal(proposal: Proposal): Proposal;
  getProposal(id: string): Proposal | null;
  latestProposal(missionId: string): Proposal | null;
  approveProposal(input: {
    proposalId: string;
    displayedHash: string;
    constitutionVersion: string;
    contractVersion: string;
    operator: string;
    now: number;
  }): Decision;
  rejectProposal(id: string, operator: string, now: number): Decision;
  claimExecution(input: {
    proposalId: string;
    workspaceId: string;
    serviceSubject: string;
    now: number;
  }): ClaimResult;
  updateExecution(input: {
    proposalId: string;
    status: Execution["status"];
    now: number;
    providerId?: string | null;
    providerUrl?: string | null;
    observedTitle?: string | null;
    observedDescription?: string | null;
    errorCode?: string | null;
  }): Execution;
  getExecution(proposalId: string): Execution | null;
  appendEvent(input: {
    missionId: string;
    proposalId?: string | null;
    type: string;
    reason?: string | null;
    summary?: Record<string, unknown>;
    at: number;
  }): void;
  listEvents(missionId: string): PactEvent[];
  close(): void;
}

