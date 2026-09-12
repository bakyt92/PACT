export class PactError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "PactError";
  }
}

export function denialMessage(reason: string): string {
  const messages: Record<string, string> = {
    MISSION_NOT_ACTIVE: "Activate a fresh mission before using agent tools.",
    MISSION_REVOKED: "Mission authority was revoked. No external write was sent.",
    MISSION_EXPIRED: "Mission authority expired. Activate a fresh mission.",
    QUOTA_EXCEEDED: "The mission quota has been exhausted.",
    APPROVAL_REQUIRED: "Approve the exact stored proposal before execution.",
    APPROVAL_REJECTED: "The proposal was rejected and cannot execute.",
    ACTION_MISMATCH: "The request does not match the stored approved action.",
    SCOPE_MISMATCH: "The workspace or assignment is outside mission scope.",
    VERSION_MISMATCH: "The approval belongs to stale authority or policy versions.",
    ALREADY_CLAIMED: "This proposal already has a non-retryable execution claim.",
    RUN_ALREADY_ACTIVE: "Another agent run is already active for this mission.",
  };
  return messages[reason] ?? "PACT denied the request.";
}

