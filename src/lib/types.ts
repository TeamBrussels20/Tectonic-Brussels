export interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  city: string | null
  status: "customer" | "prospect"
  segment: string | null
  occupation: string | null
  employment_type: string | null
  annual_gross_income: number | null
  monthly_net_income: number | null
  marital_status: string | null
  dependents: number | null
  housing: string | null
  risk_profile: "conservative" | "balanced" | "dynamic" | "unknown"
  investment_horizon_years: number | null
  customer_since: string | null
  notes: string | null
}

export interface Account {
  id: string
  client_id: string
  type: "current" | "savings" | "investment" | "pension"
  name: string
  iban: string | null
  balance: number
  interest_rate: number | null
}

export interface Transaction {
  id: number
  booked_on: string
  amount: number
  category: string
  description: string
}

export interface Holding {
  id: string
  name: string
  asset_class: string
  market_value: number
  cost_basis: number | null
}

export interface Loan {
  id: string
  client_id: string
  type: string
  outstanding: number
  interest_rate: number
  monthly_payment: number
  end_date: string | null
}

export interface Goal {
  id: string
  title: string
  target_amount: number | null
  current_amount: number
  target_date: string | null
  priority: "high" | "medium" | "low"
}

export interface Assessment {
  client_id: string
  summary: string
  health_score: number
  strengths: string[]
  risks: string[]
  missing_information: string[]
  generated_at: string
}

export interface Recommendation {
  id: string
  client_id: string
  title: string
  category: string
  priority: "high" | "medium" | "low"
  rationale: string
  next_step: string
  product_code: string | null
  estimated_annual_impact: number | null
  status: "proposed" | "accepted" | "dismissed"
  created_at: string
}

// Appointment requested by the customer from Kompass, with the conversation summary.
export interface Handoff {
  id: string
  client_id: string
  reference: string
  topic: string
  summary: string
  status: "open" | "done"
  created_at: string
}

export interface Product {
  code: string
  name: string
  category: string
}
