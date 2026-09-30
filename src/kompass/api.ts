import type { Answer, Consent, CustomerSummary, Doc, Message, Profile, Status } from "./types"

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, options)
  } catch {
    throw new Error("Le serveur Kompass ne répond pas. Vérifiez que « npm run dev » tourne.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Le serveur Kompass a répondu ${res.status}.`)
  return data
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const api = {
  status: () => request<Status>("/api/status"),
  customers: () => request<CustomerSummary[]>("/api/customers"),
  profile: (id: string) => request<Profile>(`/api/customers/${id}/profile`),
  chat: (body: { customerId: string; messages: Message[]; consent: Consent }) =>
    request<{ answer: Answer; source: string }>("/api/chat", json(body)),
  uploadDocument: (customerId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<Doc>(`/api/customers/${customerId}/documents`, { method: "POST", body: form })
  },
  deleteDocument: (customerId: string, docId: string) =>
    request<{ ok: boolean }>(`/api/customers/${customerId}/documents/${docId}`, { method: "DELETE" }),
  handoff: (body: { customerId: string; topic: string; summary: string }) =>
    request<{ ok: boolean; ref: string }>("/api/handoff", json(body)),
}

export const eur = (n: number) => `${Math.round(n).toLocaleString("fr-BE")} €`

export const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.webp,.txt"
export const MAX_FILE_MB = 10
