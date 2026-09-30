const ADVISOR_URL = "/api/advisor"

export type AdvisorMode = "client" | "employee" | "analyze"

export type AdvisorEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "saved"; kind: "assessment" | "recommendation" | "profile" | "goal" }
  | { type: "error"; message: string }
  | { type: "done" }

// Calls the AI advisor on the server and yields its newline-delimited JSON events.
export async function* streamAdvisor(body: {
  clientId: string
  mode: AdvisorMode
  message?: string
  conversationId?: string
}): AsyncGenerator<AdvisorEvent> {
  const res = await fetch(ADVISOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    yield { type: "error", message: `Advisor unavailable (${res.status})` }
    return
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as AdvisorEvent
  }
}
