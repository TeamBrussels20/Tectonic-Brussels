import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import { customers, getCustomer } from './data/customers.js';
import { buildProfile } from './signals.js';
import { mockAnswer } from './mockAdvisor.js';
import { buildSystemPrompt } from './prompt.js';
import { addDocument, deleteDocument, listDocuments, publicDoc, ALLOWED_MIME } from './documents.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
const mode = anthropic ? 'claude' : 'demo';

app.get('/api/status', (_req, res) => res.json({ mode, model: anthropic ? model : null }));

app.get('/api/customers', (_req, res) => {
  res.json(customers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, age: c.age, city: c.city })));
});

app.get('/api/customers/:id/profile', (req, res) => {
  const c = getCustomer(req.params.id);
  if (!c) return res.status(404).json({ error: 'Client introuvable' });
  res.json(buildProfile(c));
});

// ---------- Documents ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_MIME.includes(file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype);
    cb(ok ? null : new Error('Format non pris en charge. Utilisez un PDF, une image (PNG, JPG) ou un fichier texte.'), ok);
  }
});

app.get('/api/customers/:id/documents', (req, res) => {
  res.json(listDocuments(req.params.id).map(publicDoc));
});

app.post('/api/customers/:id/documents', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd : 10 Mo maximum.' : err.message;
      return res.status(400).json({ error: message });
    }
    const c = getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Client introuvable' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    try {
      const doc = await addDocument(c.id, req.file, buildProfile(c), { anthropic, model });
      res.json(publicDoc(doc));
    } catch (e) {
      console.error('[Kompass] Erreur document :', e);
      res.status(500).json({ error: 'Le document n\u2019a pas pu être analysé.' });
    }
  });
});

app.delete('/api/customers/:id/documents/:docId', (req, res) => {
  res.json({ ok: deleteDocument(req.params.id, req.params.docId) });
});

function parseJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return JSON.parse(clean.slice(start, end + 1));
}

app.post('/api/chat', async (req, res) => {
  const { customerId, messages = [], consent = {} } = req.body;
  const c = getCustomer(customerId);
  if (!c) return res.status(404).json({ error: 'Client introuvable' });
  const profile = buildProfile(c);

  // L'historique envoyé au modèle ne contient que le texte des échanges.
  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.role === 'assistant' ? (m.answer?.reply || m.content || '') : m.content, documentId: m.documentId }))
    .filter((m) => m.content);

  if (!anthropic) {
    await new Promise((r) => setTimeout(r, 700)); // petite latence réaliste en démo
    return res.json({ source: 'demo', answer: mockAnswer(profile, history, consent) });
  }

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: buildSystemPrompt(profile, consent),
      messages: history.map(({ role, content }) => ({ role, content }))
    });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    res.json({ source: 'claude', answer: parseJson(text) });
  } catch (err) {
    console.error('[Kompass] Erreur Claude, bascule en mode démo :', err.message);
    res.json({ source: 'demo-fallback', answer: mockAnswer(profile, history, consent) });
  }
});

// Rendez-vous conseiller (simulé) : dans la vraie vie, cela créerait un lead
// dans le CRM avec le résumé de la conversation, pour que le client n'ait
// jamais à tout réexpliquer.
app.post('/api/handoff', (req, res) => {
  const { customerId, topic, summary } = req.body;
  console.log(`[Kompass] Demande de RDV pour ${customerId} : ${topic}\n${summary}`);
  res.json({ ok: true, ref: `KMP-${Date.now().toString().slice(-6)}` });
});

// En production (npm run build puis npm start), le serveur sert aussi le front.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (e) => e && next()));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`\n  Kompass API sur http://localhost:${port}`);
  console.log(`  Mode : ${mode === 'claude' ? `Claude (${model})` : 'démo (aucune clé ANTHROPIC_API_KEY)'}\n`);
});
