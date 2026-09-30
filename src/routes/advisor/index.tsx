import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Badge, EmployeeShell, HealthScore } from "../../advisor/EmployeeShell"
import { age, formatEur, initials } from "../../lib/format"
import { supabase } from "../../lib/supabaseClient"
import type { Client } from "../../lib/types"

export const Route = createFileRoute("/advisor/")({
  component: ClientList,
})

interface Row {
  client: Client
  assets: number
  debt: number
  health: number | null
  openRecs: number
  highRecs: number
  requests: number
}

async function loadRows(): Promise<Row[]> {
  const [clients, accounts, loans, assessments, recs, handoffs] = await Promise.all([
    supabase.from("clients").select("*").order("full_name").returns<Client[]>(),
    supabase.from("accounts").select("client_id, balance"),
    supabase.from("loans").select("client_id, outstanding"),
    supabase.from("assessments").select("client_id, health_score"),
    supabase.from("recommendations").select("client_id, priority").eq("status", "proposed"),
    supabase.from("handoffs").select("client_id").eq("status", "open"),
  ])
  const sum = (rows: Record<string, unknown>[] | null, id: string, key: string) =>
    (rows ?? []).filter((r) => r.client_id === id).reduce((s, r) => s + Number(r[key]), 0)
  return (clients.data ?? []).map((client) => {
    const mine = (recs.data ?? []).filter((r) => r.client_id === client.id)
    return {
      client,
      assets: sum(accounts.data, client.id, "balance"),
      debt: sum(loans.data, client.id, "outstanding"),
      health: assessments.data?.find((a) => a.client_id === client.id)?.health_score ?? null,
      openRecs: mine.length,
      highRecs: mine.filter((r) => r.priority === "high").length,
      requests: (handoffs.data ?? []).filter((h) => h.client_id === client.id).length,
    }
  })
}

function ClientList() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [filter, setFilter] = useState<"all" | "customer" | "prospect">("all")
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadRows().then(setRows)
  }, [])

  const visible = (rows ?? []).filter(
    (r) =>
      (filter === "all" || r.client.status === filter) &&
      r.client.full_name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <EmployeeShell>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl">Clients</h1>
          <p className="text-ink-2">Existing customers and prospects, with AI-prepared insights.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90"
        >
          + New prospect
        </button>
      </div>

      {adding && <NewProspect onCancel={() => setAdding(false)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "customer", "prospect"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f ? "bg-brand text-white" : "border border-line bg-white text-ink-2"}`}
          >
            {f === "all" ? "All" : f === "customer" ? "Customers" : "Prospects"}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="ml-auto w-full rounded-lg border border-line bg-white px-3 py-1.5 outline-none focus:border-brand sm:w-64"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead className="border-b border-line text-sm text-ink-3">
            <tr>
              <th className="px-4 py-2.5 font-normal">Client</th>
              <th className="px-4 py-2.5 font-normal">Status</th>
              <th className="px-4 py-2.5 font-normal">Segment</th>
              <th className="px-4 py-2.5 text-right font-normal">Assets at bank</th>
              <th className="px-4 py-2.5 text-right font-normal">Loans</th>
              <th className="px-4 py-2.5 font-normal">Financial health</th>
              <th className="px-4 py-2.5 font-normal">Open recommendations</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-3">
                  Loading…
                </td>
              </tr>
            )}
            {visible.map(({ client, assets, debt, health, openRecs, highRecs, requests }) => (
              <tr key={client.id} className="border-b border-line last:border-0 hover:bg-page/60">
                <td className="px-4 py-3">
                  <Link to="/advisor/clients/$clientId" params={{ clientId: client.id }} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-light text-sm font-semibold text-brand">
                      {initials(client.full_name)}
                    </span>
                    <span>
                      <span className="block font-medium hover:underline">{client.full_name}</span>
                      <span className="text-sm text-ink-3">
                        {[age(client.date_of_birth) && `${age(client.date_of_birth)} y`, client.city, client.occupation]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={client.status === "customer" ? "brand" : "accent"}>
                      {client.status === "customer" ? "Customer" : "Prospect"}
                    </Badge>
                    {requests > 0 && (
                      <Badge tone="accent">
                        {requests} appointment request{requests > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-2">{client.segment ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {client.status === "customer" ? formatEur(assets) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-ink-2 tabular-nums">{debt ? formatEur(debt) : "—"}</td>
                <td className="px-4 py-3">
                  <HealthScore score={health} />
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {openRecs > 0 ? `${openRecs}${highRecs ? ` (${highRecs} high priority)` : ""}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EmployeeShell>
  )
}

function NewProspect({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="card mb-5 flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const id = crypto.randomUUID()
        const { error } = await supabase
          .from("clients")
          .insert({ id, full_name: name.trim(), email: email.trim() || null, status: "prospect" })
        if (error) return setError(error.message)
        navigate({ to: "/advisor/clients/$clientId", params: { clientId: id } })
      }}
    >
      <label className="flex flex-col text-sm text-ink-2">
        Full name
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-lg border border-line px-3 py-1.5 text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col text-sm text-ink-2">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 rounded-lg border border-line px-3 py-1.5 text-ink outline-none focus:border-brand"
        />
      </label>
      <button className="rounded-lg bg-brand px-4 py-2 text-white">Create</button>
      <button type="button" onClick={onCancel} className="px-2 py-2 text-ink-2">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-critical">{error}</p>}
    </form>
  )
}
