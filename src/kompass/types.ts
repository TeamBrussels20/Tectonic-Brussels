// Shapes returned by the Kompass API (server/kompass).

export interface Status {
  mode: "claude" | "demo"
  model: string | null
}

export interface CustomerSummary {
  id: string
  name: string
  age: number | null
  city: string | null
}

export interface Account {
  type: "courant" | "epargne" | "placement" | "pension" | "credit"
  name: string
  balance: number
}

export interface Signal {
  id: string
  family: "situation" | "comportement" | "intention"
  title: string
  detail: string
  source: string
  tone?: "warn"
  documentId?: string
}

export interface Field {
  label: string
  value: string
}

export interface Doc {
  id: string
  name: string
  type: string
  typeLabel: string
  fields: Field[]
  observations: string[]
  analyzedBy: "claude" | "regles"
}

export interface Profile {
  customer: {
    id: string
    firstName: string
    lastName: string
    age: number | null
    city: string | null
    household: string
    accounts: Account[]
  }
  metrics: { avgIncome: number; avgSpending: number }
  signals: Signal[]
  lifeMoment: { label: string; why: string }
  nudge: { title: string; body: string; prompt: string } | null
  documents: Doc[]
}

export interface Answer {
  heading: string
  reply: string
  insights?: { label: string; value: string; tone?: "good" | "warn" | "neutral" }[]
  simulation?: { title: string; rows: Field[]; note?: string } | null
  notes?: string[] | null
  checklist?: { label: string; done: boolean; note?: string }[] | null
  steps?: { title: string; detail: string }[]
  products?: { name: string; why: string }[]
  handoff?: { needed: boolean; reason: string; topic: string }
  followups?: string[]
}

export type Message =
  | { role: "user"; content: string; documentId?: string; attachment?: { name: string; typeLabel: string } }
  | { role: "assistant"; answer: Answer; source: string }

export type Consent = Record<string, boolean>
