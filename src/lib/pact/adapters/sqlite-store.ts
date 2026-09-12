import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  CONSTITUTION_VERSION,
  CONTRACT_VERSION,
  evaluateAdmission,
  evaluateExecution,
  type Decision,
  type Evidence,
  type Execution,
  type Mission,
  type PactEvent,
  type Proposal,
  type TaskPayload,
} from "../core";
import type { ClaimResult, PactStore } from "../runtime/ports";

type Row = Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown): T => JSON.parse(String(value)) as T;

export class SqlitePactStore implements PactStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    const absolute = resolve(path);
    mkdirSync(dirname(absolute), { recursive: true });
    this.db = new DatabaseSync(absolute);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        objective TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        workspace_name TEXT NOT NULL,
        constitution_version TEXT NOT NULL,
        contract_version TEXT NOT NULL,
        authority_epoch INTEGER NOT NULL,
        activated_at INTEGER,
        expires_at INTEGER,
        search_limit INTEGER NOT NULL,
        search_used INTEGER NOT NULL,
        write_limit INTEGER NOT NULL,
        write_used INTEGER NOT NULL,
        run_limit INTEGER NOT NULL,
        runs_used INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL REFERENCES missions(id),
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS evidence_mission_idx ON evidence(mission_id, created_at);
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL REFERENCES missions(id),
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        constitution_version TEXT NOT NULL,
        contract_version TEXT NOT NULL,
        authority_epoch INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        approved_by TEXT,
        approval_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS proposal_mission_idx ON proposals(mission_id, created_at);
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
        mission_id TEXT NOT NULL REFERENCES missions(id),
        status TEXT NOT NULL,
        service_subject TEXT NOT NULL,
        provider_id TEXT,
        provider_url TEXT,
        observed_title TEXT,
        observed_description TEXT,
        error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL REFERENCES missions(id),
        proposal_id TEXT,
        type TEXT NOT NULL,
        reason TEXT,
        summary_json TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS event_mission_idx ON events(mission_id, id);
    `);
  }

  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private mission(row: Row | undefined): Mission | null {
    if (!row) return null;
    return {
      id: String(row.id),
      status: row.status as Mission["status"],
      objective: String(row.objective),
      workspaceId: String(row.workspace_id),
      workspaceName: String(row.workspace_name),
      constitutionVersion: String(row.constitution_version),
      contractVersion: String(row.contract_version),
      authorityEpoch: Number(row.authority_epoch),
      activatedAt: row.activated_at === null ? null : Number(row.activated_at),
      expiresAt: row.expires_at === null ? null : Number(row.expires_at),
      searchLimit: Number(row.search_limit),
      searchUsed: Number(row.search_used),
      writeLimit: Number(row.write_limit),
      writeUsed: Number(row.write_used),
      runLimit: Number(row.run_limit),
      runsUsed: Number(row.runs_used),
    };
  }

  private proposal(row: Row | undefined): Proposal | null {
    if (!row) return null;
    return {
      id: String(row.id),
      missionId: String(row.mission_id),
      status: row.status as Proposal["status"],
      payload: parseJson<TaskPayload>(row.payload_json),
      payloadHash: String(row.payload_hash),
      constitutionVersion: String(row.constitution_version),
      contractVersion: String(row.contract_version),
      authorityEpoch: Number(row.authority_epoch),
      createdAt: Number(row.created_at),
      approvedAt: row.approved_at === null ? null : Number(row.approved_at),
      approvedBy: row.approved_by === null ? null : String(row.approved_by),
      approvalHash: row.approval_hash === null ? null : String(row.approval_hash),
    };
  }

  private execution(row: Row | undefined): Execution | null {
    if (!row) return null;
    return {
      id: String(row.id),
      proposalId: String(row.proposal_id),
      missionId: String(row.mission_id),
      status: row.status as Execution["status"],
      serviceSubject: String(row.service_subject),
      providerId: row.provider_id === null ? null : String(row.provider_id),
      providerUrl: row.provider_url === null ? null : String(row.provider_url),
      observedTitle:
        row.observed_title === null ? null : String(row.observed_title),
      observedDescription:
        row.observed_description === null
          ? null
          : String(row.observed_description),
      errorCode: row.error_code === null ? null : String(row.error_code),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  private addEvent(input: {
    missionId: string;
    proposalId?: string | null;
    type: string;
    reason?: string | null;
    summary?: Record<string, unknown>;
    at: number;
  }) {
    this.db
      .prepare(
        "INSERT INTO events (mission_id, proposal_id, type, reason, summary_json, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.missionId,
        input.proposalId ?? null,
        input.type,
        input.reason ?? null,
        json(input.summary ?? {}),
        input.at,
      );
  }

  activateMission(input: {
    id: string;
    workspaceId: string;
    workspaceName: string;
    now: number;
    lifetimeMs?: number;
  }): Mission {
    const lifetime = input.lifetimeMs ?? 30 * 60_000;
    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO missions
           (id,status,objective,workspace_id,workspace_name,constitution_version,contract_version,
            authority_epoch,activated_at,expires_at,search_limit,search_used,write_limit,write_used,
            run_limit,runs_used,created_at)
           VALUES (?, 'ACTIVE', ?, ?, ?, ?, ?, 1, ?, ?, 3, 0, 1, 0, 25, 0, ?)`,
        )
        .run(
          input.id,
          "evidence-backed follow-up for Voice AI Pilot — France",
          input.workspaceId,
          input.workspaceName,
          CONSTITUTION_VERSION,
          CONTRACT_VERSION,
          input.now,
          input.now + lifetime,
          input.now,
        );
      this.addEvent({
        missionId: input.id,
        type: "MISSION_ACTIVATED",
        summary: {
          workspaceId: input.workspaceId,
          scope: "workspace-only",
          assignment: "unassigned",
        },
        at: input.now,
      });
      return this.getMission(input.id)!;
    });
  }

  getMission(id: string): Mission | null {
    return this.mission(
      this.db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as
        | Row
        | undefined,
    );
  }

  latestMission(): Mission | null {
    return this.mission(
      this.db
        .prepare("SELECT * FROM missions ORDER BY created_at DESC, rowid DESC LIMIT 1")
        .get() as Row | undefined,
    );
  }

  revokeMission(id: string, now: number): Mission {
    return this.transaction(() => {
      const mission = this.getMission(id);
      if (!mission) throw new Error("MISSION_NOT_FOUND");
      if (mission.status === "ACTIVE") {
        this.db
          .prepare(
            "UPDATE missions SET status='REVOKED', authority_epoch=authority_epoch+1 WHERE id=?",
          )
          .run(id);
        this.addEvent({ missionId: id, type: "MISSION_REVOKED", at: now });
      }
      return this.getMission(id)!;
    });
  }

  reserveSearchAttempt(id: string, now: number): Decision {
    return this.transaction(() => {
      const mission = this.getMission(id);
      if (!mission)
        return { outcome: "DENY", reason: "MISSION_NOT_ACTIVE" } as Decision;
      const decision = evaluateAdmission({
        mission,
        capability: "search.public",
        now,
      });
      if (decision.outcome === "ALLOW") {
        this.db
          .prepare("UPDATE missions SET search_used=search_used+1 WHERE id=?")
          .run(id);
        this.addEvent({
          missionId: id,
          type: "SEARCH_ADMITTED",
          summary: { attempt: mission.searchUsed + 1 },
          at: now,
        });
      } else {
        this.addEvent({
          missionId: id,
          type: "SEARCH_DENIED",
          reason: decision.reason,
          at: now,
        });
      }
      return decision;
    });
  }

  reserveAgentRun(id: string, now: number): Decision {
    return this.transaction(() => {
      const mission = this.getMission(id);
      if (!mission)
        return { outcome: "DENY", reason: "MISSION_NOT_ACTIVE" } as Decision;
      const authority = evaluateAdmission({
        mission,
        capability: "task.propose",
        now,
      });
      const decision: Decision =
        authority.outcome === "ALLOW" && mission.runsUsed >= mission.runLimit
          ? { outcome: "DENY", reason: "QUOTA_EXCEEDED" }
          : authority;
      if (decision.outcome === "ALLOW") {
        this.db
          .prepare("UPDATE missions SET runs_used=runs_used+1 WHERE id=?")
          .run(id);
        this.addEvent({ missionId: id, type: "AGENT_RUN_ADMITTED", at: now });
      }
      return decision;
    });
  }

  saveEvidence(items: Evidence[]) {
    if (!items.length) return;
    this.transaction(() => {
      const statement = this.db.prepare(
        "INSERT INTO evidence (id,mission_id,title,url,excerpt,created_at) VALUES (?,?,?,?,?,?)",
      );
      for (const item of items) {
        statement.run(
          item.id,
          item.missionId,
          item.title,
          item.url,
          item.excerpt,
          item.createdAt,
        );
      }
      this.addEvent({
        missionId: items[0].missionId,
        type: "EVIDENCE_STORED",
        summary: { evidenceIds: items.map((item) => item.id) },
        at: items[0].createdAt,
      });
    });
  }

  listEvidence(missionId: string): Evidence[] {
    return (
      this.db
        .prepare("SELECT * FROM evidence WHERE mission_id=? ORDER BY created_at,id")
        .all(missionId) as unknown as Row[]
    ).map((row) => ({
      id: String(row.id),
      missionId: String(row.mission_id),
      title: String(row.title),
      url: String(row.url),
      excerpt: String(row.excerpt),
      createdAt: Number(row.created_at),
    }));
  }

  insertProposal(proposal: Proposal): Proposal {
    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO proposals
           (id,mission_id,status,payload_json,payload_hash,constitution_version,contract_version,
            authority_epoch,created_at,approved_at,approved_by,approval_hash)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          proposal.id,
          proposal.missionId,
          proposal.status,
          json(proposal.payload),
          proposal.payloadHash,
          proposal.constitutionVersion,
          proposal.contractVersion,
          proposal.authorityEpoch,
          proposal.createdAt,
          null,
          null,
          null,
        );
      this.addEvent({
        missionId: proposal.missionId,
        proposalId: proposal.id,
        type: "PROPOSAL_CREATED",
        summary: { title: proposal.payload.title, evidenceIds: proposal.payload.evidence.map((e) => e.id) },
        at: proposal.createdAt,
      });
      return proposal;
    });
  }

  getProposal(id: string): Proposal | null {
    return this.proposal(
      this.db.prepare("SELECT * FROM proposals WHERE id=?").get(id) as
        | Row
        | undefined,
    );
  }

  latestProposal(missionId: string): Proposal | null {
    return this.proposal(
      this.db
        .prepare(
          "SELECT * FROM proposals WHERE mission_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
        )
        .get(missionId) as Row | undefined,
    );
  }

  approveProposal(input: {
    proposalId: string;
    displayedHash: string;
    constitutionVersion: string;
    contractVersion: string;
    operator: string;
    now: number;
  }): Decision {
    return this.transaction(() => {
      const proposal = this.getProposal(input.proposalId);
      if (!proposal)
        return { outcome: "DENY", reason: "ACTION_MISMATCH" } as Decision;
      const mission = this.getMission(proposal.missionId)!;
      const authority = evaluateAdmission({
        mission,
        capability: "task.propose",
        now: input.now,
        workspaceId: proposal.payload.workspaceId,
      });
      let decision: Decision = authority;
      if (decision.outcome === "ALLOW") {
        if (
          proposal.payloadHash !== input.displayedHash ||
          proposal.constitutionVersion !== input.constitutionVersion ||
          proposal.contractVersion !== input.contractVersion
        ) {
          decision = { outcome: "DENY", reason: "ACTION_MISMATCH" };
        } else if (
          proposal.authorityEpoch !== mission.authorityEpoch ||
          proposal.constitutionVersion !== mission.constitutionVersion ||
          proposal.contractVersion !== mission.contractVersion
        ) {
          decision = { outcome: "DENY", reason: "VERSION_MISMATCH" };
        } else if (proposal.status !== "PROPOSED") {
          decision = {
            outcome: "DENY",
            reason:
              proposal.status === "REJECTED"
                ? "APPROVAL_REJECTED"
                : proposal.status === "APPROVED"
                  ? "ALREADY_CLAIMED"
                  : "APPROVAL_REQUIRED",
          };
        }
      }
      if (decision.outcome === "ALLOW") {
        this.db
          .prepare(
            "UPDATE proposals SET status='APPROVED',approved_at=?,approved_by=?,approval_hash=payload_hash WHERE id=?",
          )
          .run(input.now, input.operator, proposal.id);
        this.addEvent({
          missionId: proposal.missionId,
          proposalId: proposal.id,
          type: "HUMAN_APPROVED",
          summary: { operator: input.operator },
          at: input.now,
        });
      } else {
        this.addEvent({
          missionId: proposal.missionId,
          proposalId: proposal.id,
          type: "APPROVAL_DENIED",
          reason: decision.reason,
          at: input.now,
        });
      }
      return decision;
    });
  }

  rejectProposal(id: string, operator: string, now: number): Decision {
    return this.transaction(() => {
      const proposal = this.getProposal(id);
      if (!proposal)
        return { outcome: "DENY", reason: "ACTION_MISMATCH" } as Decision;
      if (proposal.status !== "PROPOSED")
        return { outcome: "DENY", reason: "ALREADY_CLAIMED" } as Decision;
      this.db.prepare("UPDATE proposals SET status='REJECTED' WHERE id=?").run(id);
      this.addEvent({
        missionId: proposal.missionId,
        proposalId: id,
        type: "HUMAN_REJECTED",
        summary: { operator },
        at: now,
      });
      return { outcome: "ALLOW" };
    });
  }

  claimExecution(input: {
    proposalId: string;
    workspaceId: string;
    serviceSubject: string;
    now: number;
  }): ClaimResult {
    return this.transaction(() => {
      const proposal = this.getProposal(input.proposalId);
      if (!proposal)
        return {
          decision: { outcome: "DENY", reason: "ACTION_MISMATCH" },
          execution: null,
        };
      const mission = this.getMission(proposal.missionId)!;
      const decision = evaluateExecution({
        mission,
        proposal,
        now: input.now,
        workspaceId: input.workspaceId,
      });
      if (decision.outcome !== "ALLOW") {
        this.addEvent({
          missionId: mission.id,
          proposalId: proposal.id,
          type: "DISPATCH_DENIED",
          reason: decision.reason,
          at: input.now,
        });
        return { decision, execution: this.getExecution(proposal.id) };
      }
      const execution: Execution = {
        id: randomUUID(),
        proposalId: proposal.id,
        missionId: mission.id,
        status: "CLAIMED",
        serviceSubject: input.serviceSubject,
        providerId: null,
        providerUrl: null,
        observedTitle: null,
        observedDescription: null,
        errorCode: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      this.db
        .prepare(
          `INSERT INTO executions
           (id,proposal_id,mission_id,status,service_subject,provider_id,provider_url,
            observed_title,observed_description,error_code,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          execution.id,
          execution.proposalId,
          execution.missionId,
          execution.status,
          execution.serviceSubject,
          null,
          null,
          null,
          null,
          null,
          execution.createdAt,
          execution.updatedAt,
        );
      this.db
        .prepare("UPDATE proposals SET status='CLAIMED' WHERE id=?")
        .run(proposal.id);
      this.db
        .prepare("UPDATE missions SET write_used=write_used+1 WHERE id=?")
        .run(mission.id);
      this.addEvent({
        missionId: mission.id,
        proposalId: proposal.id,
        type: "DISPATCH_CLAIMED",
        summary: { serviceSubject: input.serviceSubject },
        at: input.now,
      });
      return { decision, execution };
    });
  }

  updateExecution(input: {
    proposalId: string;
    status: Execution["status"];
    now: number;
    providerId?: string | null;
    providerUrl?: string | null;
    observedTitle?: string | null;
    observedDescription?: string | null;
    errorCode?: string | null;
  }): Execution {
    return this.transaction(() => {
      const current = this.getExecution(input.proposalId);
      if (!current) throw new Error("EXECUTION_NOT_FOUND");
      const next = {
        providerId: input.providerId ?? current.providerId,
        providerUrl: input.providerUrl ?? current.providerUrl,
        observedTitle: input.observedTitle ?? current.observedTitle,
        observedDescription:
          input.observedDescription ?? current.observedDescription,
        errorCode: input.errorCode ?? current.errorCode,
      };
      this.db
        .prepare(
          `UPDATE executions SET status=?,provider_id=?,provider_url=?,observed_title=?,
           observed_description=?,error_code=?,updated_at=? WHERE proposal_id=?`,
        )
        .run(
          input.status,
          next.providerId,
          next.providerUrl,
          next.observedTitle,
          next.observedDescription,
          next.errorCode,
          input.now,
          input.proposalId,
        );
      this.db
        .prepare("UPDATE proposals SET status=? WHERE id=?")
        .run(input.status, input.proposalId);
      this.addEvent({
        missionId: current.missionId,
        proposalId: input.proposalId,
        type: `EXECUTION_${input.status}`,
        reason: next.errorCode,
        summary: next.providerId ? { providerId: next.providerId } : {},
        at: input.now,
      });
      return this.getExecution(input.proposalId)!;
    });
  }

  getExecution(proposalId: string): Execution | null {
    return this.execution(
      this.db.prepare("SELECT * FROM executions WHERE proposal_id=?").get(
        proposalId,
      ) as Row | undefined,
    );
  }

  appendEvent(input: {
    missionId: string;
    proposalId?: string | null;
    type: string;
    reason?: string | null;
    summary?: Record<string, unknown>;
    at: number;
  }) {
    this.transaction(() => this.addEvent(input));
  }

  listEvents(missionId: string): PactEvent[] {
    return (
      this.db
        .prepare("SELECT * FROM events WHERE mission_id=? ORDER BY id")
        .all(missionId) as unknown as Row[]
    ).map((row) => ({
      id: Number(row.id),
      missionId: String(row.mission_id),
      proposalId: row.proposal_id === null ? null : String(row.proposal_id),
      type: String(row.type),
      reason: row.reason === null ? null : String(row.reason),
      summary: parseJson<Record<string, unknown>>(row.summary_json),
      at: Number(row.at),
    }));
  }

  close() {
    this.db.close();
  }
}
