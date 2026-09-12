# PACT submission handover

## What we built

PACT is an AI coworker that researches public provider evidence for **Voice AI
Pilot — France** and prepares one real follow-up task in the team's Ambiguous
workspace. Its authority comes from a short-lived human-activated contract, not
from the model prompt. Search quota, exact review, Auth0 service authorization,
current-state revalidation, atomic dispatch claim, provider receipt, and
read-back are one guarded path.

It is for small teams that want useful agent work without granting unrestricted
workspace access. Page context matters twice: the selected brief defines the
research question, and the connected workspace defines the only destination
where the approved result is useful and persistent.

## Original PACT functionality

- Fixed code-enforced Constitution and immutable 30-minute mission contract.
- Three atomically admitted Exa search attempts and one write admission.
- Server-side public-field projection before model/search context.
- CopilotKit tools limited to public search and local task proposal.
- Exact payload/evidence/workspace/version/authority-epoch approval hash.
- Separate Approve and Execute controls with a still-visible stale Execute.
- Real RS256 Auth0 audience/scope/executor verification before PACT claim.
- SQLite uniqueness/transactions preventing duplicate concurrent dispatch.
- `UNKNOWN` and verification-pending states that never auto-redispatch.
- Provider ID/read-back receipt and compact event timeline.

## Verified sponsor integrations

| Built with | Verified evidence | Limitation |
| --- | --- | --- |
| OpenAI | Bounded Responses API probe and completed CopilotKit agent stream using `gpt-4.1-mini`. | Model name currently comes from the documented default because neither model env alias is set. |
| CopilotKit | Runtime reports streaming/client-tool support; live AG-UI run produced the proposal tool call. | Model-only local web integration; no managed Intelligence claim. Browser UI automation was unavailable. |
| Exa | Live bounded search returned three PACT-stored sources. | Source membership is provenance, not automatic factual verification. |
| Ambiguous AI | Live identity and `auth_whoami`/`create_task`/`get_task` schemas observed for the bound workspace. | No live create was performed because Auth0 is blocked. |
| Auth0 | Live client-credentials token minted and verified (audience `https://pact.demo/api`, `create:followups` scope, executor `…@clients`); Execute created Ambiguous task `385ab713-080d-47d8-9ffc-b86483575099` and read it back by ID. Offline real-`jose` RS256 negative/positive verification also passes. | Live verification used the developer tenant configured on 12 September 2026. |

Sponsor acknowledgements required by the organizer should be added only after
current Paris instructions and handles are verified. An acknowledgement does
not imply that sponsor's tool was integrated.

## Evidence and limitations

- `npm run verify`: PASS, 11 subtests covering all ten required groups.
- `npm run build`: PASS on Next.js 15.5.25.
- Live activation: PASS; server bound the observed Ambiguous workspace.
- Live PACT → Exa → CopilotKit/OpenAI proposal: PASS.
- Live exact approval then revoke: PASS; no provider write occurred.
- Live Execute: PASS; a real Auth0 token was minted and verified, the single
  write slot was atomically claimed, and Ambiguous task
  `385ab713-080d-47d8-9ffc-b86483575099` was created and read back by the same
  ID (execution `VERIFIED`, read-back title matched).
- Approve → revoke → `MISSION_REVOKED` with zero adapter calls: PASS
  `OFFLINE_ONLY` with the same runtime entry point and a locally signed JWT.
  The live denial demo has not yet been recorded.
- Visible browser flow: PASS; the full Activate → research → propose → approve →
  execute → read-back path was driven manually through the UI on
  12 September 2026. Automated computer-use browser capture was `NOT_RUN`.

PACT does not promise distributed exactly-once behavior, undo, in-flight
cancellation, arbitrary-chat DLP, universal prompt-injection immunity, or an
independent OS/process boundary. It uses public synthetic brief data only.

## Two-minute demo

1. Show brief, connected destination, and the team delegation problem.
2. Activate the contract; show lifetime, three searches, one write, unassigned.
3. Show the declared-private-field projection indicator.
4. Run real research; inspect source evidence and category distinction.
5. Review the exact CopilotKit-produced `[PACT DEMO]` task.
6. Approve, then separately Execute after Auth0 is fixed.
7. Show real provider ID, same-ID read-back, and actual Ambiguous task.
8. On a fresh mission approve, revoke, Execute, and show `MISSION_REVOKED`.
9. Show the timeline and state the service/human identity distinction.
10. Name only the integrations verified in the recorded take.

## Publication checklist

- [ ] Add public repository URL: `<REPO_URL>`
- [ ] Add two-minute video URL: `<VIDEO_URL>`
- [ ] Add public post URL: `<POST_URL>`
- [ ] Add current Paris organizer-required acknowledgements/handles.
- [x] Configure and verify live Auth0 M2M audience/scope/identity.
- [x] Record a real Ambiguous create and same-ID read-back through ordinary UI
      (task `385ab713-080d-47d8-9ffc-b86483575099`, 12 September 2026).
- [ ] Run `npm run secrets:check` and a dedicated secret scanner if available.
- [ ] Inspect staged/tracked files and `.env*` history before publishing.
- [ ] Rotate/revoke the credential previously exposed in chat.
- [ ] If any secret is found, stop publication; rotate it and obtain explicit
      authorization before sanitizing public history.

Do not publish, submit, rewrite history, rotate credentials, force-push, or
deploy automatically.

## Social post draft (under 280 characters)

PACT gives AI coworkers objectives, not unlimited authority: bounded public
research, exact human approval, Auth0-verified execution, atomic dispatch, and a
real workspace receipt. Built for Agents, Everywhere. Demo: <VIDEO_URL>
