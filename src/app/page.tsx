"use client";

import { useCallback, useEffect, useState } from "react";
import { PactAgent } from "@/components/pact-agent";
import type { RuntimeSnapshot } from "@/lib/pact/runtime/service";

type IntegrationState = "CONFIGURED" | "VERIFIED" | "BLOCKED";
type State = RuntimeSnapshot & {
  integrations: Record<string, IntegrationState>;
};

function formatTime(value: number | null) {
  return value ? new Date(value).toLocaleTimeString() : "-";
}

function cleanDashes(value: string) {
  return value.replace(/[—–]/g, "-");
}

function formatEventType(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function eventTone(type: string) {
  if (type.includes("DENIED") || type.includes("REVOKED")) return "denied";
  if (type.includes("APPROVED") || type.includes("VERIFIED")) return "success";
  if (type.includes("CREATED") || type.includes("STORED")) return "created";
  return "neutral";
}

const partners = [
  { name: "AI Thinkers", slug: "ai-thinkers", role: "Builder" },
  { name: "OpenAI", slug: "openai" },
  { name: "Exa", slug: "exa" },
  { name: "CopilotKit", slug: "copilotkit" },
  { name: "Auth0", slug: "auth0" },
  { name: "Ambiguous", slug: "ambiguous" },
] as const;

function PartnerSymbol({ slug }: { slug: (typeof partners)[number]["slug"] }) {
  if (slug === "ai-thinkers") {
    return (
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <path d="M6 21 14 5l8 16M10 16h8" />
        <circle cx="6" cy="21" r="2" /><circle cx="14" cy="5" r="2" /><circle cx="22" cy="21" r="2" />
      </svg>
    );
  }
  if (slug === "exa") {
    return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3c1.2 6.4 4.6 9.8 11 11-6.4 1.2-9.8 4.6-11 11-1.2-6.4-4.6-9.8-11-11 6.4-1.2 9.8-4.6 11-11Z" /></svg>;
  }
  if (slug === "copilotkit") {
    return (
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <rect x="4" y="4" width="8" height="8" rx="2" /><rect x="16" y="4" width="8" height="8" rx="2" />
        <rect x="4" y="16" width="8" height="8" rx="2" /><rect x="16" y="16" width="8" height="8" rx="2" />
      </svg>
    );
  }
  if (slug === "auth0") {
    return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="m14 3 10 8-3.8 12.2L14 25l-6.2-1.8L4 11l10-8Zm0 5-4.6 8.2L14 21l4.6-4.8L14 8Z" /></svg>;
  }
  if (slug === "ambiguous") {
    return <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="11" cy="14" r="7" /><circle cx="17" cy="14" r="7" /></svg>;
  }
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="9" /><path d="M14 5v18M5 14h18M8 8l12 12M20 8 8 20" />
    </svg>
  );
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (missionId?: string) => {
    const query = missionId ? `?missionId=${encodeURIComponent(missionId)}` : "";
    const response = await fetch(`/api/pact${query}`, { cache: "no-store" });
    const body = (await response.json()) as State & { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to load PACT state.");
    setState(body);
    return body;
  }, []);

  useEffect(() => {
    refresh().catch((reason) => setError(String(reason)));
  }, [refresh]);

  const command = useCallback(
    async (input: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/pact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await response.json()) as {
          result?: unknown;
          error?: string;
          code?: string;
        };
        if (!response.ok) {
          const reason = body.code ? `${body.code}: ${body.error}` : body.error;
          throw new Error(reason || "PACT denied the operation.");
        }
        const missionId =
          typeof input.missionId === "string"
            ? input.missionId
            : state?.mission?.id;
        const next = await refresh(missionId);
        setNotice(
          input.operation === "execute"
            ? "Execution returned a persisted provider state."
            : input.operation === "approve"
              ? "Exact proposal approved. No task has been created yet."
              : input.operation === "revoke"
                ? "Mission revoked. Stale Execute remains available to prove denial."
                : "PACT state updated.",
        );
        return body.result ?? next;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Operation failed.");
        try {
          await refresh(state?.mission?.id);
        } catch {
          // Preserve the controlled operation error.
        }
        throw reason;
      } finally {
        setBusy(false);
      }
    },
    [refresh, state?.mission?.id],
  );

  if (!state) {
    return <main className="shell"><p>{error || "Loading PACT…"}</p></main>;
  }

  const { mission, proposal, execution } = state;
  const active =
    mission?.status === "ACTIVE" &&
    mission.expiresAt !== null &&
    Date.now() < mission.expiresAt;

  return (
    <main className="shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="brand-line">
            <span className="pact-mark" aria-hidden="true">P</span>
            <p className="eyebrow">Policy · Authority · Contract · Trust</p>
          </div>
          <h1>Give agents objectives. Not unlimited authority.</h1>
          <p className="lede">
            An AI coworker researches and creates work items in the team&apos;s
            Ambiguous workspace, with authority bounded by a human-activated contract.
          </p>
        </div>
        <div className="integration-strip" aria-label="Integration status">
          {Object.entries(state.integrations).map(([name, status]) => (
            <span className={`badge ${status.toLowerCase()}`} key={name}>
              {name} · {status}
            </span>
          ))}
        </div>
      </header>

      <div className="dashboard">
        <div className="left-column">
          <section className="panel brief-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Selected brief</p>
                <h2>{cleanDashes(state.brief.title)}</h2>
              </div>
              <span className="badge configured">Synthetic public data</span>
            </div>
            <p>{cleanDashes(state.brief.objective)}</p>
            <ul>
              {state.brief.requirements.map((requirement) => (
                <li key={requirement}>{cleanDashes(requirement)}</li>
              ))}
            </ul>
            <div className="privacy-proof">
              <strong>Declared private fields excluded</strong>
              <span>
                The server builds an allowlisted projection before model/search context.
                Do not enter confidential free text.
              </span>
            </div>
          </section>

          <section className="panel contract-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Constitution + contract</p>
                <h2>{mission ? `Mission ${mission.id.slice(0, 8)}` : "No active mission"}</h2>
              </div>
              <span className={`badge ${active ? "verified" : "blocked"}`}>
                {mission?.status ?? "DRAFT"}
              </span>
            </div>
            {mission ? (
              <dl className="facts">
                <div><dt>Destination</dt><dd>{cleanDashes(mission.workspaceName)} · workspace-only</dd></div>
                <div><dt>Assignment</dt><dd>Unassigned</dd></div>
                <div><dt>Searches</dt><dd>{mission.searchLimit - mission.searchUsed} / {mission.searchLimit} left</dd></div>
                <div><dt>Write dispatch</dt><dd>{mission.writeLimit - mission.writeUsed} / {mission.writeLimit} left</dd></div>
                <div><dt>Expires</dt><dd>{formatTime(mission.expiresAt)}</dd></div>
                <div><dt>Authority epoch</dt><dd>{mission.authorityEpoch}</dd></div>
              </dl>
            ) : (
              <p className="muted">Activation binds a 30-minute immutable contract to the live workspace.</p>
            )}
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => command({ operation: "activate" })}>
                {mission ? "Activate fresh mission" : "Activate mission"}
              </button>
              {mission && active ? (
                <button className="danger" disabled={busy} onClick={() => command({ operation: "revoke", missionId: mission.id })}>
                  Revoke
                </button>
              ) : null}
            </div>
          </section>

          <PactAgent state={state} command={command} />
        </div>

        <div className="right-column">
          <section className="panel evidence-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Exa</p><h2>Stored public evidence</h2></div>
              <span className="badge configured">{state.evidence.length} sources</span>
            </div>
            {state.evidence.length ? (
              <div className="source-list">
                {state.evidence.map((item) => (
                  <article className="source" key={item.id}>
                    <span className="source-id">{item.id.slice(0, 8)}</span>
                    <h3>{cleanDashes(item.title)}</h3>
                    <p>{cleanDashes(item.excerpt)}</p>
                    <a href={item.url} target="_blank" rel="noreferrer">Open public source</a>
                  </article>
                ))}
              </div>
            ) : <p className="muted">No mission evidence stored yet.</p>}
          </section>

          <section className="panel review-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Exact human review</p><h2>Ambiguous task</h2></div>
              <span className={`badge ${proposal ? "configured" : "blocked"}`}>{proposal?.status ?? "NO PROPOSAL"}</span>
            </div>
            {proposal ? (
              <>
                <dl className="facts compact">
                  <div><dt>Workspace</dt><dd>{proposal.payload.workspaceId}</dd></div>
                  <div><dt>Scope</dt><dd>Workspace-only · unassigned</dd></div>
                  <div><dt>Hash</dt><dd className="mono">{proposal.payloadHash.slice(0, 16)}…</dd></div>
                </dl>
                <h3 className="proposal-title">{cleanDashes(proposal.payload.title)}</h3>
                <p className="proposal-description">{cleanDashes(proposal.payload.description)}</p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy || proposal.status !== "PROPOSED" || !active}
                    onClick={() => command({
                      operation: "approve",
                      proposalId: proposal.id,
                      displayedHash: proposal.payloadHash,
                      constitutionVersion: proposal.constitutionVersion,
                      contractVersion: proposal.contractVersion,
                    })}
                  >Approve</button>
                  <button
                    disabled={busy || proposal.status !== "PROPOSED" || !active}
                    onClick={() => command({ operation: "reject", proposalId: proposal.id })}
                  >Reject</button>
                  <button
                    className="execute"
                    disabled={busy || !["APPROVED", "BLOCKED"].includes(proposal.status)}
                    onClick={() => command({ operation: "execute", proposalId: proposal.id })}
                  >Execute</button>
                </div>
                <p className="muted">Approve records exact local human review. Execute separately verifies Auth0 and current PACT authority before any provider write.</p>
              </>
            ) : <p className="muted">Ask the agent to research and prepare a proposal.</p>}
          </section>

          {execution ? (
            <section className="panel receipt-panel">
              <div className="panel-heading">
                <div><p className="eyebrow">Provider receipt</p><h2>{execution.status}</h2></div>
                <span className={`badge ${execution.status === "VERIFIED" ? "verified" : "configured"}`}>Ambiguous</span>
              </div>
              <p><strong>Provider ID</strong><br/><code>{execution.providerId ?? "Not acknowledged"}</code></p>
              {execution.providerUrl ? <a href={execution.providerUrl} target="_blank" rel="noreferrer">Open actual task</a> : null}
              {execution.providerId ? (
                <button disabled={busy} onClick={() => command({ operation: "receipt", proposalId: execution.proposalId })}>Read back same ID</button>
              ) : null}
              {execution.errorCode ? <p className="warning">{execution.errorCode}</p> : null}
            </section>
          ) : null}

        </div>
      </div>

      <section className="panel timeline-panel audit-wide">
        <div className="panel-heading audit-heading">
          <div><p className="eyebrow">PACT audit</p><h2>Event timeline</h2></div>
          <span className="badge audit-count">{state.events.length} events</span>
        </div>
        <p className="audit-intro">A concise, immutable trail of authority decisions.</p>
        <ol className="timeline">
          {state.events.slice().reverse().map((event) => (
            <li className={eventTone(event.type)} key={event.id}>
              <div className="timeline-rail" aria-hidden="true"><span /></div>
              <div className="timeline-content">
                <div className="timeline-meta">
                  <strong>{formatEventType(event.type)}</strong>
                  <time>{formatTime(event.at)}</time>
                </div>
                {event.reason ? <span className="timeline-reason">{cleanDashes(event.reason)}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="partners-panel">
        <div className="partners-copy">
          <p className="eyebrow">The people and tools behind PACT</p>
          <h2>Built by <span>AI Thinkers</span> with help from our verified technology stack.</h2>
        </div>
        <div className="partner-logos" aria-label="Project partners and technology stack">
          {partners.map((partner) => (
            <div className={`partner-logo ${partner.slug}`} key={partner.name} aria-label={partner.name}>
              <span className="partner-symbol"><PartnerSymbol slug={partner.slug} /></span>
              <span className="partner-name">{partner.name}</span>
              {"role" in partner ? <span className="partner-role">{partner.role}</span> : null}
            </div>
          ))}
        </div>
      </footer>

      {(notice || error) ? (
        <div role={error ? "alert" : "status"} className={`toast ${error ? "toast-error" : ""}`}>
          {error || notice}
        </div>
      ) : null}
    </main>
  );
}
