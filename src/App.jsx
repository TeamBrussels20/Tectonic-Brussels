import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import CompassMark from './components/CompassMark.jsx';
import ContextPanel from './components/ContextPanel.jsx';
import Chat from './components/Chat.jsx';

export default function App() {
  const [status, setStatus] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('lotte');
  const [profile, setProfile] = useState(null);
  const [consent, setConsent] = useState({});
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  // Référence toujours à jour : plusieurs documents peuvent être envoyés à la suite.
  const messagesRef = useRef([]);
  const setThread = (list) => { messagesRef.current = list; setMessages(list); };

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setError(e.message));
    api.customers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    setProfile(null);
    setThread([]);
    setConsent({});
    setError('');
    api.profile(customerId).then(setProfile).catch((e) => setError(e.message));
  }, [customerId]);

  const [uploading, setUploading] = useState(null);

  const refreshProfile = () => api.profile(customerId).then(setProfile).catch((e) => setError(e.message));

  async function send(text, extra = {}) {
    const next = [...messagesRef.current, { role: 'user', content: text, ...extra }];
    setThread(next);
    setLoading(true);
    setError('');
    try {
      const r = await api.chat({ customerId, messages: next, consent });
      setThread([...messagesRef.current, { role: 'assistant', answer: r.answer, source: r.source }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(files) {
    for (const file of files) {
      setUploading(file.name);
      setError('');
      try {
        const doc = await api.uploadDocument(customerId, file);
        await refreshProfile();
        setUploading(null);
        await send(`J’ai ajouté « ${doc.name} ». Qu’est-ce que vous en retenez ?`, { documentId: doc.id, attachment: { name: doc.name, typeLabel: doc.typeLabel } });
      } catch (e) {
        setUploading(null);
        setError(`« ${file.name} » : ${e.message}`);
      }
    }
  }

  async function removeDocument(docId) {
    try {
      await api.deleteDocument(customerId, docId);
      await refreshProfile();
    } catch (e) {
      setError(e.message);
    }
  }

  const toggle = (id) => setConsent((c) => ({ ...c, [id]: c[id] === false }));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <CompassMark size={30} />
          <span className="brand-name">Kompass</span>
          <span className="brand-by">by KBC</span>
        </div>

        <div className="topbar-right">
          {status && (
            <span className={`mode mode-${status.mode}`} title={status.mode === 'claude' ? status.model : 'Ajoutez ANTHROPIC_API_KEY dans .env pour activer Claude'}>
              {status.mode === 'claude' ? 'IA active' : 'Mode démo'}
            </span>
          )}
          <label className="persona">
            <span>Client de démo</span>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.age} ans</option>)}
            </select>
          </label>
          <button className="panel-toggle" onClick={() => setPanelOpen(true)}>Ma situation</button>
        </div>
      </header>

      <div className="layout">
        <ContextPanel profile={profile} consent={consent} onToggle={toggle} open={panelOpen} onClose={() => setPanelOpen(false)} onRemoveDocument={removeDocument} />
        <Chat profile={profile} messages={messages} loading={loading} error={error} onSend={send} onUpload={uploadFiles} uploading={uploading} />
      </div>
    </div>
  );
}
