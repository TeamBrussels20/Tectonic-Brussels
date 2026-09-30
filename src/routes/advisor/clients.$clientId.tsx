import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { CashflowChart, CategoryBars, Meter, StatTile } from "../../advisor/charts"
import { Chat } from "../../advisor/Chat"
import { Badge, EmployeeShell, HealthScore } from "../../advisor/EmployeeShell"
import { streamAdvisor, type AdvisorEvent } from "../../lib/advisor"
import { age, formatEur, humanize, initials } from "../../lib/format"
import { supabase } from "../../lib/supabaseClient"
import type { Handoff, Recommendation } from "../../lib/types"
import { summarizeTransactions, useClientData, type ClientData } from "../../lib/useClientData"

export const Route = createFileRoute("/advisor/clients/$clientId")({
  component: ClientDashboard,
})

function ClientDashboard() {
  const { clientId } = Route.useParams()
  const { data, error, reload } = useClientData(clientId)
  const [analysis, setAnalysis] = useState<{ steps: string[]; error?: string } | null>(null)

  const onAdvisorEvent = (e: AdvisorEvent) => {
    if (e.type === "saved" || e.type === "done") reload()
  }

  async function runAnalysis() {
    setAnalysis({ steps: [] })
    for await (const e of streamAdvisor({ clientId, mode: "analyze" })) {
      onAdvisorEvent(e)
      if (e.type === "tool") setAnalysis((a) => ({ steps: [...(a?.steps ?? []), e.label] }))
      if (e.type === "error") setAnalysis((a) => ({ steps: a?.steps ?? [], error: e.message }))
      if (e.type === "done") setAnalysis(null)
    }
    setAnalysis((a) => (a?.error ? a : null))
  }

  if (error) return <EmployeeShell>Could not load client: {error}</EmployeeShell>
  if (!data) return <EmployeeShell>Loading…</EmployeeShell>
  const { client } = data

  return (
    <EmployeeShell>
      <Link to="/advisor" className="text-sm text-ink-2 hover:text-brand">
        ← All clients
      </Link>

      <div className="mt-2 mb-5 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-light text-xl font-semibold text-brand">
          {initials(client.full_name)}
        </span>
        <div>
          <h1 className="text-2xl">{client.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Badge tone={client.status === "customer" ? "brand" : "accent"}>
              {client.status === "customer" ? "Customer" : "Prospect"}
            </Badge>
            {client.segment && <Badge>{client.segment}</Badge>}
            <Badge>Risk profile: {humanize(client.risk_profile)}</Badge>
            <span>
              {[
                age(client.date_of_birth) && `${age(client.date_of_birth)} years`,
                client.city,
                client.customer_since && `client since ${client.customer_since.slice(0, 4)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <a
            href={client.status === "customer" ? `/?client=${client.id}` : `/chat/${client.id}`}
            target="_blank"
            className="rounded-lg border border-line bg-white px-4 py-2 text-ink-2 hover:border-brand hover:text-brand"
          >
            {client.status === "customer" ? "Open customer app ↗" : "Open onboarding chat ↗"}
          </a>
          <button
            onClick={runAnalysis}
            disabled={!!analysis && !analysis.error}
            className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90 disabled:opacity-60"
          >
            {analysis && !analysis.error ? "Analysing…" : data.assessment ? "Refresh AI analysis" : "Run AI analysis"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <AppointmentRequests data={data} onChange={reload} />
          <AssessmentCard data={data} analysis={analysis} onRun={runAnalysis} />
          <Recommendations data={data} onChange={reload} />
          <Kpis data={data} />
          {data.transactions.length > 0 && <Cashflow data={data} />}
          <div className="grid gap-5 md:grid-cols-2">
            <Profile data={data} />
            <Goals data={data} />
          </div>
          <Balances data={data} />
        </div>

        <aside className="card flex h-[80vh] flex-col p-0 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
          <div className="border-b border-line px-4 py-3">
            <h2>Advisor copilot</h2>
            <p className="text-sm text-ink-3">Ask the AI about {client.full_name.split(" ")[0]}'s finances.</p>
          </div>
          <div className="min-h-0 flex-1">
            <Chat
              clientId={client.id}
              mode="employee"
              onEvent={onAdvisorEvent}
              placeholder="Ask about this client…"
              emptyState={
                <p className="text-sm text-ink-3">
                  The copilot can see this client's accounts, transactions, loans, goals and the product catalogue.
                </p>
              }
              suggestions={[
                "Prepare talking points for my next meeting",
                "Where could this client save money?",
                "Draft a follow-up email with your top recommendation",
              ]}
            />
          </div>
        </aside>
      </div>
    </EmployeeShell>
  )
}

// Requests made by the customer in Kompass ("Demander un rendez-vous").
function AppointmentRequests({ data, onChange }: { data: ClientData; onChange: () => void }) {
  if (data.handoffs.length === 0) return null
  const open = data.handoffs.filter((h) => h.status === "open")

  async function setStatus(h: Handoff, status: Handoff["status"]) {
    await supabase.from("handoffs").update({ status }).eq("id", h.id)
    onChange()
  }

  return (
    <section className="card border-accent/40">
      <div className="flex items-center gap-2">
        <h2>Appointment requests</h2>
        {open.length > 0 && <Badge tone="accent">{open.length} open</Badge>}
        <span className="ml-auto text-xs text-ink-3">From the Kompass customer app</span>
      </div>
      <div className="mt-3 space-y-3">
        {data.handoffs.map((h) => (
          <article key={h.id} className={`rounded-lg border border-line p-4 ${h.status === "done" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg">{h.topic}</h3>
              <span className="ml-auto text-sm text-ink-3">
                {h.reference} · {new Date(h.created_at).toLocaleString("en-GB")}
              </span>
            </div>
            {h.summary && (
              <div className="mt-2 rounded-lg bg-page p-3 text-sm whitespace-pre-wrap text-ink-2">
                <div className="mb-1 font-medium text-ink">Conversation summary</div>
                {h.summary}
              </div>
            )}
            {h.status === "open" ? (
              <button
                onClick={() => setStatus(h, "done")}
                className="mt-3 rounded-lg bg-brand px-3 py-1 text-sm text-white"
              >
                Mark as handled
              </button>
            ) : (
              <div className="mt-2 text-sm text-ink-3">
                Handled ·{" "}
                <button onClick={() => setStatus(h, "open")} className="underline">
                  reopen
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function AssessmentCard({
  data,
  analysis,
  onRun,
}: {
  data: ClientData
  analysis: { steps: string[]; error?: string } | null
  onRun: () => void
}) {
  const a = data.assessment
  return (
    <section className="card">
      <div className="flex items-center gap-2">
        <h2>AI assessment</h2>
        {a && (
          <span className="ml-auto text-xs text-ink-3">
            Generated {new Date(a.generated_at).toLocaleString("en-GB")}
          </span>
        )}
      </div>

      {analysis && (
        <div className="mt-3 rounded-lg bg-brand-light/60 p-3 text-sm">
          {analysis.error ? (
            <span className="text-critical">{analysis.error}</span>
          ) : (
            <>
              <div className="font-medium text-brand">The AI advisor is analysing this client…</div>
              <ul className="mt-1 text-ink-2">
                {[...new Set(analysis.steps)].map((s) => (
                  <li key={s}>✓ {s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!a && !analysis && (
        <div className="mt-3 text-ink-2">
          No assessment yet.{" "}
          <button onClick={onRun} className="font-medium text-brand underline">
            Run the AI analysis
          </button>{" "}
          to get a financial health score and tailored recommendations.
        </div>
      )}

      {a && (
        <div className="mt-3 grid gap-5 md:grid-cols-[180px_1fr]">
          <div>
            <div className="text-sm text-ink-2">Financial health</div>
            <HealthScore score={a.health_score} size="lg" />
            <div className="mt-2">
              <Meter value={a.health_score} max={100} />
            </div>
          </div>
          <div>
            <p>{a.summary}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <List title="Strengths" items={a.strengths} />
              <List title="Risks" items={a.risks} />
              <List title="Still to ask" items={a.missing_information} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm text-ink-2">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
        {items.length === 0 ? <li className="text-ink-3">None</li> : items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  )
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

function Recommendations({ data, onChange }: { data: ClientData; onChange: () => void }) {
  const [showClosed, setShowClosed] = useState(false)
  const recs = [...data.recommendations].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at.localeCompare(b.created_at),
  )
  const open = recs.filter((r) => r.status === "proposed")
  const closed = recs.filter((r) => r.status !== "proposed")

  async function setStatus(r: Recommendation, status: Recommendation["status"]) {
    await supabase.from("recommendations").update({ status }).eq("id", r.id)
    onChange()
  }

  return (
    <section className="card">
      <div className="flex items-center">
        <h2>Recommendations</h2>
        {closed.length > 0 && (
          <button onClick={() => setShowClosed(!showClosed)} className="ml-auto text-sm text-ink-2 hover:text-brand">
            {showClosed ? "Hide" : "Show"} {closed.length} accepted/dismissed
          </button>
        )}
      </div>
      {open.length === 0 && <p className="mt-2 text-ink-3">No open recommendations.</p>}
      <div className="mt-3 space-y-3">
        {[...open, ...(showClosed ? closed : [])].map((r) => (
          <article
            key={r.id}
            className={`rounded-lg border border-line p-4 ${r.status !== "proposed" ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <PriorityChip priority={r.priority} />
              <Badge>{humanize(r.category)}</Badge>
              {r.product_code && <Badge tone="brand">{data.products[r.product_code]?.name ?? r.product_code}</Badge>}
              {r.estimated_annual_impact != null && r.estimated_annual_impact !== 0 && (
                <span className="ml-auto text-sm font-medium">≈ {formatEur(r.estimated_annual_impact)}/year</span>
              )}
            </div>
            <h3 className="mt-2 text-lg">{r.title}</h3>
            <p className="mt-1 text-ink-2">{r.rationale}</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">Next step:</span> {r.next_step}
            </p>
            {r.status === "proposed" ? (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setStatus(r, "accepted")}
                  className="rounded-lg bg-brand px-3 py-1 text-sm text-white"
                >
                  Accept
                </button>
                <button
                  onClick={() => setStatus(r, "dismissed")}
                  className="rounded-lg border border-line px-3 py-1 text-sm text-ink-2"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="mt-2 text-sm text-ink-3">
                {humanize(r.status)} ·{" "}
                <button onClick={() => setStatus(r, "proposed")} className="underline">
                  undo
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function PriorityChip({ priority }: { priority: Recommendation["priority"] }) {
  const [color, icon] = {
    high: ["var(--color-critical)", "■"],
    medium: ["var(--color-warning)", "▲"],
    low: ["var(--color-ink-3)", "●"],
  }[priority]
  return (
    <span className="text-sm font-medium text-ink-2">
      <span style={{ color }}>{icon}</span> {humanize(priority)} priority
    </span>
  )
}

function Kpis({ data }: { data: ClientData }) {
  const assets = data.accounts.reduce((s, a) => s + Number(a.balance), 0)
  const debt = data.loans.reduce((s, l) => s + Number(l.outstanding), 0)
  const tx = summarizeTransactions(data.transactions)
  const hasTx = data.transactions.length > 0
  const income = hasTx ? tx.avgIncome : data.client.monthly_net_income
  const savingsRate = hasTx && tx.avgIncome > 0 ? ((tx.avgIncome - tx.avgSpending) / tx.avgIncome) * 100 : null
  const liquid = data.accounts
    .filter((a) => a.type === "current" || a.type === "savings")
    .reduce((s, a) => s + Number(a.balance), 0)
  const bufferMonths = hasTx && tx.avgSpending > 0 ? liquid / tx.avgSpending : null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatTile
        label="Assets at bank"
        value={data.accounts.length ? formatEur(assets) : "—"}
        sub={debt ? `${formatEur(debt)} loans outstanding` : "No loans"}
      />
      <StatTile
        label="Monthly income"
        value={income ? formatEur(income) : "Unknown"}
        sub={hasTx ? "6-month average" : income ? "Declared" : undefined}
      />
      <StatTile
        label="Monthly spending"
        value={hasTx ? formatEur(tx.avgSpending) : "—"}
        sub={hasTx ? "incl. own savings transfers" : undefined}
      />
      <StatTile
        label="Savings rate"
        value={savingsRate != null ? `${savingsRate.toFixed(0)}%` : "—"}
        sub="of income left over"
      />
      <StatTile
        label="Cash buffer"
        value={bufferMonths != null ? `${bufferMonths.toFixed(1)} mo` : "—"}
        sub={liquid ? `${formatEur(liquid)} liquid` : undefined}
      />
    </div>
  )
}

function Cashflow({ data }: { data: ClientData }) {
  const tx = summarizeTransactions(data.transactions)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="card min-w-0">
        <h2>Income vs spending</h2>
        <p className="mb-3 text-sm text-ink-3">Last {tx.monthly.length} months</p>
        <CashflowChart data={tx.monthly} />
      </section>
      <section className="card min-w-0">
        <h2>Spending by category</h2>
        <p className="mb-3 text-sm text-ink-3">Monthly average</p>
        <CategoryBars data={tx.byCategory} />
      </section>
    </div>
  )
}

function Profile({ data }: { data: ClientData }) {
  const c = data.client
  const facts: [string, string | null][] = [
    ["Occupation", c.occupation],
    ["Employment", c.employment_type && humanize(c.employment_type)],
    ["Gross income", c.annual_gross_income ? `${formatEur(c.annual_gross_income)} / year` : null],
    ["Net income", c.monthly_net_income ? `${formatEur(c.monthly_net_income)} / month` : null],
    [
      "Household",
      [c.marital_status, c.dependents != null && `${c.dependents} dependents`].filter(Boolean).join(", ") || null,
    ],
    ["Housing", c.housing && humanize(c.housing)],
    ["Investment horizon", c.investment_horizon_years ? `${c.investment_horizon_years} years` : null],
    ["Contact", [c.email, c.phone].filter(Boolean).join(" · ") || null],
  ]
  return (
    <section className="card">
      <h2>Profile</h2>
      <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className={v ? "" : "text-ink-3 italic"}>{v ?? "unknown"}</dd>
          </div>
        ))}
      </dl>
      {c.notes && (
        <div className="mt-3 rounded-lg bg-page p-3 text-sm whitespace-pre-wrap text-ink-2">
          <div className="mb-1 font-medium text-ink">Notes</div>
          {c.notes}
        </div>
      )}
    </section>
  )
}

function Goals({ data }: { data: ClientData }) {
  return (
    <section className="card">
      <h2>Goals</h2>
      {data.goals.length === 0 && <p className="mt-2 text-sm text-ink-3">No goals recorded yet.</p>}
      <div className="mt-3 space-y-4">
        {data.goals.map((g) => (
          <div key={g.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{g.title}</span>
              <span className="ml-auto text-xs text-ink-3">{humanize(g.priority)}</span>
            </div>
            {g.target_amount ? (
              <Meter
                value={Number(g.current_amount)}
                max={Number(g.target_amount)}
                label={`${formatEur(g.current_amount)} of ${formatEur(g.target_amount)}${g.target_date ? ` by ${g.target_date.slice(0, 7)}` : ""}`}
              />
            ) : (
              <div className="text-xs text-ink-3">
                {g.target_date ? `Target ${g.target_date.slice(0, 7)}` : "No target amount"}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Balances({ data }: { data: ClientData }) {
  if (data.accounts.length === 0 && data.loans.length === 0) return null
  return (
    <section className="card">
      <h2>Accounts, investments & loans</h2>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[520px] text-sm">
          <tbody>
            {data.accounts
              .filter((a) => a.type === "current" || a.type === "savings")
              .map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="py-1.5">{a.name}</td>
                  <td className="text-ink-3">{a.iban}</td>
                  <td className="text-ink-3">{a.interest_rate ? `${a.interest_rate}%` : ""}</td>
                  <td className="text-right tabular-nums">{formatEur(a.balance)}</td>
                </tr>
              ))}
            {data.holdings.map((h) => (
              <tr key={h.id} className="border-b border-line">
                <td className="py-1.5">{h.name}</td>
                <td className="text-ink-3">{humanize(h.asset_class)}</td>
                <td className="text-ink-3">
                  {h.cost_basis ? `${(((h.market_value - h.cost_basis) / h.cost_basis) * 100).toFixed(0)}% gain` : ""}
                </td>
                <td className="text-right tabular-nums">{formatEur(h.market_value)}</td>
              </tr>
            ))}
            {data.loans.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="py-1.5">{humanize(l.type)} loan</td>
                <td className="text-ink-3">{formatEur(l.monthly_payment)}/month</td>
                <td className="text-ink-3">{l.interest_rate}%</td>
                <td className="text-right tabular-nums">−{formatEur(l.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
