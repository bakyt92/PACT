# PACT MVP Design

## Problem

AI agents can produce useful work while still having more authority than the user intended to grant. A prompt such as “work only in this project” is not an execution boundary when the model can call an unrestricted write tool, and a browser value such as `approved: true` does not identify what the user approved.

PACT will provide a small, inspectable authorization runtime for one real workflow. The agent will prepare a follow-up task from a selected Ambiguous task. PACT will constrain the mission, show the exact proposed task, require human approval, re-check the mission immediately before dispatch, and return the external task receipt. Revoking the mission while a proposal is waiting must prevent that proposal from creating a task.

## Goals

The first implementation must:

1. Keep policy evaluation independent from the UI, model provider, and Ambiguous API.
2. Represent Constitution, Mission Contract, Action Proposal, Approval, Execution, and Audit Event as explicit domain objects.
3. Filter closed source fields before any model request is built.
4. Allow only the supported `create_task` action in the selected project and for the selected assignee.
5. Require an approval bound to the exact stored proposal, contract version, and Constitution version.
6. Revalidate all authorization conditions after approval and before calling Ambiguous.
7. Make revocation, expiry, rejection, exhausted write limits, and repeated approval observable and testable.
8. Use a real Ambiguous adapter behind a narrow port, with a deterministic local adapter for tests.
9. Expose the event trail and decision reasons in a single working page.
10. Leave a stable core interface for future CRM, messaging, calendar, and voice adapters.

## Non-goals

The MVP will not implement payments, travel booking, Slack/Discord/Telegram workflows, voice input, arbitrary HTTP or shell tools, generated code execution, generalized policy-language parsing, immutable administrator-proof audit storage, or a hard monetary budget. Token and request limits may be added only when they are enforced by the request path.

Auth0 is optional. If used, it will authenticate the API caller and validate the required scope; it will not be treated as the mission authorization engine or as proof of which local operator clicked a button.

## Recommended approach

Use a small TypeScript Next.js application with one server and one page. This matches the React-oriented CopilotKit integration while keeping PACT’s critical path on the server. The domain and application layers will be pure TypeScript modules that can be tested without a browser, OpenAI key, or Ambiguous credentials.

There are three possible implementation shapes:

| Approach | Advantage | Cost |
| --- | --- | --- |
| Full-stack Next.js monolith | Fastest route to one demo page, server routes, and CopilotKit context | Requires discipline to keep domain code separate from framework code |
| Separate API and React clients | Clean deployment boundary and independent clients | More setup and two processes for a two-hour MVP |
| Directly fork the external starter | May provide ready-made agent and approval wiring | The starter is outside this repository and its assumptions could hide the new PACT enforcement boundary |

The full-stack monolith is the recommendation. It keeps the implementation small, while ports and pure domain functions preserve the boundary that later extraction would need.

## System architecture

```text
CopilotKit / page context
          |
          v
  Context projection service ----> OpenAI proposal service
          |                                  |
          +--------------------------> ActionProposal
                                             |
                                             v
                                      PACT policy engine
                                             |
                                  human approves proposalId
                                             |
                                             v
                              revalidate + idempotent dispatch
                                             |
                                             v
                                  Ambiguous task adapter
                                             |
                                             v
                                 external receipt + audit event
```

The model may suggest an action, but it will not receive a raw Ambiguous write function. The only write path will accept a stored proposal ID, load the server-side proposal, evaluate it against the current mission and policy versions, reserve the mission’s remaining write capacity, and call the adapter.

The initial source layout will be organized by responsibility:

```text
src/
  domain/          policy rules, contracts, proposals, state transitions
  application/     use cases and ports
  infrastructure/  repositories, SQLite store, OpenAI and Ambiguous adapters
  app/api/          thin HTTP route handlers
  components/      page, proposal card, PACT panel, event history
tests/
  domain/          deterministic authorization and state tests
  application/     use-case tests with in-process ports
```

The exact framework file names can follow the selected Next.js routing convention, but route handlers must remain adapters around application services. They must not contain policy logic.

## Domain model

### Constitution

The Constitution is a versioned system policy. The first version has explicit rules for:

- no agent self-expansion of authority;
- no writes outside the mission project;
- no use of closed source fields;
- human approval before every external write;
- no action after mission expiry or revocation;
- no provider dispatch after a denied decision.

It is represented as structured data and evaluated by code. A display string may explain the same rules, but the string is not executable policy.

### Mission Contract

A Mission Contract binds a mission to a workspace, source task, target project, allowed assignee, allowed action set, write limit, expiry timestamp, and the active Constitution version. The MVP allows:

```text
action: read_source_projection | propose_create_task | create_task
projectId: one real Ambiguous project ID
assigneeId: one real Ambiguous user ID
maxExternalWrites: 2
requiresHumanApproval: true
expiresAt: now + 10 minutes
```

All IDs are resolved from the connected workspace during mission creation. A contract with unsupported restrictions must be rejected instead of silently accepting fields that no service enforces.

### Action Proposal

An Action Proposal is immutable after creation. It stores the exact action arguments that will be shown to the user, the mission and policy versions used to evaluate it, its expiry, and its lifecycle status. If the content changes, the service creates a new proposal ID and requires a new approval.

The first supported action is:

```typescript
type CreateTaskAction = {
  kind: 'create_task';
  workspaceId: string;
  projectId: string;
  parentTaskId?: string;
  assigneeId: string;
  title: string;
  description: string;
  dueDate?: string;
};
```

The action schema validates shape and types. The policy engine separately validates authority and resource scope.

### Approval and Execution

An Approval records the operator identity available in the current authentication profile, the proposal ID, the proposal fingerprint, the mission ID, and the time of approval. The execute use case accepts only the proposal ID; it obtains the rest from the repository.

An Execution has a unique ID and proposal ID. A unique constraint or equivalent compare-and-set operation prevents a second dispatch for the same proposal. Its states are:

```text
approved → dispatching → sent → confirmed
                         └→ unknown_result
```

The proposal can also become `rejected`, `denied`, `expired`, or `revoked` before dispatch.

### Audit Event

Audit events record the event type, mission ID, proposal ID when available, actor or service identity, timestamp, decision reason, policy versions, and a safe summary of the resource. Secrets and closed source fields must not be written to the event payload.

## Authorization and execution flow

### 1. Create mission

The server resolves the selected workspace, project, source task, and assignee. It validates that the requested contract contains only supported actions and limits, then stores the mission with `active` status and an expiry timestamp.

### 2. Build model context

The context projection service reads the selected source task and returns only an allowlisted projection. Closed fields are removed before serialization. The resulting projection is the only task data supplied to OpenAI or exposed through an agent read tool. A test-visible context record lets the demo prove that a closed field was absent.

### 3. Generate proposal

The OpenAI service receives the filtered projection and a strict output schema for `CreateTaskAction`. The application validates the returned action, attaches the active mission and policy versions, evaluates it, and persists the proposal. The model response cannot directly dispatch a write.

### 4. Present exact proposal

The UI renders project, assignee, due date, title, description, destination, and remaining mission capacity from the stored proposal. It does not construct a second set of arguments for approval.

### 5. Approve and dispatch

The browser posts `{ proposalId }`. The server loads the stored proposal and runs one authorization transaction that checks:

- mission exists, is active, and has not expired or been revoked;
- Constitution and Contract versions are still current;
- action kind is allowed;
- workspace, project, source task, and assignee match the contract;
- the proposal is awaiting approval;
- the write limit still has capacity;
- no execution already exists for the proposal.

If any check fails, the service records a denied event and returns a stable reason without calling the adapter. If all checks pass, it marks the proposal as dispatching and reserves one write before invoking Ambiguous.

### 6. Record receipt

On a successful adapter response, the service stores the external task ID, marks the execution confirmed, decrements the available capacity, and records the receipt. On a timeout after dispatch, it records `unknown_result` and does not retry automatically. The UI uses “result unknown” rather than claiming the operation failed.

## Application ports

The application layer will depend on interfaces similar to these:

```typescript
interface MissionRepository {
  get(id: string): Promise<Mission | null>;
  save(mission: Mission): Promise<void>;
  updateIfVersion(id: string, version: number, next: Mission): Promise<boolean>;
}

interface ProposalRepository {
  get(id: string): Promise<ActionProposal | null>;
  save(proposal: ActionProposal): Promise<void>;
  claimForDispatch(id: string, expectedStatus: 'approved'): Promise<boolean>;
}

interface TaskAdapter {
  createTask(action: CreateTaskAction, idempotencyKey: string): Promise<ExternalTaskReceipt>;
}

interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listForMission(missionId: string): Promise<AuditEvent[]>;
}
```

The real Ambiguous adapter will implement `TaskAdapter`. Tests will use a recording adapter that makes it possible to assert that denied actions never reach an external write boundary.

## Persistence

Use a local SQLite database for missions, proposals, executions, and audit events. The repository interfaces keep storage replaceable for a hosted deployment. The schema must enforce proposal and execution IDs as unique values and must store proposal arguments and fingerprints so approval never depends on mutable browser state.

The MVP uses sequential dispatch in one local server process. A later multi-instance deployment must replace local atomic operations with database transactions or another shared coordination mechanism. Local SQLite or a container filesystem must not be presented as durable storage for a Cloud Run deployment.

## API surface

The initial API should be small:

```text
POST /api/missions
POST /api/missions/:id/revoke
POST /api/proposals
POST /api/proposals/:id/approve
POST /api/proposals/:id/reject
GET  /api/missions/:id/events
GET  /api/external/tasks/:id
```

Approval and rejection endpoints accept the proposal ID in the URL or body, but never accept authoritative action arguments from the client. The approval response includes the decision, reason, proposal status, and execution or external receipt when available.

## UI behavior

The first page has four visible areas:

1. Source context: selected project and task, with a visible indicator for filtered fields.
2. Proposal card: exact action content, decision reason, approval and rejection controls.
3. PACT panel: Constitution version, active contract, project scope, expiry, write capacity, and revoke control.
4. Event history: context filtered, proposal created, policy decision, approval, dispatch, and receipt.

The UI must distinguish `proposed`, `awaiting approval`, `dispatching`, `sent`, `confirmed`, and `unknown result`. A revoked mission must leave the stale proposal visible with a clear blocked reason so the negative demo can be understood.

## Error handling

Authorization failures return a stable machine-readable code and a human-readable reason. Examples include:

```text
MISSION_REVOKED
MISSION_EXPIRED
CONTRACT_VERSION_STALE
PROJECT_OUTSIDE_SCOPE
ASSIGNEE_OUTSIDE_SCOPE
WRITE_LIMIT_EXCEEDED
PROPOSAL_ALREADY_EXECUTED
PROPOSAL_ARGUMENTS_CHANGED
```

The API must not call OpenAI or Ambiguous after a policy decision has denied an action. Adapter failures are recorded with a safe error class. A network timeout after a request may have reached Ambiguous must become `unknown_result`; automatic duplicate creation is forbidden.

## Testing strategy

Tests will be written before the corresponding implementation and will focus on behavior at the enforcement boundary.

Unit tests cover pure policy decisions for allowed project, wrong project, wrong assignee, revoked mission, expired mission, stale policy version, exhausted write limit, and closed-field projection.

Application tests use an in-process repository and recording task adapter to prove:

- allowed approval dispatches once;
- rejection never calls the adapter;
- wrong-project proposals are denied before the adapter;
- changing proposal content produces a different fingerprint and invalidates the old approval;
- revocation blocks an existing waiting proposal;
- repeated approval cannot create a second execution;
- an adapter timeout produces `unknown_result` without an automatic retry.

One integration check will exercise the HTTP approval route with a stored proposal and assert that the route ignores client-supplied replacement arguments. A real Ambiguous smoke test will be run only when credentials and a workspace are available; it will create one synthetic task and read it back by ID.

## Security boundary and claims

The supported guarantee is:

> All supported external writes in this integration pass through PACT, and a denied action is not dispatched to the execution adapter.

The implementation does not claim to secure arbitrary tools, a compromised server, compromised dependencies, or future adapters that bypass the PACT application service. The demo should use synthetic data and show the exact allowed context projection sent to the model.

## Delivery sequence

The work on `bakyt1` will proceed in this order:

1. Create the TypeScript project and test runner.
2. Implement domain types, fingerprints, lifecycle transitions, and pure policy evaluation under tests.
3. Implement repositories and the application services for mission creation, proposal creation, approval, rejection, and revocation.
4. Add SQLite persistence and the recording adapter.
5. Add the Ambiguous adapter and environment configuration without exposing credentials to the client.
6. Add OpenAI context projection and structured proposal generation.
7. Add the CopilotKit-compatible page and PACT panel.
8. Run deterministic tests, HTTP checks, and the optional Ambiguous smoke test.

Each stage should leave the branch in a runnable state and should be committed separately where the change has a meaningful test boundary.
