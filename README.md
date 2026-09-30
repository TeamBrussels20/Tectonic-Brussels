# Kompass by KBC

![Customer view](screenhots/Customer%20view.png)
![KBC Advisor View - Client List](screenhots/KBC%20Advisor%20View%20-%20Client%20List.png)
![KBC Advisor View - Client Profile](screenhots/KBC%20Advisor%20View%20-%20Client%20Profile.png)

> A financial guide that understands each customer's situation and helps them move forward, at the right time.

Kompass is a proof of concept built for the KBC challenge. Customers ask their question in their own words ("I want to take out a mortgage", "I want to save every month, help me") and Kompass answers from their real banking data: a direction, concrete figures, a roadmap of actions, and a handoff to an advisor when the decision calls for it.

Kompass does not replace the advisor. It lays the groundwork so that every appointment starts in the right place.

---

## Running the project locally

Prerequisite: [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/<your-account>/kompass.git
cd kompass
npm install
npm run dev
```

Then open **http://localhost:5173**.

### Demo mode or AI mode

Without any configuration, Kompass runs in **demo mode**: a local rules engine detects the intent of the question and builds the answer from the customer's data. Everything works offline, ideal for a demo in front of a jury.

To enable Claude-generated answers:

```bash
cp .env.example .env
# then paste your key into .env: ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

The badge in the top right switches from "Mode démo" (demo mode) to "IA active" (AI active). If the API call fails, the server automatically falls back to demo mode, so the demo never crashes.

### Demo customers

| Customer | Life moment | Try |
|---|---|---|
| Lotte Peeters, 29, Ghent | Preparing a first home purchase | « Je veux faire un prêt hypothécaire » ("I want to take out a mortgage") |
| Karim El Amrani, 38, Liège | Family budget under strain (3rd child) | « Mes fins de mois sont difficiles » ("I struggle to make ends meet") |
| Marc Dubois, 61, Namur | Approaching retirement | « Que faire de mon épargne ? » ("What should I do with my savings?") |

The app and the demo engine work in French, so type the prompts in French. All data is fictitious.

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

Documents stay in memory on the local server and disappear when it restarts. In AI mode, they are sent to the Anthropic API for analysis: for a demo, use the fictitious documents in `samples/` rather than your real documents.

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

### 5. Impact for 2.3 million customers at once
- Signals are computed by deterministic code, cheap and auditable, in a nightly batch for all customers.
- The language model only steps in to phrase the answer when the customer asks a question.
- The customer controls every signal (toggle in the left panel). Trust is a condition for scale, not a constraint.

---

## Architecture

```
kompass/
├── server/
│   ├── index.js          Express API (profile, chat, appointments)
│   ├── signals.js        Signals engine, life moment, proactive message
│   ├── prompt.js         System prompt sent to Claude (allowed signals only)
│   ├── mockAdvisor.js    AI-free demo engine, same response format as Claude
│   ├── documents.js      Upload, PDF reading, classification, extraction, analysis by Claude
│   └── data/customers.js Fictitious customers (6 months of history)
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── ContextPanel.jsx   "What Kompass understands" + consent
│   │   ├── Chat.jsx           Welcome, proactive message, conversation
│   │   ├── Answer.jsx         Direction, figures, simulation, roadmap, appointment
│   │   └── CompassMark.jsx
│   └── styles.css
├── samples/              Fictitious documents for the demo
└── vite.config.js
```

**Flow of a question**

```
Customer question
      │
      ▼
Profile + signals (deterministic) ──► filtered by the customer's consent
      │
      ▼
Claude (or demo engine) ──► structured JSON response
      │
      ▼
Interface: direction · figures · simulation · roadmap · products · advisor
```

The response is always a JSON object (`heading`, `reply`, `insights`, `simulation`, `notes`, `checklist`, `steps`, `products`, `handoff`, `followups`), which makes it possible to display rich components rather than plain text.

### Scaling up (beyond the PoC)
- Replace `data/customers.js` with a feed from the KBC data lake (categorized transactions).
- Compute signals in batch and store them in a feature store.
- Connect `/api/handoff` to the advisors' CRM.
- Store documents in the KBC digital vault (encrypted), with a retention period and deletion on request.
- Add evaluation: answer quality, advisor handoff rate, satisfaction.
- Compliance: response logging, MiFID guardrails for anything related to investments.

---

First create an empty repository named `kompass` on github.com (without a README). The `.env` file is ignored by `.gitignore`: your API key will never be published.

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Starts the API (port 3001) and the interface (port 5173) |
| `npm run build` | Builds the interface into `dist/` |
| `npm start` | Serves the API and the built interface on http://localhost:3001 |

---

Kompass gives guidance, not financial advice. Hackathon project, not officially affiliated with KBC.
