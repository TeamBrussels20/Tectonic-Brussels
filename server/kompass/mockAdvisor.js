import { listDocuments, getDocument } from './documents.js';

// Moteur de démo sans IA : détecte l'intention de la question et construit
// une réponse structurée à partir des vraies données du profil.
// Il produit exactement le même format JSON que Claude, pour que le front
// fonctionne à l'identique dans les deux modes.

const eur = (n) => `${Math.round(n).toLocaleString('fr-BE')} €`;
const r25 = (n) => Math.max(25, Math.round(n / 25) * 25);

function annuityCapital(payment, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  return payment * (1 - Math.pow(1 + r, -n)) / r;
}

const INTENTS = [
  { id: 'mortgage', re: /(hypoth|maison|appartement|acheter un|achat immo|logement à acheter|woning|lening|mortgage|premier achat)/i },
  { id: 'budget', re: /(fin de mois|découvert|rouge|budget|dépens|trop cher|difficile|naissance|serré)/i },
  { id: 'pension', re: /(pension|retraite|pensioen|retire)/i },
  { id: 'invest', re: /(invest|placer|bourse|rendement|beleg|fonds|actions)/i },
  { id: 'save', re: /(économ|épargn|mettre de côté|sparen|save|mettre de l.argent)/i }
];

export function detectIntent(text) {
  return INTENTS.find((i) => i.re.test(text))?.id || 'general';
}

export function mortgageChecklist(docs) {
  const has = (t) => docs.some((d) => d.type === t);
  return [
    { label: 'Fiches de paie des 3 derniers mois', done: has('payslip') },
    { label: 'Contrat de travail', done: has('employment') },
    { label: 'Extraits de vos comptes d\u2019épargne', done: true, note: 'déjà chez KBC' },
    { label: 'Contrat de bail actuel (pour le préavis)', done: has('lease') },
    { label: 'Compromis de vente du bien', done: false }
  ];
}

const DOC_FOLLOWUPS = {
  payslip: ['Est-ce suffisant pour un prêt hypothécaire ?', 'Pourquoi mon brut et mon net sont si différents ?', 'Quels autres documents dois-je ajouter ?'],
  lease: ['Quand donner mon préavis si j\u2019achète ?', 'Mon propriétaire peut-il encore indexer le loyer ?', 'Ma garantie locative peut-elle servir d\u2019apport ?'],
  credit: ['Dois-je rembourser ce crédit plus tôt ?', 'Et si je regroupe mes crédits ?', 'Combien est-ce que je paie en intérêts ?'],
  other: ['Qu\u2019est-ce que ce document change pour moi ?', 'Quels documents sont utiles à Kompass ?']
};
const DOC_HEADINGS = {
  payslip: 'Ce que dit votre fiche de paie',
  lease: 'Ce que dit votre bail',
  credit: 'Ce que dit votre contrat de crédit',
  employment: 'Ce que dit votre contrat de travail'
};

function documentAnswer(doc, profile, docs) {
  const c = profile.customer;
  const planningPurchase = profile.lifeMoment.label === 'Prépare un premier achat';
  const readable = doc.fields.length > 0 && !(doc.fields.length === 1 && doc.fields[0].label === 'Contenu');
  return {
    heading: DOC_HEADINGS[doc.type] || 'J\u2019ai lu votre document',
    reply: readable
      ? `J\u2019ai lu « ${doc.name} », ${c.firstName}. Je l\u2019ai reconnu comme ${doc.typeLabel.toLowerCase()} et j\u2019en ai extrait l\u2019essentiel. Voici ce que ça change pour vous.`
      : `J\u2019ai bien reçu « ${doc.name} », mais je n\u2019ai pas pu en extraire de données utiles.`,
    insights: [],
    simulation: readable ? { title: 'Données extraites du document', rows: doc.fields, note: 'Vérifiez ces valeurs : l\u2019extraction automatique peut se tromper.' } : null,
    notes: doc.observations,
    checklist: planningPurchase && ['payslip', 'lease', 'employment'].includes(doc.type) ? mortgageChecklist(docs) : null,
    steps: [],
    products: [],
    handoff: doc.type === 'credit'
      ? { needed: true, reason: 'Un conseiller peut calculer si un regroupement de vos crédits ou un remboursement anticipé vous fait réellement gagner de l\u2019argent.', topic: 'Analyse du crédit auto' }
      : { needed: false, reason: '', topic: '' },
    followups: DOC_FOLLOWUPS[doc.type] || DOC_FOLLOWUPS.other
  };
}

export function mockAnswer(profile, history, consent) {
  const lastMsg = [...history].reverse().find((m) => m.role === 'user') || {};
  const last = lastMsg.content || '';
  const intent = detectIntent(last);
  const { customer: c, metrics: m } = profile;
  const allowed = (id) => consent?.[id] !== false;
  const docs = listDocuments(c.id).filter((d) => allowed(`doc-${d.id}`));

  if (lastMsg.documentId) {
    const doc = getDocument(c.id, lastMsg.documentId);
    if (doc) return documentAnswer(doc, profile, docs);
  }
  if (docs.length && /(document|fiche de paie|mon bail|mon contrat|ce contrat|ce fichier)/i.test(last)) {
    return documentAnswer(docs[docs.length - 1], profile, docs);
  }

  if (intent === 'mortgage') {
    const maxPayment = m.avgIncome * 0.33;
    const years = 25;
    const rate = 0.033;
    const loan = annuityCapital(maxPayment, rate, years);
    const buffer = m.avgSpending * 3;
    const ownFunds = Math.max(0, m.savings - buffer);
    const feesRate = 0.06;
    const price = Math.min((loan + ownFunds) / (1 + feesRate), loan / 0.9);
    const rent = c.recurring.find((r) => /loyer|^rent\b|huur/i.test(r.label));
    const unused = c.recurring.find((r) => /aucune utilisation/i.test(r.note || ''));
    const monthsToMore = Math.ceil(20000 / Math.max(m.monthlySurplus, 1));
    return {
      heading: 'Votre cap : un premier achat réaliste',
      reply: `Bonne nouvelle ${c.firstName} : avec un revenu net d\u2019environ ${eur(m.avgIncome)} et une épargne de ${eur(m.savings)}, un achat est envisageable. Voici une première estimation basée sur vos données, pour vous donner un ordre de grandeur avant de rencontrer un conseiller.`,
      insights: [
        { label: 'Mensualité confortable', value: `≈ ${eur(maxPayment)}`, tone: 'neutral' },
        { label: 'Apport disponible', value: eur(ownFunds), tone: 'good' },
        { label: 'Réserve conservée', value: eur(buffer), tone: 'neutral' }
      ],
      simulation: {
        title: 'Estimation indicative',
        rows: [
          { label: 'Montant empruntable (25 ans, ~3,3 %)', value: `≈ ${eur(loan)}` },
          { label: 'Prix d\u2019achat accessible', value: `≈ ${eur(price)}` },
          { label: 'Frais d\u2019achat estimés (hypothèse 6 %)', value: `≈ ${eur(price * feesRate)}` },
          ...(rent ? [{ label: 'Loyer actuel vs mensualité', value: `${eur(rent.amount)} → ${eur(maxPayment)}` }] : [])
        ],
        note: 'Taux et frais réels dépendent du bien, de la région et de votre dossier. Ce n\u2019est pas une offre de crédit.'
      },
      steps: [
        { title: 'Fixer votre budget cible', detail: `Visez un bien autour de ${eur(Math.round(price / 5000) * 5000)}. En continuant à épargner ${eur(m.monthlySurplus)} par mois, vous aurez environ 20 000 € d\u2019apport en plus dans ${monthsToMore} mois.` },
        { title: unused && allowed('unused-sub') ? 'Optimiser les petites dépenses' : 'Garder votre rythme d\u2019épargne', detail: unused && allowed('unused-sub') ? `${unused.label} ne semble plus utilisé (${unused.amount.toLocaleString('fr-BE')} €/mois). Chaque euro libéré améliore votre dossier.` : 'Votre régularité est un atout fort pour la banque.' },
        { title: 'Compléter votre dossier', detail: (() => { const missing = mortgageChecklist(docs).filter((i) => !i.done).map((i) => i.label.toLowerCase()); return `Encore à ajouter : ${missing.join(', ')}. Glissez-les dans Kompass, je les vérifie pour vous.`; })() },
        { title: 'Rencontrer un conseiller crédit', detail: 'Il confirmera le taux, la durée et les primes éventuelles liées à votre région.' }
      ],
      checklist: mortgageChecklist(docs),
      products: [
        { name: 'Prêt hypothécaire KBC', why: 'Pour financer l\u2019achat, avec simulation personnalisée par un conseiller.' },
        { name: 'Assurance solde restant dû', why: 'Protège l\u2019emprunt si quelque chose vous arrive. Souvent demandée par la banque.' }
      ],
      handoff: { needed: true, reason: 'Un prêt hypothécaire est une décision engageante : un conseiller valide votre capacité réelle et vous fait une offre.', topic: 'Premier achat immobilier' },
      followups: ['Et si j\u2019achète à deux ?', 'Combien de temps pour épargner 20 000 € de plus ?', 'Quels documents dois-je préparer ?']
    };
  }

  if (intent === 'budget') {
    const top = Object.entries(m.avgByCategory).slice(0, 4);
    const gap = r25(Math.max(0, -m.recentSurplus + 250));
    const birth = profile.signals.some((s) => s.id === 'life-birth');
    const ups = profile.signals.filter((s) => s.id.startsWith('up-') && allowed(s.id));
    const rising = ups.find((s) => s.tone === 'warn') || ups[0];
    const hasLoans = c.accounts.some((a) => a.type === 'credit');
    return {
      heading: 'Votre cap : retrouver de l\u2019air en fin de mois',
      reply: `Merci de votre confiance ${c.firstName}. ${birth ? 'L\u2019arrivée d\u2019un enfant change beaucoup de choses et vos chiffres le montrent' : 'Vos chiffres montrent que le budget est sous pression'}${rising ? ` : ${rising.title.charAt(0).toLowerCase()}${rising.title.slice(1)} (${rising.detail.charAt(0).toLowerCase()}${rising.detail.slice(1).replace(/\.$/, '')})` : ''}. Rien d\u2019anormal, mais le budget doit s\u2019adapter. Voici par où commencer.`,
      insights: [
        { label: 'Fins de mois négatives', value: `${m.negativeMonths} sur 6`, tone: 'warn' },
        { label: 'Réserve de sécurité', value: `${String(m.emergencyMonths).replace('.', ',')} mois`, tone: 'warn' },
        { label: 'Objectif d\u2019économie', value: `≈ ${eur(gap)}/mois`, tone: 'neutral' }
      ],
      simulation: {
        title: 'Où part votre argent (moyenne mensuelle)',
        rows: top.map(([k, v]) => ({ label: k.replace('_', ' '), value: eur(v) })),
        note: 'Catégories calculées automatiquement à partir de vos transactions.'
      },
      steps: [
        ...(birth ? [{ title: 'Vérifier les aides liées à la naissance', detail: 'Allocations familiales majorées, prime de naissance, réduction fiscale pour frais de garde : assurez-vous que tout est bien perçu.' }] : []),
        { title: 'Revoir les courses et le shopping', detail: `Alimentation et shopping représentent ${eur((m.avgByCategory.alimentation || 0) + (m.avgByCategory.shopping || 0))} par mois. Un budget hebdomadaire dans l\u2019app aide à tenir.` },
        { title: 'Lisser les grosses factures', detail: 'Énergie et assurances peuvent être étalées pour éviter les pics de fin de mois.' },
        ...(docs.find((d) => d.type === 'credit') ? [{ title: 'Regarder votre crédit auto', detail: docs.find((d) => d.type === 'credit').observations.join(' ') }] : []),
        { title: 'Reconstruire une petite réserve', detail: 'Même 50 € par semaine, virés automatiquement le jour du salaire, font une vraie différence en six mois.' }
      ],
      products: [
        { name: 'Alertes de budget dans KBC Mobile', why: 'Vous prévient avant que le compte passe sous zéro, pas après.' },
        { name: 'Épargne automatique', why: 'Un petit virement programmé le jour du salaire.' }
      ],
      handoff: hasLoans
        ? { needed: true, reason: 'Un conseiller peut revoir vos crédits en cours : un regroupement ou un allongement de durée peut libérer plusieurs centaines d\u2019euros par mois.', topic: 'Budget et crédits en cours' }
        : { needed: true, reason: 'Un conseiller peut vous aider à bâtir un budget réaliste et une réserve de sécurité.', topic: 'Budget et réserve de sécurité' },
      followups: [birth ? `Quelles aides pour la naissance en ${c.region} ?` : 'Où puis-je économiser en priorité ?', 'Crée-moi un budget hebdomadaire', hasLoans ? 'Est-ce que je peux revoir mon prêt ?' : 'Comment constituer une réserve ?']
    };
  }

  if (intent === 'pension' || (intent === 'invest' && c.age > 55)) {
    const buffer = m.avgSpending * 6;
    const toAllocate = Math.max(0, m.savings - buffer);
    return {
      heading: 'Votre cap : préparer une pension sereine',
      reply: `${c.firstName}, vous êtes dans une situation solide : vous épargnez ${m.savingsRate} % de vos revenus et disposez de ${eur(m.savings)} sur votre compte épargne. À l\u2019approche de la pension, la question n\u2019est pas « combien » mais « comment organiser cet argent ».`,
      insights: [
        { label: 'Réserve recommandée (6 mois)', value: eur(buffer), tone: 'neutral' },
        { label: 'Montant à organiser', value: eur(toAllocate), tone: 'good' },
        { label: 'Assurance groupe', value: eur(m.pension), tone: 'neutral' }
      ],
      steps: [
        { title: 'Estimer votre future pension', detail: 'Consultez mypension.be pour votre pension légale. Kompass l\u2019ajoutera à vos revenus prévus.' },
        { title: 'Garder une réserve disponible', detail: `Conservez environ ${eur(buffer)} accessibles immédiatement.` },
        { title: 'Définir vos horizons', detail: 'Ce dont vous aurez besoin au départ à la pension, dix ans plus tard, et ce qui pourra rester pour plus tard ou pour vos enfants.' },
        { title: 'En parler à un conseiller', detail: 'Il établira votre profil de risque et vous proposera une répartition adaptée.' }
      ],
      products: [
        { name: 'Conseil en placement KBC', why: 'Placer une partie de l\u2019épargne selon votre horizon et votre profil.' },
        { name: 'Planification successorale', why: 'Utile si vous souhaitez aider vos enfants de votre vivant.' }
      ],
      handoff: { needed: true, reason: 'Un conseil en placement doit être personnalisé et tenir compte de votre profil de risque : c\u2019est le rôle de votre conseiller.', topic: 'Préparation de la pension et placement' },
      followups: ['Quelle part garder disponible ?', 'Comment aider mes enfants à acheter ?', 'Que devient mon assurance groupe ?']
    };
  }

  if (intent === 'save' || intent === 'invest') {
    const already = m.autoSavings;
    const free = Math.max(0, m.monthlySurplus - already);
    const extra = free >= 100 ? r25(free * 0.6) : 50;
    const auto = already + extra;
    const subs = profile.customer.recurring.filter((r) => r.category === 'abonnements');
    return {
      heading: 'Votre cap : épargner sans y penser',
      reply: already > 0
        ? `${c.firstName}, vous épargnez déjà ${eur(already)} par mois automatiquement, c\u2019est une excellente base. Après cela, il vous reste en moyenne ${eur(free)} en fin de mois. On peut aller un peu plus loin sans vous priver : ${eur(extra)} de plus par mois.`
        : `${c.firstName}, sur les six derniers mois il vous reste en moyenne ${eur(m.monthlySurplus)} à la fin du mois. La méthode la plus efficace est de mettre l\u2019épargne de côté dès l\u2019arrivée du salaire, plutôt que d\u2019attendre ce qui reste.`,
      insights: [
        { label: 'Surplus moyen', value: eur(m.monthlySurplus), tone: m.monthlySurplus > 0 ? 'good' : 'warn' },
        { label: 'Taux d\u2019épargne', value: `${m.savingsRate} %`, tone: 'neutral' },
        { label: 'Abonnements', value: `${eur(m.subscriptionsTotal)}/mois`, tone: 'neutral' }
      ],
      simulation: {
        title: `Si vous épargnez ${eur(auto)} par mois`,
        rows: [
          { label: 'Dans 1 an', value: eur(auto * 12) },
          { label: 'Dans 3 ans', value: eur(auto * 36) },
          { label: 'Dans 5 ans', value: eur(auto * 60) }
        ],
        note: 'Hors intérêts, pour rester prudent.'
      },
      steps: [
        { title: already > 0 ? 'Augmenter votre virement automatique' : 'Programmer un virement automatique', detail: already > 0 ? `Passer de ${eur(already)} à ${eur(auto)} le lendemain du salaire.` : `${eur(auto)} le lendemain du salaire, vers votre compte épargne.` },
        { title: 'Faire le tri dans les abonnements', detail: subs.map((s) => `${s.label} ${s.amount} €`).join(', ') + '.' },
        { title: 'Donner un nom à votre objectif', detail: 'Un objectif nommé (« voyage », « apport maison ») est tenu bien plus souvent.' }
      ],
      products: [{ name: 'Épargne automatique KBC', why: 'Un ordre permanent que vous pouvez modifier à tout moment.' }],
      handoff: { needed: false, reason: '', topic: '' },
      followups: ['Programme le virement pour moi', 'Et si je veux investir une partie ?', 'Aide-moi à fixer un objectif']
    };
  }

  return {
    heading: 'Par où commencer ?',
    reply: `Je peux vous aider à y voir plus clair, ${c.firstName}. Dites-moi ce que vous voulez accomplir : un projet (achat, voyage, études), mieux gérer vos dépenses, épargner, ou préparer l\u2019avenir. Je m\u2019appuie sur vos comptes pour vous donner des repères concrets.`,
    insights: [
      { label: 'Revenus moyens', value: eur(m.avgIncome), tone: 'neutral' },
      { label: 'Dépenses moyennes', value: eur(m.avgSpending), tone: 'neutral' }
    ],
    steps: [],
    products: [],
    handoff: { needed: false, reason: '', topic: '' },
    followups: ['Je veux économiser chaque mois', 'Je veux acheter un logement', 'Où part mon argent ?']
  };
}
