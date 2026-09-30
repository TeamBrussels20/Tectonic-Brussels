import { db, must } from '../db.js';

// Builds the customer view Kompass reasons on (6 months of aggregated history,
// recurring payments, app behaviour, life events) from the bank's database,
// the same data the advisor workspace uses.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Transaction categories, in the words Kompass uses with the customer.
const CATEGORY = {
  housing: 'logement',
  groceries: 'alimentation',
  dining: 'restaurants',
  transport: 'transport',
  leisure: 'loisirs',
  travel: 'voyages',
  subscriptions: 'abonnements',
  shopping: 'shopping',
  health: 'sante',
  children: 'enfants',
  utilities: 'energie',
  insurance: 'assurances',
  loans: 'credits',
  taxes: 'impots',
  business: 'professionnel',
  other: 'autres'
};
// Categories whose payments are bills rather than day-to-day spending.
const BILLS = new Set(['housing', 'utilities', 'subscriptions', 'insurance', 'loans', 'children', 'taxes', 'business']);

const ACCOUNT_TYPE = { current: 'courant', savings: 'epargne', investment: 'placement', pension: 'pension' };
const LOAN_LABEL = { mortgage: 'Prêt hypothécaire', car: 'Prêt auto', personal: 'Prêt personnel', credit_card: 'Carte de crédit', student: 'Prêt étudiant' };
const MARITAL = { single: 'Célibataire', married: 'Marié·e', cohabiting: 'En couple', divorced: 'Divorcé·e', widowed: 'Veuf·ve' };
const REGION = { Ghent: 'Flandre', Gent: 'Flandre', Antwerp: 'Flandre', Leuven: 'Flandre', Mechelen: 'Flandre', Bruges: 'Flandre', Brussels: 'Bruxelles', Liège: 'Wallonie', Namur: 'Wallonie', Charleroi: 'Wallonie', Mons: 'Wallonie' };

export const monthName = (month) => new Date(`${month}-01`).toLocaleDateString('fr-BE', { month: 'long' });

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
}

function household(c) {
  const parts = [MARITAL[c.marital_status] || c.marital_status];
  if (c.dependents != null) parts.push(c.dependents ? `${c.dependents} enfant${c.dependents > 1 ? 's' : ''} à charge` : 'sans enfant à charge');
  return parts.filter(Boolean).join(', ') || 'Situation familiale non renseignée';
}

// Monthly totals over the last 6 full months, plus the current-account balance at each month end.
function monthlyHistory(transactions, currentAccountIds, currentBalance) {
  const byMonth = new Map();
  for (const t of transactions) {
    const month = t.booked_on.slice(0, 7);
    const m = byMonth.get(month) ?? { month, income: 0, spending: {}, transferToSavings: 0, net: 0 };
    const amount = Number(t.amount);
    if (currentAccountIds.has(t.account_id)) m.net += amount;
    if (amount > 0) m.income += amount;
    else if (t.category === 'savings_transfer') m.transferToSavings -= amount;
    else {
      const cat = CATEGORY[t.category] || 'autres';
      m.spending[cat] = (m.spending[cat] || 0) - amount;
    }
    byMonth.set(month, m);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  // Walk back from today's balance (the current month has no bookings yet).
  let balance = currentBalance;
  for (let i = months.length - 1; i >= 0; i--) {
    months[i].endBalance = Math.round(balance);
    balance -= months[i].net;
  }
  const round = (n) => Math.round(n * 100) / 100;
  return months.map(({ month, income, spending, transferToSavings, endBalance }) => ({
    month,
    income: round(income),
    endBalance,
    spending: Object.fromEntries(Object.entries(spending).map(([k, v]) => [k, round(v)])),
    transferToSavings: round(transferToSavings)
  }));
}

// Bills paid every month up to now, with a stable amount. A payment that started
// recently or changed amount once (indexation) gets a note ("+7 % depuis juillet").
function recurringPayments(transactions, months, unused) {
  const byLabel = new Map();
  for (const t of transactions) {
    const amount = -Number(t.amount);
    if (amount <= 0 || t.category === 'savings_transfer' || t.category === 'other') continue;
    const p = byLabel.get(t.description) ?? { category: t.category, amounts: new Map() };
    const month = t.booked_on.slice(0, 7);
    p.amounts.set(month, (p.amounts.get(month) ?? 0) + amount);
    byLabel.set(t.description, p);
  }
  const recurring = [];
  for (const [label, p] of byLabel) {
    // Must be paid in a run of months ending with the latest one.
    let run = 0;
    while (run < months.length && p.amounts.has(months[months.length - 1 - run])) run++;
    if (run < 3 || run < p.amounts.size) continue;
    const series = months.slice(-run).map((m) => p.amounts.get(m));
    const stable = Math.max(...series) <= Math.min(...series) * 1.25;
    if (!stable || !(BILLS.has(p.category) || new Set(series).size <= 2)) continue;
    const first = series[0];
    const last = series.at(-1);
    let note;
    if (run < months.length) note = `Nouveau depuis ${monthName(months[months.length - run])}`;
    else if (new Set(series).size === 2) {
      const since = months[months.length - run + series.findIndex((v) => v === last)];
      note = `${last > first ? '+' : ''}${Math.round(((last - first) / first) * 100)} % depuis ${monthName(since)}`;
    }
    const unusedNote = unused.get(label);
    recurring.push({ label, amount: last, category: CATEGORY[p.category] || 'autres', ...(unusedNote || note ? { note: unusedNote || note } : {}) });
  }
  return recurring.sort((a, b) => b.amount - a.amount);
}

export async function listCustomers() {
  const clients = await must(db.from('clients').select('id, full_name, date_of_birth, city').eq('status', 'customer').order('id'));
  return clients.map((c) => ({ id: c.id, name: c.full_name, age: ageFrom(c.date_of_birth), city: c.city }));
}

export async function getCustomer(id) {
  if (!UUID.test(id ?? '')) return null;
  const client = await must(db.from('clients').select('*').eq('id', id).maybeSingle());
  if (!client) return null;

  const firstOfMonth = (monthsAgo) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - monthsAgo);
    return d.toISOString().slice(0, 10);
  };
  const [accounts, loans, transactions, events] = await Promise.all([
    must(db.from('accounts').select('id, type, name, balance').eq('client_id', id)),
    must(db.from('loans').select('type, outstanding').eq('client_id', id)),
    must(
      db.from('transactions')
        .select('account_id, booked_on, amount, category, description')
        .eq('client_id', id)
        .gte('booked_on', firstOfMonth(6))
        .lt('booked_on', firstOfMonth(0))
        .order('booked_on')
    ),
    must(db.from('client_events').select('kind, code, title, detail, count, occurred_on').eq('client_id', id).order('occurred_on', { ascending: false }))
  ]);

  const current = accounts.filter((a) => a.type === 'current');
  const monthly = monthlyHistory(transactions, new Set(current.map((a) => a.id)), current.reduce((s, a) => s + Number(a.balance), 0));
  const unused = new Map(events.filter((e) => e.kind === 'unused_subscription').map((e) => [e.title, e.detail || 'Aucune utilisation détectée']));
  const daysAgo = (date) => Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86400000));
  const [firstName, ...rest] = client.full_name.split(' ');

  return {
    id: client.id,
    status: client.status,
    firstName,
    lastName: rest.join(' '),
    age: ageFrom(client.date_of_birth),
    city: client.city,
    region: REGION[client.city] || 'Belgique',
    household: household(client),
    job: client.occupation || 'Profession non renseignée',
    accounts: [
      ...accounts.map((a) => ({ type: ACCOUNT_TYPE[a.type], name: a.name, balance: Number(a.balance) })),
      ...loans.map((l) => ({ type: 'credit', name: `${LOAN_LABEL[l.type] || l.type} (reste dû)`, balance: -Number(l.outstanding) }))
    ],
    products: [...accounts.map((a) => a.name), ...loans.map((l) => LOAN_LABEL[l.type] || l.type)],
    monthly,
    recurring: recurringPayments(transactions, monthly.map((m) => m.month), unused),
    appBehavior: events.filter((e) => e.kind === 'app_activity').map((e) => ({ code: e.code, event: e.title, count: e.count, lastDaysAgo: daysAgo(e.occurred_on) })),
    lifeEvents: events.filter((e) => e.kind === 'life_event').map((e) => ({ code: e.code, event: e.title, evidence: e.detail || '', since: e.occurred_on }))
  };
}
