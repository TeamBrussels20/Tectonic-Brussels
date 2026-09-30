import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Chat } from "../advisor/Chat"
import { supabase } from "../lib/supabaseClient"

export const Route = createFileRoute("/chat/$clientId")({
  component: ClientChat,
})

// What the customer or prospect sees in the bank's app.
function ClientChat() {
  const { clientId } = Route.useParams()
  const [client, setClient] = useState<{ full_name: string; status: string } | null>(null)

  useEffect(() => {
    supabase
      .from("clients")
      .select("full_name, status")
      .eq("id", clientId)
      .single()
      .then(({ data }) => setClient(data))
  }, [clientId])

  const firstName = client?.full_name.split(" ")[0]
  const suggestions =
    client?.status === "prospect"
      ? [
          "I'd like to start saving but don't know where to begin",
          "Can you help me plan to buy a home?",
          "What should I do with my savings?",
        ]
      : ["How am I doing financially?", "Where can I save money each month?", "Should I start investing?"]

  return (
    <div className="flex h-screen justify-center bg-page sm:py-6">
      <div className="flex w-full max-w-md flex-col overflow-hidden bg-white sm:rounded-3xl sm:border sm:border-line sm:shadow-xl">
        <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
          <img src="/kbc.svg" alt="" className="h-8 rounded bg-white p-0.5" />
          <div>
            <div className="font-semibold">Your money coach</div>
            <div className="text-xs text-white/70">AI assistant · a human advisor can take over anytime</div>
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-page">
          {client && (
            <Chat
              clientId={clientId}
              mode="client"
              placeholder="Type a message…"
              suggestions={suggestions}
              emptyState={
                <div className="rounded-2xl border border-line bg-white p-4">
                  <p className="font-medium">Hi {firstName} 👋</p>
                  <p className="mt-1 text-ink-2">
                    I can look at your finances with you and suggest concrete next steps — saving, investing, loans or
                    planning for a big goal. What's on your mind?
                  </p>
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}
