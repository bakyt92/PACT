# PACT

> A constitutional runtime for AI agents.

PACT gives an AI agent a limited mission instead of unlimited authority. The agent can understand a real work context and prepare a useful action, but PACT decides whether that action is allowed, asks a person to approve the exact result, and checks the permission again immediately before execution.

## The problem

Prompt instructions and a button labelled `Approve` are not sufficient execution controls. A model can produce a correctly shaped request for the wrong project, a browser can send different arguments from the ones the user reviewed, and an old approval can remain usable after the mission has been revoked.

PACT connects policy, mission scope, human approval, execution, and the external receipt in one enforceable path.

## MVP demonstration

The demo uses one project in an Ambiguous workspace and one supported action: creating a task.

1. A user selects a source task from the `Voice AI Pilot` project.
2. PACT removes closed fields before the context reaches the model.
3. OpenAI prepares a concrete follow-up task for the selected assignee.
4. The user reviews the exact project, assignee, due date, title, and description.
5. PACT re-checks the mission and dispatches the approved task through the Ambiguous adapter.
6. The real task ID is returned and read back from the external workspace.
7. A second waiting proposal is blocked after `Revoke mission` is pressed.

The important negative case is that the old approval cannot authorize a new action after revocation.

## How authorization works

| Concept | Purpose |
| --- | --- |
| Constitution | Versioned system rules the agent cannot change, such as no writes outside the mission scope and no use of closed fields |
| Mission Contract | The time-limited scope for one mission: workspace, project, source task, assignee, allowed actions, and write limit |
| Action Proposal | The immutable action arguments shown to the user and stored by the server |
| Human Approval | Approval bound to the stored proposal ID, content fingerprint, mission, and policy versions |
| Execution | An idempotent dispatch record that prevents the same proposal from creating duplicate external records |
| Receipt | The confirmed result from the external system, such as an Ambiguous task ID |

The browser sends only a `proposalId` when the user approves. The server loads the stored action and checks the current mission state, policy versions, project and assignee scope, expiry, and remaining write capacity before calling the external adapter.

## Execution path

```text
Selected task
    → filtered context projection
    → OpenAI structured proposal
    → PACT policy decision
    → human approval of exact proposal
    → authorization re-check
    → Ambiguous task adapter
    → external receipt and audit event
```

The model can propose an action, but it does not receive an unrestricted Ambiguous write tool. All supported external writes pass through the PACT application service.

## MVP guarantees

PACT is designed to enforce these properties:

- A task cannot be created outside the contract’s project or for an unauthorized assignee.
- Closed source fields are removed before model context is created.
- Changing the reviewed action invalidates the previous approval.
- A revoked or expired mission cannot dispatch a waiting proposal.
- Rejecting a proposal does not call the external adapter.
- Repeated approval of one proposal cannot create a duplicate task.
- An exhausted write limit blocks further external writes.
- A timeout after an external request becomes `unknown_result`; it is not automatically retried as a possible duplicate.

The guarantee covers the PACT-controlled execution path and its adapters. It does not claim to secure arbitrary tools, a compromised server, compromised dependencies, or future integrations that bypass PACT.

## Architecture

The project is organized around a small framework-independent core:

```text
src/
  domain/          Constitution, contracts, proposals, decisions, state transitions
  application/     mission, proposal, approval, revocation, and dispatch use cases
  infrastructure/  SQLite repositories, OpenAI, and Ambiguous adapters
  app/api/         thin HTTP route handlers
  components/      workspace page, proposal card, PACT panel, and event history
tests/
  domain/          deterministic policy and lifecycle tests
  application/     use-case tests with in-process adapters
```

The recommended stack is TypeScript, Next.js, CopilotKit, OpenAI, Ambiguous AI, and local SQLite for mission and audit state. Auth0 is an optional addition for API authentication and scope validation after the core path is working.

## Scope

The MVP intentionally focuses on one agent, one workspace, and one external write type. Payments, travel booking, Slack/Discord/Telegram workflows, voice input, arbitrary HTTP or shell tools, generated code execution, and generalized policy-language parsing are outside the first implementation.

## Project status

The product and architecture documentation is complete. Implementation is being developed on the [`bakyt1`](https://github.com/bakyt92/PACT/tree/bakyt1) branch. The main planning documents are:

- [General MVP plan](GENERAL.md)
- [MVP architecture design](docs/superpowers/specs/2026-09-12-pact-mvp-design.md)

## Product direction

PACT is intended to become reusable policy and enforcement infrastructure for VoxOS and other agent systems. The model, channel, and external adapter can change while the core relationship remains:

```text
permission → dispatch → receipt
```

For conversational agents, speech recognition is not authorization, stopping text-to-speech does not cancel an external action, and consent must always have a clear scope.
