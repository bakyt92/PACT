# PACT

> Give agents objectives. Not unlimited authority.

PACT is a constitutional runtime behind a workspace-connected AI coworker. For
the **Voice AI Pilot — France** demo, the coworker researches public providers,
prepares one evidence-backed Ambiguous task, and waits for a person to approve
the exact stored action. A separate Execute click rechecks current authority,
verifies an Auth0 service identity, atomically claims the write, and only then
calls Ambiguous.

The selected brief makes the research relevant; the connected workspace makes
the result useful and persistent. The page is connected to Ambiguous—it is not
presented as embedded inside Ambiguous.

## Current integration status

Observed locally on 12 September 2026:

| Integration | Status | Evidence |
| --- | --- | --- |
| OpenAI | VERIFIED | A bounded `gpt-4.1-mini` probe and a CopilotKit streamed agent run completed. No `MODEL`/`OPENAI_MODEL` value is currently configured, so this documented default was used. |
| Exa | VERIFIED | Bounded probe and PACT-admitted search returned stored source evidence. |
| CopilotKit | VERIFIED | Runtime `/info` reported streaming/client tools; an AG-UI run completed and produced the proposal tool call. Managed Intelligence is not used or required. |
| Ambiguous | VERIFIED (read/schema) | Live identity is bound to workspace `bd04a7fc-13b9-4eda-87a6-52cc9307cd72`; `auth_whoami`, `create_task`, and `get_task` schemas were observed. No task was written during verification. |
| Auth0 | VERIFIED | A real client-credentials token was minted and verified (audience `https://pact.demo/api`, `create:followups` scope, executor subject `…@clients`). Live Execute created Ambiguous task `385ab713-080d-47d8-9ffc-b86483575099` and read it back by the same ID (execution `VERIFIED`). |

The offline test suite additionally verifies the complete Auth0/PACT/Ambiguous
boundary with locally signed test JWTs and provider doubles, independent of any
live tenant. The live path above was exercised through the ordinary UI on
12 September 2026.

## Install and run

Requirements: Node.js 22.13 or newer and npm. Node 22.19 is the verified local
runtime. The application is one Next.js package; it does not create workspace
packages or a second service.

```bash
npm install
copy .env.example .env
npm run preflight
npm run dev
```

Open <http://127.0.0.1:3100>. Use that exact origin: credential-backed mutation
routes compare it against the configured trusted origin and the server binds to
loopback.

The checked-in `.env.example` contains placeholders only. Local scripts
explicitly load the repository-root `.env` with Node's `--env-file-if-exists`;
already-set process variables take precedence. The app also recognizes the
owners' existing server-only aliases `AMBIGUOS_KEY` and `COPILOT_KEY`, but new
configuration should use the names in `.env.example`. The CopilotKit web
integration runs in model-only mode and does not turn `COPILOT_KEY` into a
browser-public credential.

Auth0 must provide an RS256 API with audience `https://pact.demo/api` and grant
the exact `create:followups` permission to the configured M2M client. Execute
expects the verified client-credentials subject for that client. Tokens and all
provider keys stay server-side.

## Verify

```bash
npm run preflight       # bounded live reads/model/search; never writes
npm run typecheck
npm test                # ten compact offline behavior groups
npm run build
npm run secrets:check   # redacted high-confidence scan, including local history
```

`npm run verify` runs typecheck plus all offline tests. The tests use isolated
SQLite files, an injected clock, recording adapters, and local RS256 JWTs—no
paid calls. Node currently labels `node:sqlite` experimental even though it no
longer needs an experimental flag; the installed runtime and production Next
route both build successfully.

## Demo flow

1. Click **Activate mission**. PACT binds the immutable 30-minute contract to
   the provider-verified Ambiguous workspace.
2. In the CopilotKit panel choose **Research and propose**. `search_public`
   reserves one of three attempts before Exa; failed outbound attempts still
   count.
3. Inspect the public source cards and exact `[PACT DEMO]` task proposal.
4. Click **Approve**. This records local human review only; it does not write.
5. Click **Execute**. The server mints and verifies a real Auth0 service token,
   rechecks PACT, claims the single write in SQLite, and calls Ambiguous.
6. Verify the real provider ID, click **Read back same ID**, and open the
   provider-returned link when one exists.
7. For the denial demo, activate a fresh mission, research/propose, click
   **Approve**, then **Revoke**, then the still-visible **Execute** button.
8. Confirm `MISSION_REVOKED` and zero provider create calls. This final live
   denial requires working Auth0; the exact case is already covered offline.

## Architecture and enforcement

```text
UI / CopilotKit route
        ↓
runtime services (mission → search → proposal → approval → execution)
        ↓
pure core policy + transactional PactStore ports
        ↓
SQLite / Exa / Auth0 / Ambiguous adapters
```

The import direction is inward: `core/` has only local pure TypeScript imports;
runtime code depends on narrow interfaces; adapters and Next routes depend on
runtime/core. The model gets `search_public` and `task_propose`, never raw MCP,
shell, HTTP, credentials, or an Ambiguous write tool. Proposal, approval,
dispatch claim, provider acknowledgement, and verified read-back remain
separate persisted states.

Search admission and final write claim use short `BEGIN IMMEDIATE` SQLite
transactions. Network calls never run inside a database transaction. Ambiguous
schema discovery happens before the final `beforeWrite` callback; the callback
reloads mission/approval/current epoch and claims a unique execution immediately
before `create_task`. A timeout after that point becomes `UNKNOWN` and is never
automatically retried, including after restart.

The synthetic brief stores public fields separately from a private canary. The
server constructs a fresh allowlisted projection before model or search input;
tests verify the canary is absent from outbound recordings, snapshots, and
events. This is **public-data-only** privacy scope: declared private fields are
excluded, but arbitrary chat DLP is not implemented. Do not enter confidential
free text.

## Recording script (two minutes)

1. `0:00` Show the brief and bound Ambiguous destination.
2. `0:10` Explain the team's delegation problem.
3. `0:15` Activate the 30-minute, three-search, one-write contract.
4. `0:25` Point to “Declared private fields excluded.”
5. `0:35` Run real research and show evidence/source URLs.
6. `0:55` Show CopilotKit's exact `[PACT DEMO]` review card.
7. `1:05` Approve, Execute, show provider ID/read-back, then the actual task.
8. `1:20` Activate a fresh mission and prepare/approve a proposal.
9. `1:35` Revoke, Execute, show the specific denial and unused write slot.
10. `1:50` Close on the timeline and reusable core; name only verified roles.

Use a fresh mission for every take. Pre-open the safe Ambiguous workspace tab;
do not show credential/account/token screens. Edited footage must not present a
cached or earlier call as a new live call.

## Safety limits

- Auth0 proves service identity and permission. It does not prove Victor or
  Bakyt clicked Approve; the local operator/session check is separate.
- This modular monolith is a local single-operator demo, not an independent
  process/OS security boundary. Keep it on loopback with no public tunnel.
- The SQLite claim prevents duplicate dispatch admission through this runtime;
  it is not distributed exactly-once execution, cancellation, undo, or a
  provider-side rollback guarantee.
- Revocation blocks a new claim. It cannot cancel a provider request that won
  the claim and may already be in flight.
- External results are untrusted content. PACT does not claim universal prompt-
  injection immunity, arbitrary-chat DLP, compromised-server protection, or
  enforcement for future integrations that bypass this runtime.
- Acknowledged writes with failed read-back remain verification-pending and are
  never resent automatically. Persisted unknown claims stay non-retryable.

## Inherited and new work

Starter reference inspected at CopilotKit commit
`86f547d74e8bd32e047226b0e1fb862cca02a5c7`. Inherited patterns are the pinned
CopilotKit React/Hono streaming integration, loopback/same-origin posture, and
the Ambiguous task adapter's live schema validation plus `beforeWrite` hook.

New PACT work in this repository is the fixed Constitution/contract policy,
authority epochs, allowlisted brief projection, SQLite mission/evidence/
proposal/execution/event store, atomic search/write admission, exact approval
hashing, Auth0 client-credentials verifier, Exa tool mediation, CopilotKit PACT
tools and page, receipt semantics, and the ten compact test groups.

Before publishing, run `npm run secrets:check`, inspect staged/tracked files,
and repeat with an available dedicated scanner. A credential was previously
exposed in chat; its owner must rotate/revoke it before repository sharing or
deployment even if the repository scan is clean.
