import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  CONSTITUTION_VERSION,
  CONTRACT_VERSION,
  evaluateAdmission,
  type Mission,
} from "../core";
import { SqlitePactStore } from "../adapters/sqlite-store";
import { PactRuntimeService } from "./service";
import { VOICE_AI_BRIEF } from "./brief";
import { PactError } from "./errors";
import type {
  ProviderTask,
  SearchProvider,
  SearchResult,
  ServiceTokenVerifier,
  TaskProvider,
} from "./ports";

const directories: string[] = [];
const stores: SqlitePactStore[] = [];
afterEach(() => {
  while (stores.length) {
    try {
      stores.pop()!.close();
    } catch {
      // A persistence test may already have closed this handle before reopening.
    }
  }
  while (directories.length) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

class TestClock {
  value = 1_800_000_000_000;
  now = () => this.value;
}

class RecordingSearch implements SearchProvider {
  inputs: Parameters<SearchProvider["search"]>[0][] = [];
  fail = false;
  results: SearchResult[] = [
    {
      title: "Public provider source",
      url: "https://example.test/public-provider",
      excerpt: "Public material about voice interaction and documentation.",
    },
  ];
  async search(input: Parameters<SearchProvider["search"]>[0]) {
    this.inputs.push(input);
    if (this.fail) throw new Error("provider details must stay private");
    return this.results;
  }
}

class RecordingTasks implements TaskProvider {
  workspaceId = "workspace-verified";
  createCalls = 0;
  getCalls = 0;
  failAfterClaim = false;
  failReadback = false;
  waitAfterClaim: Promise<void> | null = null;
  task: ProviderTask | null = null;

  async identity() {
    return { id: "provider-user", workspaceId: this.workspaceId, name: "Demo workspace" };
  }
  async create(title: string, description: string, beforeWrite: () => Promise<void>) {
    await beforeWrite();
    this.createCalls++;
    if (this.waitAfterClaim) await this.waitAfterClaim;
    if (this.failAfterClaim) throw new Error("connection lost after send may have begun");
    this.task = {
      id: "11111111-1111-4111-8111-111111111111",
      title,
      description,
      url: "https://app.ambiguous.ai/task-returned-by-provider",
    };
    return this.task;
  }
  async get(id: string) {
    this.getCalls++;
    if (this.failReadback) throw new Error("read unavailable");
    assert.equal(id, this.task?.id);
    return this.task!;
  }
}

const verifier: ServiceTokenVerifier = {
  async verify() {
    return {
      subject: "fixture-client@clients",
      scopes: ["create:followups"],
      expiresAt: Date.now() + 60_000,
    };
  },
};

function harness(path?: string) {
  const directory = path ? null : mkdtempSync(join(tmpdir(), "pact-test-"));
  if (directory) directories.push(directory);
  const dbPath = path ?? join(directory!, "pact.sqlite");
  const clock = new TestClock();
  const search = new RecordingSearch();
  const tasks = new RecordingTasks();
  const store = new SqlitePactStore(dbPath);
  stores.push(store);
  const runtime = new PactRuntimeService(store, clock, search, tasks);
  return { dbPath, clock, search, tasks, store, runtime };
}

async function researchedProposal(h: ReturnType<typeof harness>) {
  const mission = await h.runtime.activateMission();
  const evidence = await h.runtime.searchPublic({
    missionId: mission.id,
    query: "voice interaction and clinical documentation providers France",
  });
  const proposal = h.runtime.createProposal({
    missionId: mission.id,
    title: "Compare provider capabilities for the France pilot",
    description:
      "Compare public evidence by category and document open integration questions without ranking vendors.",
    evidenceIds: evidence.map((item) => item.id),
  });
  return { mission, proposal };
}

function approve(h: ReturnType<typeof harness>, proposal: Awaited<ReturnType<typeof researchedProposal>>["proposal"]) {
  h.runtime.approveProposal({
    proposalId: proposal.id,
    displayedHash: proposal.payloadHash,
    constitutionVersion: proposal.constitutionVersion,
    contractVersion: proposal.contractVersion,
    operator: "local-operator:test",
  });
}

test("group 1: draft, exact-boundary expiry, and unknown capabilities are denied", () => {
  const active: Mission = {
    id: "mission",
    status: "ACTIVE",
    objective: "test",
    workspaceId: "workspace",
    workspaceName: "workspace",
    constitutionVersion: CONSTITUTION_VERSION,
    contractVersion: CONTRACT_VERSION,
    authorityEpoch: 1,
    activatedAt: 100,
    expiresAt: 200,
    searchLimit: 3,
    searchUsed: 0,
    writeLimit: 1,
    writeUsed: 0,
    runLimit: 25,
    runsUsed: 0,
  };
  assert.deepEqual(
    evaluateAdmission({ mission: { ...active, status: "DRAFT" }, capability: "search.public", now: 150 }),
    { outcome: "DENY", reason: "MISSION_NOT_ACTIVE" },
  );
  assert.deepEqual(
    evaluateAdmission({ mission: active, capability: "search.public", now: 200 }),
    { outcome: "DENY", reason: "MISSION_EXPIRED" },
  );
  assert.deepEqual(
    evaluateAdmission({ mission: active, capability: "unknown.write", now: 150 }),
    { outcome: "DENY", reason: "ACTION_MISMATCH" },
  );
});

test("group 2: search attempt four and a concurrent last-slot loser are denied", async () => {
  const h = harness();
  const mission = await h.runtime.activateMission();
  await h.runtime.searchPublic({ missionId: mission.id, query: "first public query" });
  await h.runtime.searchPublic({ missionId: mission.id, query: "second public query" });
  const outcomes = await Promise.allSettled([
    h.runtime.searchPublic({ missionId: mission.id, query: "third public query" }),
    h.runtime.searchPublic({ missionId: mission.id, query: "fourth public query" }),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = outcomes.find((item) => item.status === "rejected") as PromiseRejectedResult;
  assert.equal((rejected.reason as PactError).code, "QUOTA_EXCEEDED");
  assert.equal(h.search.inputs.length, 3);
  assert.equal(h.store.getMission(mission.id)?.searchUsed, 3);
});

test("group 3: missing or rejected approval invokes no task create", async () => {
  const h = harness();
  const first = await researchedProposal(h);
  await assert.rejects(
    h.runtime.executeAuthorized("token", first.proposal.id, verifier),
    (error) => error instanceof PactError && error.code === "APPROVAL_REQUIRED",
  );
  assert.equal(h.tasks.createCalls, 0);
  h.runtime.rejectProposal(first.proposal.id, "local-operator:test");
  await assert.rejects(
    h.runtime.executeAuthorized("token", first.proposal.id, verifier),
    (error) => error instanceof PactError && error.code === "APPROVAL_REJECTED",
  );
  assert.equal(h.tasks.createCalls, 0);
});

test("group 4: exact approval permits one write and verified receipt persists", async () => {
  const h = harness();
  const { proposal } = await researchedProposal(h);
  approve(h, proposal);
  const execution = await h.runtime.executeAuthorized("token", proposal.id, verifier);
  assert.equal(execution.status, "VERIFIED");
  assert.equal(execution.providerId, "11111111-1111-4111-8111-111111111111");
  assert.equal(h.tasks.createCalls, 1);
  h.store.close();
  const reopened = new SqlitePactStore(h.dbPath);
  assert.equal(reopened.getExecution(proposal.id)?.status, "VERIFIED");
  reopened.close();
});

test("group 5: changed hash, stale version, and wrong workspace cannot reuse authority", async () => {
  const h = harness();
  const { proposal } = await researchedProposal(h);
  assert.throws(
    () => h.runtime.approveProposal({
      proposalId: proposal.id,
      displayedHash: "0".repeat(64),
      constitutionVersion: proposal.constitutionVersion,
      contractVersion: proposal.contractVersion,
      operator: "local-operator:test",
    }),
    (error) => error instanceof PactError && error.code === "ACTION_MISMATCH",
  );
  assert.throws(
    () => h.runtime.approveProposal({
      proposalId: proposal.id,
      displayedHash: proposal.payloadHash,
      constitutionVersion: proposal.constitutionVersion,
      contractVersion: "stale-contract",
      operator: "local-operator:test",
    }),
    (error) => error instanceof PactError && error.code === "ACTION_MISMATCH",
  );
  approve(h, proposal);
  h.tasks.workspaceId = "another-workspace";
  await assert.rejects(
    h.runtime.executeAuthorized("token", proposal.id, verifier),
    (error) => error instanceof PactError && error.code === "SCOPE_MISMATCH",
  );
  assert.equal(h.tasks.createCalls, 0);
});

test("group 6: approve then revoke denies stale execution with the revoked reason", async () => {
  const h = harness();
  const { mission, proposal } = await researchedProposal(h);
  approve(h, proposal);
  h.runtime.revokeMission(mission.id);
  await assert.rejects(
    h.runtime.executeAuthorized("token", proposal.id, verifier),
    (error) => error instanceof PactError && error.code === "MISSION_REVOKED",
  );
  assert.equal(h.tasks.createCalls, 0);
  assert.equal(h.store.getMission(mission.id)?.writeUsed, 0);
});

test("group 7: duplicate concurrent execution calls provider once and consumes one slot", async () => {
  const h = harness();
  const { mission, proposal } = await researchedProposal(h);
  approve(h, proposal);
  let release!: () => void;
  h.tasks.waitAfterClaim = new Promise<void>((resolve) => { release = resolve; });
  const first = h.runtime.executeAuthorized("token", proposal.id, verifier);
  await new Promise((resolve) => setImmediate(resolve));
  const second = h.runtime.executeAuthorized("token", proposal.id, verifier);
  release();
  const settled = await Promise.allSettled([first, second]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 2);
  assert.equal(h.tasks.createCalls, 1);
  assert.equal(h.store.getMission(mission.id)?.writeUsed, 1);
});

test("group 9: private canary is absent from search/model projection and sanitized events", async () => {
  const h = harness();
  const mission = await h.runtime.activateMission();
  await h.runtime.searchPublic({ missionId: mission.id, query: "public voice providers" });
  const canary = VOICE_AI_BRIEF.private.internalContact;
  assert.doesNotMatch(JSON.stringify(h.search.inputs), new RegExp(canary));
  assert.doesNotMatch(JSON.stringify(h.runtime.snapshot(mission.id)), new RegExp(canary));
  assert.doesNotMatch(JSON.stringify(h.store.listEvents(mission.id)), new RegExp(canary));
});

test("group 10: unknown create outcome is never redispatched after store reopen", async () => {
  const h = harness();
  const { proposal } = await researchedProposal(h);
  approve(h, proposal);
  h.tasks.failAfterClaim = true;
  await assert.rejects(
    h.runtime.executeAuthorized("token", proposal.id, verifier),
    (error) => error instanceof PactError && error.code === "PROVIDER_OUTCOME_UNKNOWN",
  );
  assert.equal(h.tasks.createCalls, 1);
  assert.equal(h.store.getExecution(proposal.id)?.status, "UNKNOWN");
  h.store.close();
  const reopenedStore = new SqlitePactStore(h.dbPath);
  const reopenedTasks = new RecordingTasks();
  const reopened = new PactRuntimeService(reopenedStore, h.clock, h.search, reopenedTasks);
  const existing = await reopened.executeAuthorized("token", proposal.id, verifier);
  assert.equal(existing.status, "UNKNOWN");
  assert.equal(reopenedTasks.createCalls, 0);
  reopenedStore.close();
});

test("group 10: failed read-back retains acknowledgement and never causes redispatch", async () => {
  const h = harness();
  const { proposal } = await researchedProposal(h);
  approve(h, proposal);
  h.tasks.failReadback = true;
  const execution = await h.runtime.executeAuthorized("token", proposal.id, verifier);
  assert.equal(execution.status, "ACKNOWLEDGED");
  assert.equal(execution.errorCode, "READBACK_FAILED");
  const again = await h.runtime.executeAuthorized("token", proposal.id, verifier);
  assert.equal(again.status, "ACKNOWLEDGED");
  assert.equal(h.tasks.createCalls, 1);
});
