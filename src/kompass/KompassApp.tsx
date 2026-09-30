import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { api } from './api';
import CompassMark from './CompassMark';
import ContextPanel from './ContextPanel';
import Chat from './Chat';
import type { Consent, CustomerSummary, Message, Profile, Status } from './types';
import './kompass.css';

// The customer's app. `customerId` is undefined until the demo customer list is loaded.
export default function KompassApp({ customerId: requested, onCustomerChange }: {
  customerId?: string;
  onCustomerChange: (id: string) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [consent, setConsent] = useState<Consent>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  // Référence toujours à jour : plusieurs documents peuvent être envoyés à la suite.
  const messagesRef = useRef<Message[]>([]);
  const setThread = (list: Message[]) => { messagesRef.current = list; setMessages(list); };
  const customerId = requested ?? customers[0]?.id;

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setError(e.message));
    api.customers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerId) return;
    setProfile(null);
    setThread([]);
    setConsent({});
    setError('');
    api.profile(customerId).then(setProfile).catch((e) => setError(e.message));
  }, [customerId]);

  const [uploading, setUploading] = useState<string | null>(null);

  const refreshProfile = () => api.profile(customerId!).then(setProfile).catch((e) => setError(e.message));

  async function send(text: string, extra: Partial<Extract<Message, { role: 'user' }>> = {}) {
    const next: Message[] = [...messagesRef.current, { role: 'user', content: text, ...extra }];
    setThread(next);
    setLoading(true);
    setError('');
    try {
      const r = await api.chat({ customerId: customerId!, messages: next, consent });
      setThread([...messagesRef.current, { role: 'assistant', answer: r.answer, source: r.source }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      setUploading(file.name);
      setError('');
      try {
        const doc = await api.uploadDocument(customerId!, file);
        await refreshProfile();
        setUploading(null);
        await send(`J’ai ajouté « ${doc.name} ». Qu’est-ce que vous en retenez ?`, { documentId: doc.id, attachment: { name: doc.name, typeLabel: doc.typeLabel } });
      } catch (e) {
        setUploading(null);
        setError(`« ${file.name} » : ${(e as Error).message}`);
      }
    }
  }

  async function removeDocument(docId: string) {
    try {
      await api.deleteDocument(customerId!, docId);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggle = (id: string) => setConsent((c) => ({ ...c, [id]: c[id] === false }));

  return (
    <div className="kompass" lang="fr">
      <header className="topbar">
        <div className="brand">
          <CompassMark size={30} />
          <span className="brand-name">Kompass</span>
          <span className="brand-by">by KBC</span>
        </div>

        <div className="topbar-right">
          {status && (
            <span className={`mode mode-${status.mode}`} title={status.mode === 'claude' ? status.model ?? undefined : 'Ajoutez ANTHROPIC_API_KEY dans .env pour activer Claude'}>
              {status.mode === 'claude' ? 'IA active' : 'Mode démo'}
            </span>
          )}
          <label className="persona">
            <span>Client de démo</span>
            <select value={customerId ?? ''} onChange={(e) => onCustomerChange(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.age} ans</option>)}
            </select>
          </label>
          <button className="panel-toggle" onClick={() => setPanelOpen(true)}>Ma situation</button>
          <Link to="/advisor" className="advisor-link" title="Vue conseiller de la démo">Espace conseiller</Link>
        </div>
      </header>

      <div className="layout">
        <ContextPanel profile={profile} consent={consent} onToggle={toggle} open={panelOpen} onClose={() => setPanelOpen(false)} onRemoveDocument={removeDocument} />
        <Chat profile={profile} messages={messages} loading={loading} error={error} onSend={send} onUpload={uploadFiles} uploading={uploading} />
      </div>
    </div>
  );
}
