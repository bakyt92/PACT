export const CONSTITUTION_VERSION = "pact-constitution/1" as const;
export const CONTRACT_VERSION = "voice-ai-france/1" as const;

export type Capability = "search.public" | "task.propose" | "task.create";
export type MissionStatus = "DRAFT" | "ACTIVE" | "REVOKED";
export type ProposalStatus =
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "CLAIMED"
  | "ACKNOWLEDGED"
  | "VERIFIED"
  | "BLOCKED"
  | "UNKNOWN";

export type DenyReason =
  | "MISSION_NOT_ACTIVE"
  | "MISSION_REVOKED"
  | "MISSION_EXPIRED"
  | "QUOTA_EXCEEDED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "ACTION_MISMATCH"
  | "SCOPE_MISMATCH"
  | "VERSION_MISMATCH"
  | "ALREADY_CLAIMED"
  | "RUN_ALREADY_ACTIVE";

export type Decision =
  | { outcome: "ALLOW" }
  | { outcome: "REQUIRE_APPROVAL"; reason: "APPROVAL_REQUIRED" }
  | { outcome: "DENY"; reason: DenyReason };

export interface Mission {
  id: string;
  status: MissionStatus;
  objective: string;
  workspaceId: string;
  workspaceName: string;
  constitutionVersion: string;
  contractVersion: string;
  authorityEpoch: number;
  activatedAt: number | null;
  expiresAt: number | null;
  searchLimit: number;
  searchUsed: number;
  writeLimit: number;
  writeUsed: number;
  runLimit: number;
  runsUsed: number;
}

export interface Evidence {
  id: string;
  missionId: string;
  title: string;
  url: string;
  excerpt: string;
  createdAt: number;
}

export interface TaskPayload {
  kind: "task.create";
  workspaceId: string;
  unassigned: true;
  title: string;
  description: string;
  evidence: Array<{ id: string; url: string }>;
}

export interface Proposal {
  id: string;
  missionId: string;
  status: ProposalStatus;
  payload: TaskPayload;
  payloadHash: string;
  constitutionVersion: string;
  contractVersion: string;
  authorityEpoch: number;
  createdAt: number;
  approvedAt: number | null;
  approvedBy: string | null;
  approvalHash: string | null;
}

export type ExecutionStatus =
  | "CLAIMED"
  | "ACKNOWLEDGED"
  | "VERIFIED"
  | "UNKNOWN";

export interface Execution {
  id: string;
  proposalId: string;
  missionId: string;
  status: ExecutionStatus;
  serviceSubject: string;
  providerId: string | null;
  providerUrl: string | null;
  observedTitle: string | null;
  observedDescription: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PactEvent {
  id: number;
  missionId: string;
  proposalId: string | null;
  type: string;
  reason: string | null;
  summary: Record<string, unknown>;
  at: number;
}

