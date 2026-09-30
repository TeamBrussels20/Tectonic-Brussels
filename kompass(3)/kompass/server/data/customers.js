// Données fictives de démonstration. Aucune donnée réelle de client KBC.
// Chaque profil contient 6 mois d'historique agrégé, des flux récurrents,
// et des signaux comportementaux issus de l'app (pages consultées, simulateurs).

const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

export const customers = [
  {
    id: 'lotte',
    firstName: 'Lotte',
    lastName: 'Peeters',
    age: 29,
    city: 'Gand',
    region: 'Flandre',
    household: 'Vit seule, sans enfant',
    job: 'UX designer, CDI depuis 4 ans',
    accounts: [
      { type: 'courant', name: 'KBC Compte Plus', balance: 2140 },
      { type: 'epargne', name: 'KBC Compte épargne', balance: 23400 },
      { type: 'pension', name: 'Épargne-pension', balance: 6800 }
    ],
    products: ['Carte de débit', 'Assurance locataire', 'Épargne-pension'],
    monthly: months.map((m, i) => ({
      month: m,
      income: 2850,
      endBalance: [2310, 2280, 2190, 2050, 2120, 2140][i],
      spending: {
        logement: i < 3 ? 980 : 1050,
        alimentation: [380, 410, 395, 420, 400, 405][i],
        transport: 118,
        loisirs: [240, 310, 260, 290, 350, 270][i],
        abonnements: 123,
        shopping: [180, 240, 150, 260, 210, 190][i],
        sante: 35,
        autres: 80
      },
      transferToSavings: 500
    })),
    recurring: [
      { label: 'Loyer — Immo Ghent', amount: 1050, category: 'logement', note: '+7 % depuis juillet' },
      { label: 'Proximus internet + mobile', amount: 55, category: 'abonnements' },
      { label: 'Basic-Fit', amount: 29.99, category: 'abonnements' },
      { label: 'Netflix', amount: 15.99, category: 'abonnements' },
      { label: 'Spotify', amount: 11.99, category: 'abonnements' },
      { label: 'Disney+', amount: 9.99, category: 'abonnements', note: 'Aucune utilisation détectée' }
    ],
    appBehavior: [
      { event: 'Simulateur de prêt hypothécaire ouvert', count: 3, lastDaysAgo: 9 },
      { event: 'Article « Acheter son premier logement » lu', count: 1, lastDaysAgo: 14 }
    ],
    lifeEvents: []
  },
  {
    id: 'elamrani',
    firstName: 'Karim',
    lastName: 'El Amrani',
    age: 38,
    city: 'Liège',
    region: 'Wallonie',
    household: 'En couple (Sophie), 2 enfants, un 3e depuis juin',
    job: 'Infirmier, temps plein · Sophie : enseignante, 4/5e',
    accounts: [
      { type: 'courant', name: 'Compte commun', balance: -180 },
      { type: 'epargne', name: 'Compte épargne', balance: 3200 },
      { type: 'credit', name: 'Prêt hypothécaire (reste dû)', balance: -168000 }
    ],
    products: ['Prêt hypothécaire', 'Assurance habitation', 'Assurance auto', '2 cartes de débit'],
    monthly: months.map((m, i) => ({
      month: m,
      income: [5480, 5480, 5720, 5720, 5720, 5720][i],
      endBalance: [420, 150, -90, -260, -120, -180][i],
      spending: {
        logement: 1240,
        alimentation: [920, 960, 1080, 1150, 1120, 1170][i],
        transport: [380, 360, 410, 395, 420, 400][i],
        enfants: [540, 560, 780, 840, 860, 850][i],
        loisirs: [260, 220, 180, 210, 170, 190][i],
        abonnements: 96,
        shopping: [420, 380, 620, 540, 480, 510][i],
        sante: [120, 90, 310, 180, 140, 160][i],
        energie: 310,
        credit_auto: 385,
        autres: [260, 280, 420, 480, 450, 470][i]
      },
      transferToSavings: [300, 200, 0, 0, 0, 0][i]
    })),
    recurring: [
      { label: 'Mensualité prêt hypothécaire', amount: 1240, category: 'logement' },
      { label: 'Crèche Les Petits Pas', amount: 420, category: 'enfants', note: 'Nouveau depuis juin' },
      { label: 'Prêt auto (reste 26 mois)', amount: 385, category: 'credit_auto' },
      { label: 'Engie électricité + gaz', amount: 310, category: 'energie' },
      { label: 'Assurance auto', amount: 78, category: 'transport' },
      { label: 'VOO internet + TV', amount: 72, category: 'abonnements' },
      { label: 'Netflix', amount: 15.99, category: 'abonnements' }
    ],
    appBehavior: [
      { event: 'Solde consulté plus de 3 fois par jour en fin de mois', count: 14, lastDaysAgo: 2 },
      { event: 'Page « Découvert autorisé » consultée', count: 2, lastDaysAgo: 5 }
    ],
    lifeEvents: [
      { event: 'Naissance probable', evidence: 'Nouvelles allocations familiales (Famiwal) et frais de crèche depuis juin', since: '2026-06' }
    ]
  },
  {
    id: 'marc',
    firstName: 'Marc',
    lastName: 'Dubois',
    age: 61,
    city: 'Namur',
    region: 'Wallonie',
    household: 'Marié, enfants autonomes',
    job: 'Cadre dans l\u2019industrie, départ à la pension prévu à 64 ans',
    accounts: [
      { type: 'courant', name: 'Compte à vue', balance: 8900 },
      { type: 'epargne', name: 'Compte épargne', balance: 142000 },
      { type: 'pension', name: 'Assurance groupe (employeur)', balance: 96000 }
    ],
    products: ['Carte de crédit', 'Assurance habitation', 'Assurance familiale'],
    monthly: months.map((m, i) => ({
      month: m,
      income: 4650,
      endBalance: [7400, 7900, 8200, 8100, 8600, 8900][i],
      spending: {
        logement: 320,
        alimentation: 780,
        transport: 290,
        loisirs: [420, 380, 690, 1250, 310, 360][i],
        abonnements: 88,
        shopping: 260,
        sante: 140,
        autres: 210
      },
      transferToSavings: 1500
    })),
    recurring: [
      { label: 'Précompte immobilier (étalé)', amount: 95, category: 'logement' },
      { label: 'Mutualité complémentaire', amount: 42, category: 'sante' },
      { label: 'Proximus', amount: 64, category: 'abonnements' }
    ],
    appBehavior: [
      { event: 'Page « Préparer sa pension » lue', count: 2, lastDaysAgo: 20 },
      { event: 'Comparaison des taux d\u2019épargne consultée', count: 1, lastDaysAgo: 6 }
    ],
    lifeEvents: [
      { event: 'Pension dans environ 3 ans', evidence: 'Âge et date de départ indiquée dans le profil', since: null }
    ]
  }
];

export function getCustomer(id) {
  return customers.find((c) => c.id === id);
}
