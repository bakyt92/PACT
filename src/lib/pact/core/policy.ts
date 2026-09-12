import type { Capability, Decision, Mission, Proposal } from "./types";

const KNOWN_CAPABILITIES = new Set<Capability>([
  "search.public",
  "task.propose",
  "task.create",
]);

function currentAuthority(mission: Mission, now: number): Decision | null {
  if (mission.status === "REVOKED") {
    return { outcome: "DENY", reason: "MISSION_REVOKED" };
  }
  if (mission.status !== "ACTIVE") {
    return { outcome: "DENY", reason: "MISSION_NOT_ACTIVE" };
  }
  if (mission.expiresAt === null || now >= mission.expiresAt) {
    return { outcome: "DENY", reason: "MISSION_EXPIRED" };
  }
  return null;
}

export function evaluateAdmission(input: {
  mission: Mission;
  capability: string;
  now: number;
  workspaceId?: string;
}): Decision {
  const authority = currentAuthority(input.mission, input.now);
  if (authority) return authority;
  if (!KNOWN_CAPABILITIES.has(input.capability as Capability)) {
    return { outcome: "DENY", reason: "ACTION_MISMATCH" };
  }
  if (
    input.workspaceId !== undefined &&
    input.workspaceId !== input.mission.workspaceId
  ) {
    return { outcome: "DENY", reason: "SCOPE_MISMATCH" };
  }
  if (
    input.capability === "search.public" &&
    input.mission.searchUsed >= input.mission.searchLimit
  ) {
    return { outcome: "DENY", reason: "QUOTA_EXCEEDED" };
  }
  if (
    input.capability === "task.create" &&
    input.mission.writeUsed >= input.mission.writeLimit
  ) {
    return { outcome: "DENY", reason: "QUOTA_EXCEEDED" };
  }
  return input.capability === "task.create"
    ? { outcome: "REQUIRE_APPROVAL", reason: "APPROVAL_REQUIRED" }
    : { outcome: "ALLOW" };
}

export function evaluateExecution(input: {
  mission: Mission;
  proposal: Proposal;
  now: number;
  workspaceId: string;
}): Decision {
  const authority = currentAuthority(input.mission, input.now);
  if (authority) return authority;
  if (
    input.workspaceId !== input.mission.workspaceId ||
    input.proposal.payload.workspaceId !== input.mission.workspaceId ||
    input.proposal.payload.unassigned !== true
  ) {
    return { outcome: "DENY", reason: "SCOPE_MISMATCH" };
  }
  if (
    input.proposal.constitutionVersion !== input.mission.constitutionVersion ||
    input.proposal.contractVersion !== input.mission.contractVersion ||
    input.proposal.authorityEpoch !== input.mission.authorityEpoch
  ) {
    return { outcome: "DENY", reason: "VERSION_MISMATCH" };
  }
  if (input.proposal.status === "REJECTED") {
    return { outcome: "DENY", reason: "APPROVAL_REJECTED" };
  }
  if (input.proposal.status !== "APPROVED") {
    if (
      input.proposal.status === "CLAIMED" ||
      input.proposal.status === "ACKNOWLEDGED" ||
      input.proposal.status === "VERIFIED" ||
      input.proposal.status === "UNKNOWN"
    ) {
      return { outcome: "DENY", reason: "ALREADY_CLAIMED" };
    }
    return { outcome: "DENY", reason: "APPROVAL_REQUIRED" };
  }
  if (
    !input.proposal.approvalHash ||
    input.proposal.approvalHash !== input.proposal.payloadHash
  ) {
    return { outcome: "DENY", reason: "ACTION_MISMATCH" };
  }
  if (input.mission.writeUsed >= input.mission.writeLimit) {
    return { outcome: "DENY", reason: "QUOTA_EXCEEDED" };
  }
  return { outcome: "ALLOW" };
}

