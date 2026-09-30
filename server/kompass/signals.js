import { documentSignals, listDocuments, publicDoc } from './documents.js';
import { monthName } from './customers.js';

// Moteur de signaux : transforme des données bancaires brutes en compréhension.
// Trois familles, qui répondent à « situation, comportement, intention » :
//   situation   → ce qui est vrai aujourd'hui (revenus, épargne, charges)
//   comportement → ce qui change dans le temps (tendances, habitudes)
//   intention   → ce que le client semble préparer (pages vues, simulateurs, événements de vie)

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
const round = (n, step = 1) => Math.round(n / step) * step;

export function computeMetrics(c) {
  if (!c.monthly.length) return emptyMetrics(c);
  const incomes = c.monthly.map((m) => m.income);
  const spends = c.monthly.map((m) => sum(Object.values(m.spending)));
  const avgIncome = avg(incomes);
  const avgSpending = avg(spends);
  const savings = c.accounts.filter((a) => a.type === 'epargne').reduce((a, b) => a + b.balance, 0);
  const current = c.accounts.filter((a) => a.type === 'courant').reduce((a, b) => a + b.balance, 0);
  const pension = c.accounts.filter((a) => a.type === 'pension').reduce((a, b) => a + b.balance, 0);

  const categories = {};
  for (const m of c.monthly) {
    for (const [k, v] of Object.entries(m.spending)) categories[k] = (categories[k] || 0) + v;
  }
  const avgByCategory = Object.fromEntries(
    Object.entries(categories)
      .map(([k, v]) => [k, round(v / c.monthly.length)])
      .sort((a, b) => b[1] - a[1])
  );

  const subscriptions = c.recurring.filter((r) => r.category === 'abonnements');
  return {
    avgIncome: round(avgIncome),
    avgSpending: round(avgSpending),
    monthlySurplus: round(avgIncome - avgSpending),
    savingsRate: avgIncome ? Math.round(((avgIncome - avgSpending) / avgIncome) * 100) : 0,
    savings,
    current,
    pension,
    emergencyMonths: avgSpending ? +(savings / avgSpending).toFixed(1) : 0,
    avgByCategory,
    autoSavings: round(avg(c.monthly.map((m) => m.transferToSavings || 0))),
    recentSurplus: round(avg(c.monthly.slice(-3).map((m) => m.income - sum(Object.values(m.spending))))),
    subscriptionsTotal: +sum(subscriptions.map((s) => s.amount)).toFixed(2),
    negativeMonths: c.monthly.filter((m) => m.endBalance < 0).length,
    lastMonths: c.monthly.map((m) => ({ month: m.month, income: m.income, spending: sum(Object.values(m.spending)), endBalance: m.endBalance }))
  };
}

// Prospects: no transaction history at the bank yet.
function emptyMetrics(c) {
  const balance = (type) => c.accounts.filter((a) => a.type === type).reduce((a, b) => a + b.balance, 0);
  return {
    avgIncome: 0, avgSpending: 0, monthlySurplus: 0, savingsRate: 0,
    savings: balance('epargne'), current: balance('courant'), pension: balance('pension'),
    emergencyMonths: 0, avgByCategory: {}, autoSavings: 0, recentSurplus: 0,
    subscriptionsTotal: 0, negativeMonths: 0, lastMonths: []
  };
}

// Average monthly spending per category over the first and the last two months.
function categoryTrend(monthly) {
  const window = (list) => {
    const out = {};
    for (const m of list) for (const [k, v] of Object.entries(m.spending)) out[k] = (out[k] || 0) + v / list.length;
    return out;
  };
  return { first: window(monthly.slice(0, 2)), last: window(monthly.slice(-2)), lastMonths: monthly.slice(-2), firstMonths: monthly.slice(0, 2) };
}

export function computeSignals(c, metrics = computeMetrics(c)) {
  const s = [];
  if (!c.monthly.length) return s;
  const trend = categoryTrend(c.monthly);

  // --- Situation
  if (metrics.savingsRate >= 15) {
    s.push({ id: 'saver', family: 'situation', title: `Vous épargnez environ ${metrics.savingsRate} % de vos revenus`, detail: `Surplus moyen de ${metrics.monthlySurplus} € par mois sur 6 mois.`, source: 'Revenus et dépenses des 6 derniers mois' });
  }
  if (metrics.emergencyMonths < 2) {
    s.push({ id: 'low-buffer', family: 'situation', title: 'Réserve de sécurité faible', detail: `Votre épargne couvre ${String(metrics.emergencyMonths).replace('.', ',')} mois de dépenses. On vise souvent 3 à 6 mois.`, source: 'Solde épargne vs dépenses moyennes', tone: 'warn' });
  }
  if (metrics.savings > metrics.avgSpending * 12) {
    s.push({ id: 'idle-cash', family: 'situation', title: 'Beaucoup d\u2019argent dort sur le compte épargne', detail: `${metrics.savings.toLocaleString('fr-BE')} €, soit plus de ${Math.floor(metrics.savings / metrics.avgSpending)} mois de dépenses.`, source: 'Solde des comptes épargne' });
  }

  // --- Comportement
  const { first, last } = trend;
  for (const k of Object.keys(last)) {
    // A lasting increase: both recent months above both early months.
    const lasting = trend.lastMonths.every((m) => trend.firstMonths.every((f) => (m.spending[k] || 0) > (f.spending[k] || 0)));
    if (first[k] && lasting && last[k] > first[k] * 1.05 && last[k] - first[k] > 50) {
      const pct = Math.round(((last[k] - first[k]) / first[k]) * 100);
      s.push({ id: `up-${k}`, family: 'comportement', title: `Dépenses « ${k} » en hausse de ${pct} %`, detail: `De ${round(first[k])} € à ${round(last[k])} € par mois depuis ${monthName(c.monthly[0].month)}.`, source: 'Catégorisation des transactions', tone: k === 'logement' || k === 'enfants' ? 'warn' : undefined });
    }
  }
  if (metrics.negativeMonths >= 2) {
    const firstNegative = c.monthly.find((m) => m.endBalance < 0).month;
    s.push({ id: 'overdraft', family: 'comportement', title: `Fin de mois dans le rouge ${metrics.negativeMonths} fois sur ${c.monthly.length}`, detail: `Le compte courant termine le mois sous zéro depuis ${monthName(firstNegative)}.`, source: 'Solde de fin de mois', tone: 'warn' });
  }
  const unused = c.recurring.filter((r) => r.note && /aucune utilisation/i.test(r.note));
  if (unused.length) {
    s.push({ id: 'unused-sub', family: 'comportement', title: 'Abonnement peut-être inutilisé', detail: unused.map((u) => `${u.label} (${u.amount} €/mois)`).join(', '), source: 'Paiements récurrents' });
  }

  // --- Intention
  for (const b of c.appBehavior) {
    if (b.code === 'mortgage_simulator') s.push({ id: 'intent-mortgage', family: 'intention', title: 'Projet d\u2019achat immobilier en réflexion', detail: `${b.event} ${b.count}× — dernière fois il y a ${b.lastDaysAgo} jours.`, source: 'Activité dans l\u2019app KBC Mobile' });
    if (b.code === 'overdraft_page') s.push({ id: 'intent-overdraft', family: 'intention', title: 'Recherche de solution de trésorerie', detail: `${b.event} ${b.count}×.`, source: 'Activité dans l\u2019app KBC Mobile', tone: 'warn' });
    if (b.code === 'pension_page') s.push({ id: 'intent-pension', family: 'intention', title: 'Préparation de la pension', detail: `${b.event} ${b.count}×.`, source: 'Activité dans l\u2019app KBC Mobile' });
    if (b.code === 'savings_rates') s.push({ id: 'intent-yield', family: 'intention', title: 'Cherche un meilleur rendement', detail: `${b.event}.`, source: 'Activité dans l\u2019app KBC Mobile' });
  }
  for (const e of c.lifeEvents) {
    s.push({ id: `life-${e.code}`, family: 'intention', title: e.event, detail: e.evidence, source: 'Événement de vie détecté' });
  }
  return s;
}

// « Moment de vie » : une étiquette lisible, jamais un score opaque.
export function lifeMoment(signals) {
  const ids = new Set(signals.map((s) => s.id));
  if (ids.has('intent-mortgage')) return { label: 'Prépare un premier achat', why: 'Simulateur hypothécaire utilisé et capacité d\u2019épargne régulière.' };
  if (ids.has('overdraft') || ids.has('intent-overdraft')) return { label: 'Budget familial sous tension', why: 'Nouvelles dépenses enfants et fins de mois négatives.' };
  if (ids.has('intent-pension')) return { label: 'Approche de la pension', why: 'Pension dans quelques années et épargne importante.' };
  return { label: 'Situation stable', why: 'Aucun changement marquant détecté.' };
}

// Le « bon moment » : Kompass prend l'initiative avec un seul message, pas dix.
export function proactiveNudge(c, signals, m) {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const simulator = c.appBehavior.find((b) => b.code === 'mortgage_simulator');
  if (simulator) {
    const rent = c.recurring.find((r) => r.category === 'logement' && /^\+\d+ %/.test(r.note || ''));
    const opener = rent ? `${c.firstName}, votre loyer a augmenté de ${rent.note.slice(1)}.` : `${c.firstName}, vous pensez à acheter ?`;
    return { title: opener, body: `Vous avez ouvert le simulateur hypothécaire ${simulator.count} fois. Voulez-vous voir ce qu\u2019un achat représenterait vraiment pour vous ?`, prompt: 'Je veux faire un prêt hypothécaire, aide-moi à y voir clair.' };
  }
  if (byId.has('overdraft')) {
    const birth = c.lifeEvents.some((e) => e.code === 'birth');
    const increase = Math.round(m.lastMonths.at(-1).spending - m.lastMonths[0].spending);
    return {
      title: birth ? `Félicitations pour l\u2019arrivée du bébé, ${c.firstName}.` : `${c.firstName}, vos fins de mois se resserrent.`,
      body: `En six mois, vos dépenses ont augmenté d\u2019environ ${increase} € par mois et le compte termine le mois dans le rouge. On regarde ensemble comment retrouver de l\u2019air ?`,
      prompt: birth ? 'Mes fins de mois sont difficiles depuis la naissance, aide-moi.' : 'Mes fins de mois sont difficiles, aide-moi.'
    };
  }
  if (byId.has('idle-cash')) {
    const retiring = c.lifeEvents.find((e) => e.code === 'retirement');
    return retiring
      ? { title: `${c.firstName}, votre pension approche.`, body: `${m.savings.toLocaleString('fr-BE')} € dorment sur votre compte épargne. Voulez-vous préparer cette transition avant d\u2019en parler à votre conseiller ?`, prompt: 'Ma pension approche, que dois-je faire de mon épargne ?' }
      : { title: `${c.firstName}, votre épargne pourrait travailler davantage.`, body: `${m.savings.toLocaleString('fr-BE')} € dorment sur votre compte épargne, soit plus d\u2019un an de dépenses. On regarde ce que vous pourriez en faire ?`, prompt: 'Que dois-je faire de mon épargne ?' };
  }
  return null;
}

export function buildProfile(c) {
  const metrics = computeMetrics(c);
  const signals = [...documentSignals(c.id), ...computeSignals(c, metrics)];
  return {
    customer: { id: c.id, status: c.status, firstName: c.firstName, lastName: c.lastName, age: c.age, city: c.city, region: c.region, household: c.household, job: c.job, accounts: c.accounts, products: c.products, recurring: c.recurring },
    metrics,
    signals,
    lifeMoment: lifeMoment(signals),
    nudge: proactiveNudge(c, signals, metrics),
    documents: listDocuments(c.id).map(publicDoc)
  };
}
