import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import type {
  Account,
  Assessment,
  Client,
  Goal,
  Handoff,
  Holding,
  Loan,
  Product,
  Recommendation,
  Transaction,
} from "./types"

export interface ClientData {
  client: Client
  accounts: Account[]
  transactions: Transaction[]
  holdings: Holding[]
  loans: Loan[]
  goals: Goal[]
  assessment: Assessment | null
  recommendations: Recommendation[]
  handoffs: Handoff[]
  products: Record<string, Product>
}

export function useClientData(clientId: string) {
  const [data, setData] = useState<ClientData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const byClient = <T>(table: string, columns = "*") =>
      supabase.from(table).select(columns).eq("client_id", clientId).returns<T[]>()
    const [client, accounts, transactions, holdings, loans, goals, assessment, recommendations, handoffs, products] =
      await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single<Client>(),
        byClient<Account>("accounts"),
        byClient<Transaction>("transactions").order("booked_on"),
        byClient<Holding>("holdings"),
        byClient<Loan>("loans"),
        byClient<Goal>("goals").order("created_at"),
        supabase.from("assessments").select("*").eq("client_id", clientId).maybeSingle<Assessment>(),
        byClient<Recommendation>("recommendations").order("created_at"),
        byClient<Handoff>("handoffs").order("created_at", { ascending: false }),
        supabase.from("products").select("code, name, category").returns<Product[]>(),
      ])
    const failed = [
      client,
      accounts,
      transactions,
      holdings,
      loans,
      goals,
      assessment,
      recommendations,
      handoffs,
      products,
    ].find((r) => r.error)
    if (failed?.error) {
      setError(failed.error.message)
      return
    }
    setData({
      client: client.data!,
      accounts: accounts.data!,
      transactions: transactions.data!,
      holdings: holdings.data!,
      loans: loans.data!,
      goals: goals.data!,
      assessment: assessment.data,
      recommendations: recommendations.data!,
      handoffs: handoffs.data!,
      products: Object.fromEntries(products.data!.map((p) => [p.code, p])),
    })
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  return { data, error, reload: load }
}

// Monthly totals and average spend per category over the full months in the data.
export function summarizeTransactions(transactions: Transaction[]) {
  const months = new Map<string, { income: number; spending: number }>()
  const categories = new Map<string, number>()
  for (const t of transactions) {
    const month = t.booked_on.slice(0, 7)
    const m = months.get(month) ?? { income: 0, spending: 0 }
    if (t.amount > 0) m.income += Number(t.amount)
    else {
      m.spending -= Number(t.amount)
      categories.set(t.category, (categories.get(t.category) ?? 0) - Number(t.amount))
    }
    months.set(month, m)
  }
  const n = months.size || 1
  const monthly = [...months].map(([month, v]) => ({ month, ...v }))
  const avgIncome = monthly.reduce((s, m) => s + m.income, 0) / n
  const avgSpending = monthly.reduce((s, m) => s + m.spending, 0) / n
  return {
    monthly,
    avgIncome,
    avgSpending,
    byCategory: [...categories]
      .map(([category, total]) => ({ category, value: total / n }))
      .sort((a, b) => b.value - a.value),
  }
}
