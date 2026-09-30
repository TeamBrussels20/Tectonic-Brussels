// AI financial advisor. POST /api/advisor { clientId, mode, message?, conversationId? }
//   mode "client"   – onboarding chat with a prospect
//   mode "employee" – copilot chat for the bank employee about this client
//   mode "analyze"  – one-shot: assess the client and save recommendations to the dashboard
// Emits events that the server streams to the browser as newline-delimited JSON.
import Anthropic from "@anthropic-ai/sdk"
import { db } from "../db.js"
import { runTool, toolDefinitions, TOOLS, type ToolContext, type ToolName } from "./tools.ts"

const MODEL = "claude-opus-5-5"

export type Mode = "client" | "employee" | "analyze"
export const MODES: Mode[] = ["client", "employee", "analyze"]

const BASE = `You are the AI financial advisor of a Belgian retail bank. You have tool access to the bank's data about one specific client and to the bank's product catalogue. Amounts are in EUR. Today is ${new Date().toISOString().slice(0, 10)}.

Principles:
- Ground every statement in the client's actual data. Look it up with tools rather than assuming; quote concrete numbers.
- Think like a good human advisor: first the basics (emergency buffer of 3-6 months of expenses, expensive debt), then goals, then optimisation (idle cash, investing, pension savings, protection). Match investment advice to the client's risk profile, horizon and knowledge; if the risk profile is unknown or clearly outdated, say that a suitability assessment is needed before investing.
- Only propose products that exist in list_bank_products. Rates and terms there are indicative.
- Be honest about trade-offs and risks. Never promise returns.`

const PROMPTS: Record<Mode, string> = {
  client: `${BASE}

You are chatting directly with the client in the bank's app. Address them by first name, warmly and in plain language (no jargon, short paragraphs, light markdown). Reply in the language the client writes in.
- Start by calling get_client_overview so you know who you're talking to. Never ask for information the bank already has.
- If important information is missing (typical for prospects), ask for it conversationally, one or two questions at a time, and save what they tell you with update_client_profile and add_goal.
- When you give a concrete suggestion that a bank employee should follow up on, also save it with save_recommendation.
- You give guidance, not binding investment advice: for investment products, mention that a short suitability questionnaire or a meeting with an advisor completes the process, and offer to arrange it.`,

  employee: `${BASE}

You are a copilot for a bank employee (relationship manager) preparing for or following up on a conversation with this client. Be concise and analytical: bullet points, numbers, and clear next steps. You can draft talking points, emails or meeting agendas when asked. Save recommendations or assessments to the dashboard only when the employee asks you to.`,

  analyze: `${BASE}

A bank employee asked you to prepare this client's dashboard. Work autonomously:
1. Gather the data: get_client_overview, analyze_cashflow (for customers), list_bank_products.
2. Save your assessment with save_assessment.
3. Save 3-5 prioritised, specific recommendations with save_recommendation, each grounded in the client's numbers, with a concrete next step for the employee. For prospects with little data, focus on what to ask and the most likely needs.
Finish with a two-sentence summary of what you saved.`,
}

const TOOLSETS: Record<Mode, ToolName[]> = {
  client: [
    "get_client_overview",
    "analyze_cashflow",
    "search_transactions",
    "list_bank_products",
    "update_client_profile",
    "add_goal",
    "save_recommendation",
  ],
  employee: Object.keys(TOOLS) as ToolName[],
  analyze: [
    "get_client_overview",
    "analyze_cashflow",
    "search_transactions",
    "list_bank_products",
    "save_assessment",
    "save_recommendation",
  ],
}

export type Event =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "saved"; kind: string }
  | { type: "error"; message: string }
  | { type: "done" }

async function advise(
  mode: Mode,
  clientId: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  send: (e: Event) => void,
  persist: (messages: Anthropic.Beta.BetaMessageParam[]) => Promise<void>,
) {
  const anthropic = new Anthropic()
  const ctx: ToolContext = { db, clientId, notify: (kind) => send({ type: "saved", kind }) }
  const tools = toolDefinitions(TOOLSETS[mode])
  let jsonRetries = 0

  for (let turn = 0; turn < 25; turn++) {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: PROMPTS[mode],
      tools,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: mode === "analyze" ? "high" : "medium" },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      // Re-runs a safety-classifier refusal on Anthropic's recommended fallback model.
      fallbacks: "default",
    } as Anthropic.Beta.MessageCreateParamsStreaming)
    stream.on("text", (text) => send({ type: "text", text }))

    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (err) {
      // With eager input streaming, an unparseable tool input rejects here; retry that turn only.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err
      continue
    }

    if (message.stop_reason === "refusal") {
      send({ type: "text", text: "\n\nI can't help with that request. A bank advisor will be happy to assist you." })
      return
    }
    messages.push({ role: "assistant", content: message.content })

    if (message.stop_reason === "pause_turn") continue
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    if (toolUses.length === 0) break
    if (message.stop_reason === "max_tokens") throw new Error("Response was cut off (max_tokens)")

    const results = await Promise.all(
      toolUses.map(async (block) => {
        const def = TOOLS[block.name as ToolName]
        send({ type: "tool", name: block.name, label: def?.label ?? block.name })
        const { content, is_error } = await runTool(block, ctx)
        return { type: "tool_result" as const, tool_use_id: block.id, content, is_error }
      }),
    )
    messages.push({ role: "user", content: results })
    // Keep a text separator between tool rounds in the streamed reply.
    send({ type: "text", text: "\n\n" })
  }
  await persist(messages)
}

export async function runAdvisor(
  { clientId, mode, message, conversationId }: { clientId: string; mode: Mode; message?: string; conversationId?: string },
  send: (e: Event) => void,
) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env and restart the server.")
    }
    let messages: Anthropic.Beta.BetaMessageParam[] = []
    let persist = async (_: Anthropic.Beta.BetaMessageParam[]) => {}

    if (mode === "analyze") {
      await db.from("recommendations").delete().eq("client_id", clientId).eq("status", "proposed")
      messages = [{ role: "user", content: "Prepare the dashboard for this client." }]
    } else {
      // Conversations are append-only so earlier thinking blocks stay valid.
      let convo = conversationId
        ? (await db.from("conversations").select("id, messages").eq("id", conversationId).single()).data
        : null
      if (!convo) {
        const { data, error } = await db
          .from("conversations")
          .insert({ client_id: clientId, channel: mode })
          .select("id, messages")
          .single()
        if (error) throw new Error(error.message)
        convo = data
      }
      send({ type: "conversation", id: convo.id })
      messages = [...convo.messages, { role: "user", content: String(message ?? "") }]
      persist = async (m) => {
        await db
          .from("conversations")
          .update({ messages: m, updated_at: new Date().toISOString() })
          .eq("id", convo.id)
      }
    }

    await advise(mode, clientId, messages, send, persist)
    send({ type: "done" })
  } catch (err) {
    console.error("[Advisor]", err)
    const msg =
      err instanceof Anthropic.AuthenticationError
        ? "Anthropic API key missing or invalid. Set ANTHROPIC_API_KEY in .env."
        : err instanceof Anthropic.RateLimitError
          ? "The AI advisor is busy (rate limited). Please retry in a moment."
          : err instanceof Error
            ? err.message
            : String(err)
    send({ type: "error", message: msg })
  }
}
