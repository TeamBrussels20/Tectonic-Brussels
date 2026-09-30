import { useEffect, useRef, useState } from 'react';
import Answer from './Answer.jsx';
import CompassMark from './CompassMark.jsx';
import { ACCEPTED_FILES, MAX_FILE_MB } from '../api.js';

const STARTERS = ['Je veux économiser de l’argent tous les mois', 'Je veux faire un prêt hypothécaire', 'Où part mon argent ?', 'Je veux préparer ma pension'];

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </svg>
  );
}

export default function Chat({ profile, messages, loading, error, onSend, onUpload, uploading }) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading, uploading]);

  function submit(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || loading) return;
    onSend(t);
    setText('');
  }

  function pickFiles(list) {
    const files = [...list];
    if (files.length) onUpload(files);
  }

  const drag = {
    onDragEnter: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth.current++; setDragging(true); } },
    onDragOver: (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); pickFiles(e.dataTransfer.files); }
  };

  const summary = messages.map((m) => `${m.role === 'user' ? 'Client' : 'Kompass'} : ${m.role === 'user' ? m.content : m.answer?.heading}`).join('\n');
  const nudge = profile?.nudge;
  const empty = messages.length === 0;
  const busy = loading || Boolean(uploading);

  return (
    <main className="chat" {...drag}>
      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <div>
            <PaperclipIcon />
            <p>Déposez votre document ici</p>
            <span>Fiche de paie, contrat, bail… PDF, image ou texte, {MAX_FILE_MB} Mo maximum</span>
          </div>
        </div>
      )}

      <div className="thread">
        {empty && profile && (
          <div className="welcome">
            <div className="welcome-compass"><CompassMark size={120} swing /></div>
            <h1>Où voulez-vous aller, {profile.customer.firstName} ?</h1>
            <p className="welcome-sub">Posez votre question avec vos mots, ou ajoutez un document comme une fiche de paie ou un contrat. Kompass s’appuie sur vos comptes pour vous montrer un chemin concret, et vous met en contact avec un conseiller quand c’est le bon moment.</p>

            {nudge && (
              <div className="nudge">
                <p className="nudge-title">{nudge.title}</p>
                <p>{nudge.body}</p>
                <button className="btn-primary" onClick={() => onSend(nudge.prompt)}>Oui, montrez-moi</button>
              </div>
            )}

            <div className="starters">
              {STARTERS.map((s) => <button key={s} className="chip" onClick={() => onSend(s)}>{s}</button>)}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user'
            ? (
              <div key={i} className="row-user">
                {m.attachment
                  ? <p className="bubble-user bubble-file"><PaperclipIcon /><span><strong>{m.attachment.name}</strong><small>{m.attachment.typeLabel}</small></span></p>
                  : <p className="bubble-user">{m.content}</p>}
              </div>
            )
            : <Answer key={i} answer={m.answer} customerId={profile.customer.id} onFollowup={onSend} conversationSummary={summary} />
        ))}

        {(loading || uploading) && (
          <div className="thinking" role="status">
            <CompassMark size={20} swing />
            <span>{uploading ? `Kompass lit « ${uploading} »…` : 'Kompass analyse votre situation…'}</span>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input ref={fileRef} type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn-attach" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Ajouter un document" title="Ajouter un document (PDF, image, texte)">
          <PaperclipIcon />
        </button>
        <textarea
          rows={1}
          value={text}
          placeholder="Ex. : je veux acheter un appartement dans deux ans, aide-moi"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
          aria-label="Votre question pour Kompass"
        />
        <button className="btn-send" type="submit" disabled={!text.trim() || busy}>Envoyer</button>
      </form>
      <p className="disclaimer">Kompass donne des repères, pas un conseil financier. Les décisions engageantes se prennent avec un conseiller KBC.</p>
    </main>
  );
}
