import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

// Every tool is scoped to the client of the current request: the model never
// chooses which client's data it reads or writes.
export interface ToolContext {
  db: SupabaseClient
  clientId: string
  // Lets the UI refresh the relevant dashboard panel as soon as data changes.
  notify: (kind: "assessment" | "recommendation" | "profile" | "goal") => void
}

interface ToolDef<S extends z.ZodTypeAny> {
  description: string
  label: string
  schema: S
  jsonSchema: Record<string, unknown>
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>
}

function tool<S extends z.ZodTypeAny>(def: ToolDef<S>) {
  return def
}

const empty = { type: "object", properties: {}, additionalProperties: false }

// Unwraps a query result. Without an error, `data` is only null for maybeSingle() with no row.
async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

function ageFrom(dob: string | null) {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0)
}

const round = (n: number) => Math.round(n * 100) / 100

const clientFields = z
  .object({
    occupation: z.string(),
    employment_type: z.enum(["employee", "self_employed", "civil_servant", "student", "retired", "unemployed"]),
    annual_gross_income: z.number(),
    monthly_net_income: z.number(),
    marital_status: z.string(),
    dependents: z.number().int(),
    housing: z.enum(["owner", "renter", "with_parents", "other"]),
    risk_profile: z.enum(["conservative", "balanced", "dynamic", "unknown"]),
    investment_horizon_years: z.number().int(),
    city: z.string(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    phone: z.string(),
  })
  .partial()

export const TOOLS = {
  get_client_overview: tool({
    description:
      "Get the client's profile (age, job, income, household, risk profile), all accounts and balances, investment holdings, loans, financial goals, the latest saved assessment, existing recommendations, signals observed in the Kompass customer app (app activity, life events) and appointment requests the client made from Kompass. Call this first in every conversation.",
    label: "Reviewing client profile",
    schema: z.object({}),
    jsonSchema: empty,
    run: async (_input, { db, clientId }) => {
      const [client, accounts, holdings, loans, goals, assessment, recommendations, signals, appointmentRequests] = await Promise.all([
        must(db.from("clients").select("*").eq("id", clientId).single()),
        must(db.from("accounts").select("type, name, balance, interest_rate").eq("client_id", clientId)),
        must(db.from("holdings").select("name, asset_class, market_value, cost_basis").eq("client_id", clientId)),
        must(db.from("loans").select("type, outstanding, interest_rate, monthly_payment, end_date").eq("client_id", clientId)),
        must(db.from("goals").select("title, target_amount, current_amount, target_date, priority").eq("client_id", clientId)),
        must(db.from("assessments").select("summary, health_score, generated_at").eq("client_id", clientId).maybeSingle()),
        must(
          db
            .from("recommendations")
            .select("title, priority, status, product_code, created_at")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
        ),
        must(db.from("client_events").select("kind, title, detail, count, occurred_on").eq("client_id", clientId)),
        must(
          db
            .from("handoffs")
            .select("reference, topic, summary, status, created_at")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
        ),
      ])
      const assets = accounts.reduce((s: number, a: { balance: number }) => s + Number(a.balance), 0)
      const debt = loans.reduce((s: number, l: { outstanding: number }) => s + Number(l.outstanding), 0)
      return {
        client: { ...client, age: ageFrom(client.date_of_birth) },
        totals: { assets, debt, net_worth: assets - debt },
        accounts,
        holdings,
        loans,
        goals,
        latest_assessment: assessment,
        recommendations,
        kompass_signals: signals,
        appointment_requests: appointmentRequests,
      }
    },
  }),

  analyze_cashflow: tool({
    description:
      "Analyse the client's bank transactions: income and spending per month, average monthly spending per category, recurring payments (subscriptions, loans, rent) and savings rate. Only available for existing customers with accounts at the bank.",
    label: "Analysing cash flow",
    schema: z.object({ months: z.number().int().min(1).max(12).optional() }),
    jsonSchema: {
      type: "object",
      properties: { months: { type: "integer", description: "How many recent months to analyse (default 6)." } },
      additionalProperties: false,
    },
    run: async ({ months = 6 }, { db, clientId }) => {
      const since = new Date()
      since.setMonth(since.getMonth() - months, 1)
      const tx: { booked_on: string; amount: number; category: string; description: string }[] = await must(
        db
          .from("transactions")
          .select("booked_on, amount, category, description")
          .eq("client_id", clientId)
          .gte("booked_on", since.toISOString().slice(0, 10))
          .order("booked_on"),
      )
      if (tx.length === 0) return { note: "No transaction data at this bank for this client." }

      const byMonth = new Map<string, { income: number; spending: number }>()
      const byCategory = new Map<string, number>()
      const byDescription = new Map<string, { months: Set<string>; amounts: number[]; category: string }>()
      for (const t of tx) {
        const month = t.booked_on.slice(0, 7)
        const m = byMonth.get(month) ?? { income: 0, spending: 0 }
        const amount = Number(t.amount)
        if (amount > 0) m.income += amount
        else m.spending -= amount
        byMonth.set(month, m)
        if (amount < 0) {
          byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - amount)
          const d = byDescription.get(t.description) ?? { months: new Set(), amounts: [], category: t.category }
          d.months.add(month)
          d.amounts.push(-amount)
          byDescription.set(t.description, d)
        }
      }
      const n = byMonth.size
      const monthly = [...byMonth].map(([month, m]) => ({
        month,
        income: round(m.income),
        spending: round(m.spending),
        net: round(m.income - m.spending),
      }))
      const totalIncome = monthly.reduce((s, m) => s + m.income, 0)
      const totalSpending = monthly.reduce((s, m) => s + m.spending, 0)
      const incomes = monthly.map((m) => m.income)
      return {
        months_analysed: n,
        monthly,
        average_monthly_income: round(totalIncome / n),
        average_monthly_spending: round(totalSpending / n),
        income_min_max: [Math.min(...incomes), Math.max(...incomes)],
        savings_rate_pct: totalIncome ? round(((totalIncome - totalSpending) / totalIncome) * 100) : null,
        note: "Spending includes transfers to own savings/investments (category savings_transfer).",
        average_monthly_by_category: Object.fromEntries(
          [...byCategory].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, round(v / n)]),
        ),
        // Paid every month with a stable amount (within 25%).
        recurring_payments: [...byDescription]
          .filter(([, d]) => d.months.size === n && Math.max(...d.amounts) <= Math.min(...d.amounts) * 1.25)
          .map(([description, d]) => ({
            description,
            category: d.category,
            average: round(d.amounts.reduce((a, b) => a + b, 0) / d.amounts.length),
          })),
      }
    },
  }),

  search_transactions: tool({
    description: "List individual transactions, optionally filtered by category or a text match on the description.",
    label: "Looking at transactions",
    schema: z.object({ category: z.string().optional(), text: z.string().optional(), limit: z.number().int().max(200).optional() }),
    jsonSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. groceries, dining, subscriptions, income, loans, housing" },
        text: { type: "string", description: "Case-insensitive match on description" },
        limit: { type: "integer", description: "Max rows (default 50)" },
      },
      additionalProperties: false,
    },
    run: async ({ category, text, limit = 50 }, { db, clientId }) => {
      let q = db
        .from("transactions")
        .select("booked_on, amount, category, description")
        .eq("client_id", clientId)
        .order("booked_on", { ascending: false })
        .limit(limit)
      if (category) q = q.eq("category", category)
      if (text) q = q.ilike("description", `%${text}%`)
      return await must(q)
    },
  }),

  list_bank_products: tool({
    description:
      "List the bank's product catalogue with indicative terms, risk level (1-7) and who each product suits. Only recommend products from this list.",
    label: "Checking product catalogue",
    schema: z.object({
      category: z.enum(["savings", "investment", "pension", "lending", "insurance", "banking"]).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["savings", "investment", "pension", "lending", "insurance", "banking"] },
      },
      additionalProperties: false,
    },
    run: async ({ category }, { db }) => {
      let q = db.from("products").select("*").order("category")
      if (category) q = q.eq("category", category)
      return await must(q)
    },
  }),

  update_client_profile: tool({
    description:
      "Record facts the client has told you about themselves (income, job, household, housing, risk appetite, horizon...). Only save information the client stated explicitly. Use it as soon as you learn something new so the bank's records stay current.",
    label: "Updating client profile",
    schema: clientFields.extend({ note: z.string().optional() }),
    jsonSchema: {
      type: "object",
      properties: {
        occupation: { type: "string" },
        employment_type: { type: "string", enum: ["employee", "self_employed", "civil_servant", "student", "retired", "unemployed"] },
        annual_gross_income: { type: "number", description: "EUR per year" },
        monthly_net_income: { type: "number", description: "EUR per month" },
        marital_status: { type: "string" },
        dependents: { type: "integer" },
        housing: { type: "string", enum: ["owner", "renter", "with_parents", "other"] },
        risk_profile: { type: "string", enum: ["conservative", "balanced", "dynamic", "unknown"] },
        investment_horizon_years: { type: "integer" },
        city: { type: "string" },
        date_of_birth: { type: "string", description: "YYYY-MM-DD" },
        phone: { type: "string" },
        note: { type: "string", description: "Other relevant facts to append to the advisor notes (e.g. assets held at other banks)." },
      },
      additionalProperties: false,
    },
    run: async ({ note, ...fields }, { db, clientId, notify }) => {
      const update: Record<string, unknown> = { ...fields }
      if (note) {
        const { notes } = await must(db.from("clients").select("notes").eq("id", clientId).single())
        const stamp = new Date().toISOString().slice(0, 10)
        update.notes = [notes, `[${stamp}] ${note}`].filter(Boolean).join("\n")
      }
      await must(db.from("clients").update(update).eq("id", clientId))
      notify("profile")
      return { saved: Object.keys(update) }
    },
  }),

  add_goal: tool({
    description: "Record a financial goal the client has expressed.",
    label: "Saving goal",
    schema: z.object({
      title: z.string(),
      target_amount: z.number().optional(),
      current_amount: z.number().optional(),
      target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      priority: z.enum(["high", "medium", "low"]).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        target_amount: { type: "number", description: "EUR" },
        current_amount: { type: "number", description: "EUR already saved towards it" },
        target_date: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["title"],
      additionalProperties: false,
    },
    run: async (goal, { db, clientId, notify }) => {
      await must(db.from("goals").insert({ ...goal, client_id: clientId }))
      notify("goal")
      return { saved: true }
    },
  }),

  save_assessment: tool({
    description:
      "Save your overall assessment of the client's financial situation for the bank employee's dashboard. Replaces the previous assessment.",
    label: "Saving assessment",
    schema: z.object({
      summary: z.string(),
      health_score: z.number().int().min(0).max(100),
      strengths: z.array(z.string()),
      risks: z.array(z.string()),
      missing_information: z.array(z.string()),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "3-5 sentences a bank employee can read in 20 seconds." },
        health_score: {
          type: "integer",
          description:
            "0-100 financial health: emergency buffer, debt burden, savings rate, goal progress, diversification vs. horizon.",
        },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        missing_information: {
          type: "array",
          items: { type: "string" },
          description: "What the advisor should still ask the client.",
        },
      },
      required: ["summary", "health_score", "strengths", "risks", "missing_information"],
      additionalProperties: false,
    },
    run: async (a, { db, clientId, notify }) => {
      await must(db.from("assessments").upsert({ ...a, client_id: clientId, generated_at: new Date().toISOString() }))
      notify("assessment")
      return { saved: true }
    },
  }),

  save_recommendation: tool({
    description:
      "Save one concrete, personalised recommendation to the bank employee's dashboard. Call once per recommendation.",
    label: "Saving recommendation",
    schema: z.object({
      title: z.string(),
      category: z.enum(["budgeting", "savings", "debt", "investment", "pension", "protection", "lending", "banking"]),
      priority: z.enum(["high", "medium", "low"]),
      rationale: z.string(),
      next_step: z.string(),
      product_code: z.string().nullable().optional(),
      estimated_annual_impact: z.number().nullable().optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short action-oriented title, e.g. 'Move EUR 10k idle cash to Term Deposit'" },
        category: {
          type: "string",
          enum: ["budgeting", "savings", "debt", "investment", "pension", "protection", "lending", "banking"],
        },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        rationale: { type: "string", description: "Why, grounded in the client's actual numbers." },
        next_step: { type: "string", description: "What the employee should do or propose in the next conversation." },
        product_code: { type: ["string", "null"], description: "Code from list_bank_products, if a product fits." },
        estimated_annual_impact: {
          type: ["number", "null"],
          description: "Rough EUR/year benefit (interest saved or earned, tax benefit); null if not quantifiable.",
        },
      },
      required: ["title", "category", "priority", "rationale", "next_step"],
      additionalProperties: false,
    },
    run: async (r, { db, clientId, notify }) => {
      if (r.product_code) {
        const product = await must(db.from("products").select("code").eq("code", r.product_code).maybeSingle())
        if (!product) throw new Error(`Unknown product_code ${r.product_code}; use a code from list_bank_products.`)
      }
      await must(db.from("recommendations").insert({ ...r, client_id: clientId }))
      notify("recommendation")
      return { saved: true }
    },
  }),
}

export type ToolName = keyof typeof TOOLS

export const toolDefinitions = (names: ToolName[]): Anthropic.Beta.BetaTool[] =>
  names.map((name) => ({
    name,
    description: TOOLS[name].description,
    input_schema: TOOLS[name].jsonSchema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }))

export async function runTool(block: Anthropic.Beta.BetaToolUseBlock, ctx: ToolContext) {
  const def = TOOLS[block.name as ToolName]
  if (!def) return { content: `Unknown tool ${block.name}`, is_error: true }
  // Eager input streaming skips server-side validation, so validate here.
  const parsed = def.schema.safeParse(block.input)
  if (!parsed.success) {
    return { content: JSON.stringify({ INVALID_INPUT: parsed.error.issues }), is_error: true }
  }
  try {
    // deno-lint-ignore no-explicit-any
    const result = await def.run(parsed.data as any, ctx)
    return { content: JSON.stringify(result), is_error: false }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), is_error: true }
  }
}
