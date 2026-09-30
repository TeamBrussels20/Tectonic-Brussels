// Coffre à documents de Kompass (démo).
// Les fichiers sont gardés en mémoire uniquement : ils disparaissent au redémarrage du serveur.
// Analyse en deux niveaux :
//   1. Claude (si une clé API est configurée) lit directement le PDF ou l'image.
//   2. Sinon, extraction du texte (PDF, TXT) puis règles de classification et d'extraction.

import { PDFParse } from 'pdf-parse';

const store = new Map(); // customerId -> [doc]
const TODAY = new Date('2026-09-30');

export const DOC_TYPES = {
  payslip: 'Fiche de paie',
  lease: 'Contrat de bail',
  credit: 'Contrat de crédit',
  employment: 'Contrat de travail',
  insurance: 'Contrat d\u2019assurance',
  tax: 'Avertissement-extrait de rôle',
  other: 'Document'
};

export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];

export function listDocuments(customerId) {
  return store.get(customerId) || [];
}

export function getDocument(customerId, docId) {
  return listDocuments(customerId).find((d) => d.id === docId);
}

export function deleteDocument(customerId, docId) {
  const list = listDocuments(customerId);
  const next = list.filter((d) => d.id !== docId);
  store.set(customerId, next);
  return next.length !== list.length;
}

export function publicDoc(d) {
  const { buffer, text, ...rest } = d;
  return { ...rest, hasText: Boolean(text) };
}

// ---------- Extraction de texte ----------
async function extractText(buffer, mime) {
  if (mime === 'text/plain') return buffer.toString('utf8');
  if (mime === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const r = await parser.getText();
      return (r.text || '').replace(/-- \d+ of \d+ --/g, '').trim();
    } finally {
      await parser.destroy?.();
    }
  }
  return ''; // image : pas d'OCR en mode démo
}

// ---------- Règles ----------
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const AMOUNT = '([-+]?\\d{1,3}(?:[ .\\u202f\\u00a0]\\d{3})*(?:,\\d{1,2})?|[-+]?\\d+(?:,\\d{1,2})?)';
const toNumber = (s) => (s ? Math.abs(parseFloat(s.replace(/[ .\u202f\u00a0+]/g, '').replace(',', '.'))) : null);
const eur = (n) => `${n.toLocaleString('fr-BE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

function amountAfter(t, label) {
  // Le montant doit suivre un espace ou « : » et ne pas faire partie d'une date (01/07/2026).
  const m = t.match(new RegExp(`${label}[^\\n]{0,60}?[:\\s]${AMOUNT}(?![\\/\\d])`));
  return m ? toNumber(m[1]) : null;
}
function textAfter(raw, label) {
  const m = raw.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'));
  return m ? m[1].trim() : null;
}
function parseDate(s) {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : null;
}

export function classify(text, filename = '') {
  const t = norm(`${filename} ${text}`);
  if (/fiche de paie|bulletin de paie|loonbrief|loonfiche|net a payer|salaire brut/.test(t)) return 'payslip';
  if (/contrat de bail|huurovereenkomst|bailleur|preneu|residence principale/.test(t)) return 'lease';
  if (/contrat de travail|arbeidsovereenkomst/.test(t)) return 'employment';
  if (/taeg|credit|pret |lening|mensualite/.test(t)) return 'credit';
  if (/police|prime annuelle|preneur d.assurance|verzekering/.test(t)) return 'insurance';
  if (/extrait de role|aanslagbiljet|impot des personnes/.test(t)) return 'tax';
  return 'other';
}

function extractFields(type, raw, profile) {
  const t = norm(raw);
  const fields = [];
  const observations = [];
  const signal = {};
  const m = profile?.metrics;

  if (type === 'payslip') {
    const employer = textAfter(raw, 'Employeur')?.split(',')[0];
    const gross = amountAfter(t, 'salaire brut');
    const net = amountAfter(t, 'net a payer') ?? amountAfter(t, 'netto');
    const cdi = /duree indeterminee|onbepaalde duur|\bcdi\b/.test(t);
    const since = raw.match(/entr[ée]e\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
    if (employer) fields.push({ label: 'Employeur', value: employer });
    if (gross) fields.push({ label: 'Salaire brut', value: eur(gross) });
    if (net) fields.push({ label: 'Net à payer', value: eur(net) });
    fields.push({ label: 'Type de contrat', value: cdi ? 'Durée indéterminée' : 'Non précisé' });
    if (since) fields.push({ label: 'En service depuis', value: since });
    if (net && m) {
      const diff = Math.abs(net - m.avgIncome) / m.avgIncome;
      observations.push(diff < 0.05
        ? `Le net de la fiche (${eur(net)}) correspond aux revenus reçus sur votre compte (${eur(m.avgIncome)} en moyenne).`
        : `Le net de la fiche (${eur(net)}) diffère des revenus observés sur votre compte (${eur(m.avgIncome)}). Une partie de votre salaire arrive peut-être ailleurs.`);
    }
    if (cdi) observations.push('Un contrat à durée indéterminée renforce un dossier de crédit.');
    signal.title = net ? `Revenus confirmés : ${eur(net)} net par mois` : 'Fiche de paie ajoutée';
    signal.detail = [employer, cdi ? 'CDI' : null].filter(Boolean).join(', ');
  }

  if (type === 'lease') {
    const indexed = amountAfter(t, 'loyer indexe');
    const base = amountAfter(t, 'loyer mensuel');
    const rent = indexed ?? base;
    const charges = amountAfter(t, 'charges');
    const guarantee = amountAfter(t, 'garantie locative');
    const endStr = t.match(/se\s+terminant\s+le\s+(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const startStr = t.match(/prenant\s+cours\s+le\s+(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const notice = t.match(/preavis\s+de\s+(\d+)\s+mois/)?.[1];
    if (rent) fields.push({ label: 'Loyer actuel', value: eur(rent) });
    if (charges) fields.push({ label: 'Charges', value: `${eur(charges)}/mois` });
    if (guarantee) fields.push({ label: 'Garantie locative', value: eur(guarantee) });
    if (startStr) fields.push({ label: 'Début du bail', value: startStr });
    if (endStr) fields.push({ label: 'Fin du bail', value: endStr });
    if (notice) fields.push({ label: 'Préavis', value: `${notice} mois` });
    const start = parseDate(startStr);
    if (start && notice) {
      const year = Math.floor((TODAY - start) / (365.25 * 24 * 3600 * 1000)) + 1;
      const indemnity = year >= 3 ? 'sans indemnité' : year === 2 ? 'avec une indemnité d\u2019un mois de loyer' : 'avec une indemnité';
      observations.push(`Vous êtes dans la ${year}e année du bail : vous pouvez partir avec ${notice} mois de préavis, ${indemnity}.`);
    }
    if (guarantee) observations.push(`La garantie de ${eur(guarantee)} vous sera rendue à la sortie : elle peut compléter votre apport.`);
    if (rent && charges) observations.push(`Votre logement vous coûte ${eur(rent + charges)} par mois, charges comprises.`);
    signal.title = 'Bail analysé';
    signal.detail = [rent ? `Loyer ${eur(rent)}` : null, notice ? `préavis ${notice} mois` : null, endStr ? `fin le ${endStr}` : null].filter(Boolean).join(', ');
  }

  if (type === 'credit') {
    const amount = amountAfter(t, 'montant du credit');
    const rate = t.match(/taeg\)?[^\d]{0,20}(\d{1,2},\d{1,2})\s*%/)?.[1];
    const monthly = amountAfter(t, 'mensualite');
    const remaining = amountAfter(t, 'capital restant du');
    const left = t.match(/echeances\s+restantes[^\n]{0,40}?\s(\d{1,3})(?![\/\d,])/)?.[1];
    const fee = t.match(/indemnite\s+de\s+(\d+(?:,\d+)?)\s?%/)?.[1];
    if (amount) fields.push({ label: 'Montant emprunté', value: eur(amount) });
    if (rate) fields.push({ label: 'TAEG', value: `${rate} %` });
    if (monthly) fields.push({ label: 'Mensualité', value: eur(monthly) });
    if (remaining) fields.push({ label: 'Capital restant dû', value: eur(remaining) });
    if (left) fields.push({ label: 'Échéances restantes', value: left });
    const r = rate ? parseFloat(rate.replace(',', '.')) : null;
    if (r && r > 5) observations.push(`Un TAEG de ${rate} % est élevé. C\u2019est souvent le premier crédit à rembourser ou à regrouper.`);
    if (remaining && fee) {
      const f = toNumber(fee) / 100;
      observations.push(`Un remboursement anticipé coûterait environ ${eur(Math.round(remaining * f))} d\u2019indemnité et libérerait ${monthly ? eur(monthly) : 'la mensualité'} par mois.`);
    }
    signal.title = rate ? `Crédit à ${rate} % TAEG` : 'Contrat de crédit ajouté';
    signal.detail = [monthly ? `${eur(monthly)}/mois` : null, remaining ? `${eur(remaining)} restant dû` : null].filter(Boolean).join(', ');
    if (r && r > 5) signal.tone = 'warn';
  }

  if (!fields.length) {
    const words = raw.split(/\s+/).filter(Boolean).length;
    if (words) fields.push({ label: 'Contenu', value: `${words} mots lus` });
    else observations.push('Kompass n\u2019a pas pu lire de texte dans ce fichier. En mode démo, les images et les scans ne sont pas lus : activez Claude pour les analyser.');
    signal.title = `${DOC_TYPES[type]} ajouté`;
    signal.detail = '';
  }

  return { fields, observations, signal };
}

// ---------- Analyse par Claude ----------
async function analyzeWithClaude(anthropic, model, { buffer, mime, text, name }, profile) {
  const source = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } }
    : mime.startsWith('image/')
      ? { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } }
      : { type: 'text', text: `Contenu du fichier « ${name} » :\n${text.slice(0, 20000)}` };

  const m = profile.metrics;
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: 'Tu analyses des documents financiers belges pour Kompass, le guide de KBC. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.',
    messages: [{
      role: 'user',
      content: [source, {
        type: 'text',
        text: `Client : ${profile.customer.firstName}, revenus observés ${m.avgIncome} €/mois, dépenses ${m.avgSpending} €/mois, épargne ${m.savings} €.
Analyse ce document et renvoie :
{"type": "payslip|lease|credit|employment|insurance|tax|other",
 "fields": [{"label": "...", "value": "..."}] (6 max, les données clés),
 "observations": ["..."] (3 max, ce que ça change pour le client, en comparant avec ses chiffres),
 "signal": {"title": "résumé en 6 mots", "detail": "1 ligne", "tone": "warn ou null"},
 "text": "texte intégral du document (max 3000 caractères)"}
Réponds en français. N'invente aucune valeur absente du document.`
      }]
    }]
  });
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const clean = out.replace(/```json|```/g, '');
  return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
}

export async function addDocument(customerId, file, profile, { anthropic, model } = {}) {
  const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
  const name = Buffer.from(file.originalname, 'latin1').toString('utf8'); // multer encode les noms en latin1
  let text = '';
  try { text = await extractText(file.buffer, mime); } catch (e) { console.warn('[Kompass] Lecture du PDF impossible :', e.message); }

  let analysis;
  let analyzedBy = 'regles';
  if (anthropic) {
    try {
      analysis = await analyzeWithClaude(anthropic, model, { buffer: file.buffer, mime, text, name }, profile);
      if (!text && analysis.text) text = analysis.text;
      analyzedBy = 'claude';
    } catch (e) {
      console.warn('[Kompass] Analyse Claude impossible, règles utilisées :', e.message);
    }
  }
  if (!analysis) {
    const type = classify(text, name);
    analysis = { type, ...extractFields(type, text, profile) };
  }
  const type = DOC_TYPES[analysis.type] ? analysis.type : 'other';

  const doc = {
    id: `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    mime,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    type,
    typeLabel: DOC_TYPES[type],
    fields: analysis.fields || [],
    observations: analysis.observations || [],
    signal: analysis.signal || { title: `${DOC_TYPES[type]} ajouté`, detail: '' },
    analyzedBy,
    text: text.slice(0, 6000),
    buffer: file.buffer
  };
  store.set(customerId, [...listDocuments(customerId), doc]);
  return doc;
}

// Chaque document devient un signal, que le client peut désactiver comme les autres.
export function documentSignals(customerId) {
  return listDocuments(customerId).map((d) => ({
    id: `doc-${d.id}`,
    family: 'situation',
    title: d.signal.title,
    detail: d.signal.detail || d.typeLabel,
    source: `Document : ${d.name}`,
    tone: d.signal.tone || undefined,
    documentId: d.id
  }));
}
