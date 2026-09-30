# Kompass by KBC


> A financial guide that understands each customer's situation and helps them move forward, at the right time.

Kompass is a proof of concept built for the KBC challenge. Customers ask their question in their own words ("I want to take out a mortgage", "I want to save every month, help me") and Kompass answers from their real banking data: a direction, concrete figures, a roadmap of actions, and a handoff to an advisor when the decision calls for it.

Kompass does not replace the advisor. It lays the groundwork so that every appointment starts in the right place.

---

▶️ **[Watch the demo video](Demo.mp4)**

![Customer view](screenhots/Customer%20view.png)
![KBC Advisor View - Client List](screenhots/KBC%20Advisor%20View%20-%20Client%20List.png)
![KBC Advisor View - Client Profile](screenhots/KBC%20Advisor%20View%20-%20Client%20Profile.png)

The same app also contains the **advisor workspace** (`/advisor`): the bank employee's view of the same customers, with an AI assessment, prioritised recommendations, cash-flow charts, an advisor copilot, and the appointment requests customers send from Kompass.

## Running the project locally

Prerequisites: [Node.js](https://nodejs.org) 22.18 or newer, Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install

# 1. Database with the demo customers
npm run db:start      # supabase start
npm run db:reset      # applies supabase/migrations and supabase/seed.sql

# 2. Environment: copy the values printed by `supabase status`
cp .env.example .env              # SUPABASE_URL, SUPABASE_SECRET_KEY (+ optional ANTHROPIC_API_KEY)
cp .env.local.example .env.local  # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY

# 3. API (port 3001) + interface (port 5173)
npm run dev
```

Then open **http://localhost:5173** for the customer app, and **http://localhost:5173/advisor** for the advisor workspace.

### Demo mode or AI mode

Without an API key, Kompass runs in **demo mode**: a local rules engine detects the intent of the question and builds the answer from the customer's data, with no call to an AI service.

To enable Claude-generated answers, set `ANTHROPIC_API_KEY` in `.env` and restart `npm run dev`. The badge in the top right switches from "Mode démo" (demo mode) to "IA active" (AI active). If the API call fails, the server automatically falls back to demo mode, so the demo never crashes. The advisor workspace's AI features (analysis, copilot, prospect onboarding chat) require the key.

### Demo customers

Both views read the same Supabase database, so a customer's situation in Kompass is the one the advisor sees.

| Customer | Life moment in Kompass | Try in Kompass | Story for the advisor |
|---|---|---|---|
| Lotte Peeters, 29, Ghent | Preparing a first home purchase | « Je veux faire un prêt hypothécaire » ("I want to take out a mortgage") | €14.8k idle on the current account, savings at 0.75%, no pension savings |
| Karim El Amrani, 38, Liège | Family budget under strain (3rd child) | « Mes fins de mois sont difficiles » ("I struggle to make ends meet") | Overdrawn most months, 0.6 months of buffer, car loan at 7.49% |
| Marc Dubois, 61, Namur | Approaching retirement | « Que faire de mon épargne ? » ("What should I do with my savings?") | ~€300k almost fully in equities, 2014 "dynamic" risk profile, idle cash |
| Jan Vermeulen, 45, Leuven | | | Spends almost all income, university fund behind, green renovation candidate |
| Amira El Idrissi, 33, Brussels | | | Irregular freelance income, credit card at 16.9%, no income protection |
| Lotte Janssens, Thomas Claes (prospects) | | | Little data: the onboarding chat fills in their profile |

The app and the demo engine work in French, so type the prompts in French. All data is fictitious.

Suggested demo: in Kompass, pick Karim, ask for help with the budget and click « Demander un rendez-vous ». Switch to the advisor workspace (top right): the request and its conversation summary are on Karim's dashboard. Click *Run AI analysis* to prepare the meeting.

### Adding documents

Click the paperclip to the left of the input field, or drag a file into the conversation. Accepted formats: PDF, PNG, JPG, WEBP and TXT, 10 MB maximum.

Kompass recognizes the document type (payslip, lease, loan agreement, employment contract, insurance, tax assessment notice), extracts the key data and compares it with the customer's accounts. For example, it checks that the net pay on the payslip matches the income received, or calculates the notice period of a lease. Each document becomes a signal the customer can turn off, and feeds the mortgage application checklist.

The `samples/` folder contains three fictitious documents for the demo:
- `fiche-de-paie-lotte-peeters-2026-09.pdf` (payslip) and `contrat-de-bail-lotte-peeters.pdf` (lease) for Lotte;
- `contrat-pret-auto-el-amrani.pdf` (car loan agreement) for Karim.

| | Demo mode | AI mode (API key) |
|---|---|---|
| PDF with text | Read, fields extracted by rules | Read by Claude |
| Scanned PDF or photo | Not read (no OCR) | Read by Claude |
| Recognized types | Payslip, lease, loan (detailed fields) | All, with personalized observations |

Documents stay in memory on the local API server and disappear when it restarts. In AI mode, they are sent to the Anthropic API for analysis: for a demo, use the fictitious documents in `samples/` rather than your real documents.

---

## The vision

Most banks personalize by pushing products to segments. Kompass flips the logic: **we start from what the customer is trying to achieve**, and the bank becomes the means to get there.

### 1. Signals to understand needs
Transactions already say almost everything: a rent that goes up, daycare fees that appear, savings sitting idle, a simulator opened three times. Kompass turns them into readable signals (`server/signals.js`).

### 2. Recognizing the customer by situation, behavior and intent
Each signal belongs to one of three families, shown as-is to the customer:
- **Situation**: what is true today (income, buffer, savings)
- **Behavior**: what is changing (6-month trends, negative month-ends)
- **Intent**: what the customer is preparing (searches in the app, life events)

These signals combine into an understandable **life moment** ("Preparing a first home purchase"), never into an opaque score.

### 3. An experience that adapts on its own
The same screen becomes a home-buying aid for Lotte, a budget breathing-room plan for Karim and a retirement preparation for Marc. Kompass also takes the initiative **only once, at the right time**: a proactive message anchored in a real fact ("your rent went up 7% this summer").

### 4. Seamless across products, services and channels
Every answer can end with a handoff to an advisor. The advisor receives the conversation summary: the customer has nothing to re-explain. The same engine can power the app, the website, the existing chatbot and the advisor's screen in the branch.

### 5. The advisor picks up where Kompass left off
An appointment request lands in the advisor workspace with the conversation summary. The advisor AI (Claude with tools scoped to one client per request) reads the same data, including Kompass's signals and requests, to prepare an assessment, recommendations tied to the bank's product catalogue, talking points and follow-up emails.

### 6. Impact for 2.3 million customers at once
- Signals are computed by deterministic code, cheap and auditable, in a nightly batch for all customers.
- The language model only steps in to phrase the answer when the customer asks a question.
- The customer controls every signal (toggle in the left panel). Trust is a condition for scale, not a constraint.

---

## Architecture

```
React (Vite, TanStack Router, TypeScript)
  /                         Kompass, customer app (plain CSS)
  /advisor                  Advisor workspace: client list (Tailwind)
  /advisor/clients/:id      Client dashboard + advisor copilot
  /chat/:id                 Onboarding chat for prospects
   │  /api (Vite proxy)                    │  reads directly (publishable key, demo RLS)
   ▼                                       ▼
Express API (server/) ──── secret key ───► Supabase Postgres
  Kompass: profile, signals, chat,          clients, accounts, transactions, holdings,
  documents, appointment requests           loans, goals, products, assessments,
  /api/advisor: Claude agent loop,          recommendations, conversations,
  streamed as NDJSON                        client_events, handoffs
```

```
kompass/
├── server/
│   ├── index.js              Express API (Kompass routes + /api/advisor)
│   ├── db.js                 Supabase client (secret key, server only)
│   ├── kompass/
│   │   ├── customers.js      Builds Kompass's view of a customer from the database
│   │   ├── signals.js        Signals engine, life moment, proactive message
│   │   ├── prompt.js         System prompt sent to Claude (allowed signals only)
│   │   ├── mockAdvisor.js    AI-free demo engine, same response format as Claude
│   │   └── documents.js      Upload, PDF reading, classification, extraction, analysis by Claude
│   └── advisor/
│       ├── agent.ts          Claude agent loop: modes client / employee / analyze
│       └── tools.ts          Tools scoped to one client (read data, save assessment, recommendations…)
├── src/
│   ├── routes/               File-based routes (TanStack Router)
│   ├── kompass/              Customer app components and kompass.css
│   ├── advisor/              Advisor workspace components (charts, copilot chat, shell)
│   └── lib/                  Supabase client, types, formatting, advisor stream
├── supabase/
│   ├── migrations/           Advisor schema + Kompass signals and appointment requests
│   └── seed.sql              Demo customers, 6 months of transactions, product catalogue
├── samples/                  Fictitious documents for the demo
└── vite.config.ts
```

**Flow of a question in Kompass**

```
Customer question
      │
      ▼
Profile + signals (deterministic, from the database) ──► filtered by the customer's consent
      │
      ▼
Claude (or demo engine) ──► structured JSON response
      │
      ▼
Interface: direction · figures · simulation · roadmap · products · advisor
```

The response is always a JSON object (`heading`, `reply`, `insights`, `simulation`, `notes`, `checklist`, `steps`, `products`, `handoff`, `followups`), which makes it possible to display rich components rather than plain text.

**Advisor agent tools** (`server/advisor/tools.ts`)

| Tool | Purpose |
|---|---|
| `get_client_overview` | Profile, accounts, holdings, loans, goals, previous assessment, Kompass signals and appointment requests |
| `analyze_cashflow` | Monthly income vs spend, per-category averages, recurring payments, savings rate |
| `search_transactions` | Drill into individual transactions |
| `list_bank_products` | Product catalogue (the agent may only recommend these) |
| `update_client_profile`, `add_goal` | Record facts the client shares in chat |
| `save_assessment`, `save_recommendation` | Write AI output to the advisor dashboard |

The client ID is injected on the server, so the model can't read or write another client's data.

### Scaling up (beyond the PoC)
- Feed the `transactions` and `client_events` tables from the KBC data lake (categorized transactions, app analytics).
- Compute signals in batch and store them in a feature store.
- Connect the `handoffs` table to the advisors' CRM.
- Security: the demo RLS policies let anyone holding the publishable key read all data, and the API has no authentication. Add employee authentication (Supabase Auth plus role-based RLS) and customer authentication before using real data.
- Store documents in the KBC digital vault (encrypted), with a retention period and deletion on request.
- Add evaluation: answer quality, advisor handoff rate, satisfaction.
- Compliance: response logging, MiFID guardrails for anything related to investments.

---

First create an empty repository named `kompass` on github.com (without a README). The `.env` and `.env.local` files are ignored by `.gitignore`: your keys will never be published.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Starts the API (port 3001) and the interface (port 5173) |
| `npm run db:start` / `npm run db:reset` | Starts the local Supabase stack / recreates the database from migrations and seed |
| `npm run build` | Type-checks and builds the interface into `dist/` |
| `npm start` | Serves the API and the built interface on http://localhost:3001 |
| `npm run lint` | Lints with oxlint |

---

Kompass gives guidance, not financial advice. Hackathon project, not officially affiliated with KBC.
