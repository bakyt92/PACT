# PACT — IMPLEMENTATION PROMPT R02

**Product:** PACT — Policy, Authority, Contract & Trust  
**Positioning:** A Constitutional Runtime for AI Agents  
**Tagline:** Give agents objectives. Not unlimited authority.  
**Owners:** Victor and Bakyt · Agents, Everywhere hackathon · 12 September 2026  
**Coding session:** GPT-5.6 Sol, xHigh. This does not determine the application's runtime model.

## 0. Execute this version, not accumulated specifications

This is the complete replacement for `PACT_MASTER_PROMPT_SOL_R01.md` and the subsequent review/override texts. Do not combine their requirements. Preserve useful existing implementation; do not restart or restructure working code just to match this document.

Build, run and verify ONE useful live workflow with a small reusable authorization core. Do not return only a plan. Reuse the existing starter and dependencies. All credentials are in the repository-root `.env.local`; never print its contents or ask for credentials in chat.

### Hard priorities

**MUST, in this order:**

1. Within the first 10 minutes, start the app, check Ambiguous identity/tool access and mint/verify an Auth0 service token. Report concrete configuration blockers immediately, without secret values. Continue independent work while the owners fix access.
2. Complete the real path: **activate mission → mediated Exa search → OpenAI proposal with evidence → CopilotKit review → human approval → Auth0-verified execution → atomic PACT claim → Ambiguous task → receipt/read-back**.
3. On a fresh mission, demonstrate **approve → revoke → execute denied**, before any external write.
4. Prove declared private fields are excluded before entering the external model/search context.
5. Run the ten compact test groups below, typecheck and the available build checks.
6. Prepare a short `README.md` and `SUBMISSION.md`, including recording steps and a pre-publication secret check.

**DEFER:** new workspace packages, generalized SDK/plugin framework, VoxOS/LLLN fixtures, separate architecture/security/ADR documents, security-lab UI, new browser-test infrastructure, background recovery workers, model-token accounting, payments, arbitrary policy editing, distributed execution, public deployment and additional sponsors.

**Elapsed-time gates:** aim for the live path by minute 60. If it is not working then, stop everything except that path and its blocking safety defects. At minute 85 freeze features; use the remaining time for essential fixes, verification and handover notes. At minute 95 hand over the observed result, including blockers. Shorten these gates if the owners have less time. Do not copy a submission deadline from a critique or another city's event page; the current Paris portal/organizer is authoritative.

Inspect repository instructions first. Preserve `.env.local`, unrelated work, the existing package manager and lockfile. Do not upgrade the framework family, reset Git history, publish, or deploy. Give brief milestone updates, not long explanations. Code, UI, errors, tests and documents are English; only conversational progress/final handover may be Russian.

## 1. The product and visible workflow

Lead with the user experience:

> **An AI coworker that researches and creates work items in the team's Ambiguous workspace, with authority bounded by a contract a human activates.**

PACT is the enforcement mechanism behind that coworker. Constitution = fixed owner rules; contract = temporary mission permissions; runtime = checks outside the model; approval = permission for one exact action.

**Who it is for:** small teams delegating research and follow-up work without giving agents unrestricted workspace access.

**Why context matters:** the selected brief defines the research, the connected workspace defines the destination, evidence supports the proposed task, and the result remains in the team's actual work system. This is a workspace-connected web surface, not a claim that the UI is embedded inside Ambiguous itself.

### One scenario

The selected brief is **Voice AI Pilot — France**. Use synthetic public requirements and one separately stored internal field. Research public providers relevant to voice interaction and clinical documentation, distinguishing these categories. Produce one actionable comparison task with source references. Do not make medical recommendations or invent a vendor ranking.

Use the real connected Ambiguous workspace, **workspace-only scope**, with tasks explicitly **unassigned**. Do not require project IDs or Bakyt's provider user ID. The workspace must still be verified and bound server-side; workspace-only is not unrestricted access to arbitrary accounts. If a safe project-scoped implementation already works, keep it rather than weakening it.

The main screen shows the brief, destination, mission limits, real research/evidence, an exact task review card and a short event timeline. The task title starts with `[PACT DEMO]`.

Keep **Approve** and **Execute** as separate buttons. This makes delayed authorization understandable and demonstrates revocation without building a special test panel. Approval does not create a task. Execute performs the final current-state checks and the external write.

After success, show the real provider ID and read back the same record. For the video, also open the actual task in the Ambiguous workspace. A green toast alone is not proof.

## 2. Foundation and early checks

Use the existing `CopilotKit/agents-everywhere-starter-kit` web app when available. Inspect its actual files rather than assuming paths or APIs:

- `apps/web/README.md`, package manifests and the existing CopilotKit route/components;
- `apps/web/src/lib/server/workplace.ts` and the current follow-up write boundary;
- `dev-docs/auth0/` for the verifier pattern, not a separate demo service.

The documented web starter provides contextual UI and an Ambiguous follow-up path [S1]. Keep its working streaming integration and approval components. Register Exa explicitly; an environment key alone does not connect a tool. Remove or redirect inherited write routes so they cannot bypass PACT.

Load root `.env.local` explicitly even if workspace scripts expect `.env`. Environment variables already set by the process take precedence. Do not duplicate secrets into other files.

Recognize the owner's existing names and keep `.env.example` placeholder-only:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
MODEL=
EXA_API_KEY=
AMBIGUOUS_API_KEY=
AUTH0_DOMAIN=
AUTH0_AUDIENCE=https://pact.demo/api
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_REQUIRED_SCOPE=create:followups
COPILOTKIT_API_KEY=
COPILOTKIT_PUBLIC_API_KEY=
PACT_DB_PATH=./.data/pact.sqlite
```

`MODEL` is a runtime-model alias, not a second required setting. Use the existing configured model and verify access with one small request. Do not infer runtime API access from the coding subscription. Do not turn an unknown CopilotKit credential into a browser-public key; follow the installed integration's documented credential type. Do not add managed-service onboarding merely because a key exists.

**Preflight:** observe actual Ambiguous workspace identity and required create/read schemas; obtain and verify an Auth0 token with the configured audience/scope; make one bounded OpenAI probe and, when needed, one Exa probe. Preflight searches are setup checks, not evidence that mission quotas work. No preflight writes. Distinguish CONFIGURED, VERIFIED, BLOCKED and NOT_RUN. Use timeouts and sanitized errors, not repeated credential guessing.

If a live provider fails, keep the UI usable with the blocked capability disabled. Never substitute fake research, a local task presented as Ambiguous, or a test identity presented as Auth0.

## 3. Architecture: internal modules, not package scaffolding

Implement a modular monolith, using the existing app directory:

```text
apps/web/src/lib/pact/
  core/          domain types, pure policy evaluator, transition rules
  runtime/       mission, search, proposal, approval and execution services
  adapters/      SQLite store, Exa, Ambiguous, Auth0
  server.ts      server-only configuration and composition
```

Equivalent existing folders are fine. **Do not create npm/pnpm workspace packages, new package manifests, cross-package builds or a second app.** Necessary dependency/script changes in the existing app are allowed.

Core has only local pure TypeScript imports: no React, Next.js, provider SDKs, database, `process.env` or network. Use installed schema validation at input boundaries; do not build a schema library. Runtime depends on narrow interfaces and injected implementations. UI/routes depend inward. No provider brand names in generic policy decisions.

Keep only useful boundaries: a transactional `PactStore`, a clock, search/task provider interfaces and a service-token verifier. Ordinary functions and explicit types are enough. No generic unit-of-work framework, dynamic capability loader or event bus. One versioned domain schema and one fixed constitution suffice.

For later VoxOS and LLLN reuse, preserve **proposal ≠ approval ≠ dispatch ≠ provider result**, and keep identity/channel/provider concerns outside the evaluator. Voice interruption is not action cancellation; a learning recommendation is not authority to publish a result. Do not implement those products or fixtures now.

### Storage without a tooling detour

Keep an already-working transactional database adapter. Otherwise choose ONE SQLite driver that passes a quick smoke test on the installed Node/Next versions:

- `node:sqlite` when available and compatible; it no longer requires the experimental flag from Node 22.13 onward, although its stability depends on the version [S5]. Verify the installed version and a real server route, not just a terminal import.
- Otherwise use a compatible `better-sqlite3` installation. Check Next's external-package handling; current documentation already lists it among automatically externalized packages [S4]. Add/merge `serverExternalPackages` only where needed by the installed version. Do not spend the build session compiling native addons.

Bound driver troubleshooting to five minutes before choosing a compatible alternative behind the same store. Do not silently fall back to an in-memory Map or unguarded JSON file. Database failure blocks dispatch.

Use Node server routes, not Edge runtime. A small initial SQL migration, parameterized statements, transactions and uniqueness constraints are sufficient; no ORM required. Persist missions, proposals/approval, executions/receipts and events. Keep the database path stable across routes and restarts. Never hold a database transaction across network calls.

No background restart-recovery system: a persisted claimed/unknown execution stays non-retryable after restart. A saved receipt remains readable. Do not automatically resume outstanding writes.

## 4. Contract and authorization rules

The fixed constitution is code-enforced:

- Only a human-activated contract grants mission authority.
- The agent cannot activate/revoke missions, approve itself, change permissions or choose credentials.
- Configured search and task actions pass through PACT; unknown capabilities/destinations are denied.
- Every task write needs approval bound to its exact stored content.
- Revoked/expired authority cannot admit a new dispatch.
- Declared private fields never enter the approved external context.
- An uncertain write is never blindly retried.

Default contract:

```text
Objective: evidence-backed follow-up for Voice AI Pilot — France
Destination: verified Ambiguous workspace; workspace-only; unassigned
Search: Exa public search; at most 3 admitted outbound attempts
Write: one Ambiguous task; at most 1 dispatch admission
Human review: required before every write
Lifetime: 30 minutes from activation
Model route: configured direct OpenAI integration
```

Immutable contract content is fixed on activation. Editing an active mission requires a fresh mission, not a full version-management system. Store `constitutionVersion`, `contractVersion` and an `authorityEpoch`; revoke increments the epoch. Approval references those values. Expiry uses server time, including the exact expiry boundary.

**Do not implement hard monetary/token budgets.** For runaway prevention, bound agent runs at the supported route boundary, e.g. 25 admitted runs per mission, and use the runtime's supported loop/output limits. Count actual run invocations, not streaming chunks or protocol handshakes. A run may involve multiple model requests: never label this “25 OpenAI calls.” Only show the search/write quotas and lifetime as the main demo guarantees.

Search admission atomically checks active status, expiry, grant, workspace association and remaining quota, then reserves an attempt before Exa. Failed outbound attempts still consume capacity. Tool requests cannot supply arbitrary URLs, credentials, authority fields or alternate providers. Two simultaneous requests must not both spend the last slot.

Use small typed outcomes: `ALLOW`, `REQUIRE_APPROVAL`, `DENY`, with stable reasons such as `MISSION_NOT_ACTIVE`, `MISSION_REVOKED`, `MISSION_EXPIRED`, `QUOTA_EXCEEDED`, `APPROVAL_REQUIRED`, `ACTION_MISMATCH`, `SCOPE_MISMATCH` and `ALREADY_CLAIMED`. Check revocation before quota so the demo reports the actual revoked-authority reason.

## 5. Research, privacy and CopilotKit

Keep CopilotKit's installed streaming/runtime protocol intact. Mediate the supported **tool handlers** and guard mission-specific agent-run admission. Do not monkey-patch internal token streams or replace the runtime to implement provider-call accounting.

Use two narrow tools: `search.public` and `task.propose`, mapped to whatever valid tool naming the installed runtime supports. The proposal tool creates local review state only; it cannot write to Ambiguous. No raw MCP write tools, shell, unrestricted HTTP or alternative web search. All provider credentials remain server-side.

Keep one active agent run per mission and isolate conversation state when creating a fresh mission. Disable chat/run admission before activation and after revoke/expiry. An already-running model response may finish, but its subsequent tool actions still recheck current authority. Do not claim revocation cancels provider requests already in flight.

Exa searches are real, short and bounded. Return a few sources with server-generated evidence IDs, title, URL and short excerpts. OpenAI may refine within the remaining quota; it is not required to spend all three searches. Normalize results and handle no-results/errors honestly.

The proposal includes a title, useful description and evidence IDs. Resolve URLs from stored evidence; reject invented IDs. Source membership is provenance, not automatic factual verification. Never hardcode fabricated market findings.

**Privacy:** store the synthetic brief's public fields separately from an internal test field. Construct an allowlisted projection on the server BEFORE providing CopilotKit context or model/search inputs. Never send the full record and redact afterward. A test must show the private canary absent from outbound inputs. Display “Declared private fields excluded,” not “all PII anonymized.” Warn against entering confidential free text; arbitrary chat DLP is out of scope.

Treat external results as untrusted content, not authorization. Render text safely, do not execute returned HTML, and do not add arbitrary URL fetching. Avoid raw context logging and content-exporting telemetry. Audit only minimal structured facts and public reviewed content.

## 6. Exact human approval and Auth0

Reuse the starter's local-operator/trusted-origin protection. Keep the server bound to loopback, preserve existing checks and require same-origin mutations against the configured origin, not an origin inferred from arbitrary request headers. No wildcard CORS or public tunnel. This is a local single-operator demo, not production user authentication.

The server prepares and stores the final task payload. Bind its stable hash to proposal ID, mission/epoch, contract/constitution versions and verified workspace. Use a canonical representation of this small known structure, not hashing arbitrary client objects. Include the `[PACT DEMO]` prefix and any correlation marker before review. Do not alter content after approval.

The review card shows exact title/description, evidence, workspace-only destination, unassigned status and expiry. Approval submits only proposal ID and the displayed hash/version. Resolve the approving local operator on the server; never trust client `approvedBy`, `isHuman` or `{approved:true}`. A hash is not a user's digital signature. Rejection makes that proposal non-executable.

### Real Auth0 verification, no loopback HTTP

Use the configured client-credentials flow and a compatible maintained JWT verifier such as `jose`. Cache service tokens until shortly before expiry. The token is server-only.

Have ONE shared execution entry point, conceptually:

```text
executeAuthorized(serviceToken, proposalId)
  → verify token
  → load server-stored proposal
  → prepare/validate provider payload
  → current PACT checks + atomic claim
  → provider write
```

The operator's Execute route obtains the real token and calls this entry point **in-process**. A thin protected API route can delegate to the same entry point for direct API checks. No self-fetch to localhost, separate sample executor or second unguarded write path.

Verify RS256 signature using the configured issuer/JWKS, issuer, audience, expiry and exact scope membership for `create:followups`; check the configured executor identity against the actual verified client claim. Never derive trusted JWKS location from an unverified token [S3]. Missing/invalid authentication returns 401; authenticated service lacking permission returns 403. Valid service identity still does not override PACT or human approval.

**Auth0 proves service identity, not that Victor or Bakyt personally clicked Approve.** Label the two checks separately. This modular-monolith demo also does not create an independent process/OS security boundary.

**No live fallback to local signing keys, a fake verifier or anonymous execution.** On Auth0 failure, block task dispatch and report the configuration issue. Test keys/JWKS are dependency-injected only inside offline tests; the application cannot select them. A normal trusted JWKS cache is not an authorization bypass.

## 7. Ambiguous dispatch, duplicates and uncertain outcomes

Reuse the narrow existing Ambiguous adapter and its verified MCP schemas [S2]. Do not assume an API name from a review: inspect the checkout/live schema. Use one transport, not parallel REST and MCP implementations. Workspace identity comes from the provider; create only a title/description, leaving project and assignee unspecified for the workspace-only demo.

**Useful existing integration point:** the checked starter adapter has a `beforeWrite` callback after schema validation and immediately before its create call [S2]. Where present, use it for the final current-state check and atomic claim. Do not rewrite the whole adapter or add schema-discovery waits after the final permission check.

Prepare mappings/schema checks first. Then, in one short transaction: reload the mission and exact approval, check expiry/epoch/scope/hash, check capacity, claim a unique execution for this proposal, consume its write slot/approval and append the event. Commit; invoke the external write immediately afterward. Only this runtime may hold/use the write adapter.

Persist at least these semantic states:

```text
PROPOSED → APPROVED → CLAIMED → ACKNOWLEDGED → VERIFIED
          REJECTED    BLOCKED / UNKNOWN where applicable
```

Use consistent names; no elaborate state-machine library. A unique proposal/execution binding plus transactional checks prevents repeated clicks or concurrent requests from issuing a second write. Return the existing result/state or a conflict.

Revocation and claim serialize in the database. If revoke wins, no dispatch. If claim wins, the request may already be in flight: do not promise cancellation or undo. This is application-level dispatch control, not distributed exactly-once execution.

Disable write auto-retries. Timeout, lost connection or unreadable response after an attempted write means `UNKNOWN`; retain the consumed slot and do not resend. Preserve a real provider ID even if subsequent verification fails. An acknowledged record with failed read-back is “verification pending,” not a failed create to retry.

Read back only the recorded ID in the bound workspace, compare content and store the observed result. Such operator-requested receipt reads may continue after revoke; they do not revive write authority. Do not implement a recovery worker or broad workspace scan. Never invent a task URL; show the provider URL when available, otherwise the ID and manual workspace navigation.

No silent switch to a sandbox or local task store. Any live smoke write must use the intended demo workspace and the same ordinary approval/execute path. Keep writes harmless and few; never delete external records automatically.

## 8. UI and verification

Adapt the existing page/components. Keep the interface legible at normal recording resolution; no redesign framework.

Show: selected brief and workspace; constitution/contract summary; remaining searches/write slot; expiry and mission status; CopilotKit research/proposal; **Approve**, **Execute**, **Reject**, **Revoke**; source cards; real receipt; a compact timeline. Integration badges reflect observed status, not key presence. No fake trust scores or simulated success animations.

The revocation demonstration uses a **fresh mission** whose write quota is unused. Generate/review a proposal, approve it, revoke, then execute through the same real Auth0/PACT path. Show the specific denial. Do not hide the Execute button after revoke: allow the stale request to reach the server and display its safe denial. Keep ordinary research controls disabled.

### Ten compact test groups

Use the existing test runner and one or two files, with table-driven cases where helpful. Pure-core tests plus store/runtime tests use isolated SQLite databases, an injected clock, recording provider doubles and locally signed test JWTs. No paid/network calls in offline tests. Test denial AND zero adapter calls.

| Group | Required behavior |
|---|---|
| 1 | Draft, expired and unknown-capability requests are denied. |
| 2 | Search attempt four is denied; two requests cannot both consume the last search slot. |
| 3 | Missing or rejected approval prevents a write. |
| 4 | Exact valid approval permits one write; receipt/read-back state persists. |
| 5 | Changed payload, stale version or wrong workspace cannot reuse approval. |
| 6 | Approve then revoke before claim is denied for revoked/stale authority. |
| 7 | Duplicate/concurrent execution invokes the provider once and consumes one slot. |
| 8 | Real verifier rejects bad signature/issuer/audience/expiry; missing scope rejects execution. |
| 9 | Private field absent from projected model/search inputs and sanitized events. |
| 10 | Unknown write outcome or failed read-back never triggers redispatch, including after reopening the store. |

Do not create a 32-item checklist or new E2E harness. If existing browser tools are available, use them to check the actual visible flow; otherwise provide precise manual steps and label browser verification NOT_RUN. Run typecheck, tests and the existing web build. Never mark unexecuted checks passed.

## 9. Documentation, submission and handover

Only two main documents, written after the live path works or at the feature-freeze gate:

**README.md:** exact install/start/test/build commands; root env loading; local-only setup; integration status; ten-line recording script; short architecture/import direction; safety limitations; starter commit and inherited-versus-new work. Include public-data-only privacy scope, service versus human identity, no exactly-once/undo promise and no universal prompt-injection immunity.

**SUBMISSION.md:** what we built, who it is for, why workspace context matters, original PACT functionality, actually verified sponsor integrations, evidence/limitations and placeholders for repo/video/post links. The starter's rules summary requires public code, a two-minute demonstration and a public post, with local organizer instructions taking precedence [S6]. Prepare, do not publish or submit automatically.

Include an English social-post draft under 280 characters. Do not invent sponsor handles. Distinguish “built with” verified integrations from event-sponsor acknowledgements. Verify handles/tagging instructions before publication; organizer-required acknowledgements need not imply their tools were integrated.

### Recording — fresh missions for each take

- **0:00–0:15:** show the workspace-connected brief; explain the team's delegation problem.
- **0:15–0:35:** activate the 30-minute contract; show three searches, one write, explicit approval and private-field projection.
- **0:35–1:10:** real research, evidence and CopilotKit review; Approve then Execute; show receipt and the actual `[PACT DEMO]` task in Ambiguous. Pre-open the safe workspace tab. Cached or edited footage must not be presented as a new live call.
- **1:10–1:40:** fresh mission, proposal, approval, revoke, denied execution with no external write.
- **1:40–2:00:** timeline, reusable core and only verified sponsor roles.

Show the task/workspace, not credential, account-settings or token screens. If provider latency prevents a continuous two-minute take, prepare an honestly edited demonstration; do not fake tool activity or output. Do not claim the video is recorded unless it exists.

### Pre-publication secret check

Ignore `.env*` except placeholder `.env.example`, local databases and private logs. Inspect tracked/staged files and all available local Git history for credentials before declaring the repository publishable. Check env-file history, e.g. `git log --all -- .env.local ':(glob)**/.env.local'`, and use an available secret scanner with redacted output; also check other env/key files. Never print matched values or dump history into chat. Report scan coverage honestly; a limited pattern check is not proof no secret exists.

A credential was previously exposed in chat: remind the owners to rotate/revoke it before sharing or deployment. If repository/history secrets are found, mark publication BLOCKED: the owners must rotate/revoke and authorize sanitizing the intended public history. Do not rewrite history, rotate credentials, force-push or publish autonomously.

### Final response

Short and operational, in Russian: launch command/address; observed status of OpenAI, Exa, CopilotKit, Auth0 and Ambiguous; tests/build run and results; happy-path/revocation clicks; document paths; indispensable owner actions. Separate PASS, BLOCKED, OFFLINE_ONLY and NOT_RUN.

**Begin with repository inspection and bounded live preflight. Then immediately build the guarded vertical slice.**

## Reference index — consult only as needed

These sources were inspected when revising this prompt; that does not verify the owners' keys or installed versions. Inspect the checkout first. Do not spend the build session rereading all documentation.

```text
S1 Starter web integration:
https://github.com/CopilotKit/agents-everywhere-starter-kit/blob/main/apps/web/README.md
S2 Narrow Ambiguous adapter and beforeWrite hook:
https://github.com/CopilotKit/agents-everywhere-starter-kit/blob/main/apps/web/src/lib/server/workplace.ts
S3 Auth0 access-token validation:
https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens
S4 Next.js server external packages:
https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
S5 Node SQLite version history:
https://nodejs.org/api/sqlite.html
S6 Starter rules summary; local Paris portal takes precedence:
https://github.com/CopilotKit/agents-everywhere-starter-kit/blob/main/hackathon-rules.md
```
