import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { streamAdvisor, type AdvisorEvent } from "../lib/advisor"
import { supabase } from "../lib/supabaseClient"

interface Item {
  role: "user" | "assistant"
  text: string
  tools: string[]
  error?: boolean
}

const TOOL_LABELS: Record<string, string> = {
  get_client_overview: "Reviewing client profile",
  analyze_cashflow: "Analysing cash flow",
  search_transactions: "Looking at transactions",
  list_bank_products: "Checking product catalogue",
  update_client_profile: "Updating client profile",
  add_goal: "Saving goal",
  save_assessment: "Saving assessment",
  save_recommendation: "Saving recommendation",
}

type StoredBlock = { type: string; text?: string; name?: string }
type StoredMessage = { role: "user" | "assistant"; content: string | StoredBlock[] }

// Rebuilds chat bubbles from the stored Claude message history (tool results are hidden).
function toItems(messages: StoredMessage[]): Item[] {
  const items: Item[] = []
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") items.push({ role: "user", text: m.content, tools: [] })
      continue
    }
    let last = items.at(-1)
    if (!last || last.role !== "assistant") items.push((last = { role: "assistant", text: "", tools: [] }))
    for (const b of m.content as StoredBlock[]) {
      if (b.type === "text" && b.text) last.text += (last.text ? "\n\n" : "") + b.text
      if (b.type === "tool_use" && b.name) last.tools.push(TOOL_LABELS[b.name] ?? b.name)
    }
  }
  return items
}

export function Chat({
  clientId,
  mode,
  suggestions,
  placeholder,
  emptyState,
  onEvent,
}: {
  clientId: string
  mode: "client" | "employee"
  suggestions: string[]
  placeholder: string
  emptyState: React.ReactNode
  onEvent?: (e: AdvisorEvent) => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from("conversations")
      .select("id, messages")
      .eq("client_id", clientId)
      .eq("channel", mode)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setConversationId(data.id)
        setItems(toItems(data.messages))
      })
    return () => {
      cancelled = true
    }
  }, [clientId, mode])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [items])

  const updateLast = (f: (i: Item) => Item) => setItems((prev) => [...prev.slice(0, -1), f(prev.at(-1)!)])

  async function send(text: string) {
    if (!text.trim() || busy) return
    setInput("")
    setBusy(true)
    setItems((prev) => [...prev, { role: "user", text, tools: [] }, { role: "assistant", text: "", tools: [] }])
    try {
      for await (const e of streamAdvisor({ clientId, mode, message: text, conversationId })) {
        onEvent?.(e)
        if (e.type === "conversation") setConversationId(e.id)
        if (e.type === "text") updateLast((i) => ({ ...i, text: i.text + e.text }))
        if (e.type === "tool") updateLast((i) => ({ ...i, tools: [...i.tools, e.label] }))
        if (e.type === "error") updateLast((i) => ({ ...i, text: i.text + `\n\n${e.message}`, error: true }))
      }
    } catch (err) {
      updateLast((i) => ({ ...i, text: `Connection error: ${String(err)}`, error: true }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 && emptyState}
        {items.map((item, i) =>
          item.role === "user" ? (
            <div
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 whitespace-pre-wrap text-white"
            >
              {item.text}
            </div>
          ) : (
            <div key={i} className="mr-6">
              {item.tools.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {[...new Set(item.tools)].map((t) => (
                    <span key={t} className="rounded-full bg-brand-light px-2 py-0.5 text-xs text-brand">
                      ✓ {t}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={`markdown rounded-2xl rounded-bl-sm border px-3.5 py-2 ${item.error ? "border-critical/40 bg-critical/5" : "border-line bg-white"}`}
              >
                {item.text.trim() ? (
                  <Markdown>{item.text}</Markdown>
                ) : (
                  <span className="text-ink-3">{busy && i === items.length - 1 ? "Thinking…" : ""}</span>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {items.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-2 hover:border-brand hover:text-brand"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 border-t border-line bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 outline-none focus:border-brand"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
        {items.length > 0 && (
          <button
            type="button"
            disabled={busy}
            title="Start a new conversation"
            onClick={() => {
              setItems([])
              setConversationId(undefined)
            }}
            className="rounded-lg border border-line px-3 text-sm text-ink-2 hover:text-brand"
          >
            New
          </button>
        )}
      </form>
    </div>
  )
}
