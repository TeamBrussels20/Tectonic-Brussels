import { useState } from 'react';
import CompassMark from './CompassMark';
import { api } from './api';
import type { Answer as AnswerData } from './types';

type Booking = { state: 'sending' } | { state: 'done'; ref: string } | { state: 'error'; message: string };

export default function Answer({ answer, customerId, onFollowup, conversationSummary }: {
  answer: AnswerData;
  customerId: string;
  onFollowup: (text: string) => void;
  conversationSummary: string;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);

  async function book() {
    setBooking({ state: 'sending' });
    try {
      const r = await api.handoff({ customerId, topic: answer.handoff!.topic, summary: conversationSummary });
      setBooking({ state: 'done', ref: r.ref });
    } catch (e) {
      setBooking({ state: 'error', message: (e as Error).message });
    }
  }

  return (
    <article className="answer">
      <header className="answer-head">
        <CompassMark size={22} />
        <h3>{answer.heading}</h3>
      </header>

      <p className="answer-reply">{answer.reply}</p>

      {answer.insights && answer.insights.length > 0 && (
        <dl className="insights">
          {answer.insights.map((i) => (
            <div key={i.label} className={`tone-${i.tone || 'neutral'}`}>
              <dt>{i.label}</dt>
              <dd>{i.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {answer.simulation && answer.simulation.rows?.length > 0 && (
        <section className="sim">
          <h4>{answer.simulation.title}</h4>
          <table>
            <tbody>
              {answer.simulation.rows.map((r) => (
                <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>
              ))}
            </tbody>
          </table>
          {answer.simulation.note && <p className="sim-note">{answer.simulation.note}</p>}
        </section>
      )}

      {answer.notes && answer.notes.length > 0 && (
        <section className="notes">
          <h4>Ce que ça change pour vous</h4>
          <ul>{answer.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}

      {answer.checklist && answer.checklist.length > 0 && (
        <section className="checklist">
          <h4>Votre dossier : {answer.checklist.filter((i) => i.done).length} pièces sur {answer.checklist.length}</h4>
          <ul>
            {answer.checklist.map((i) => (
              <li key={i.label} className={i.done ? 'done' : ''}>
                <span className="check" aria-hidden="true">{i.done ? '✓' : ''}</span>
                <span>{i.label}{i.note && <em> ({i.note})</em>}</span>
                <span className="sr-only">{i.done ? 'fourni' : 'à fournir'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.steps && answer.steps.length > 0 && (
        <section className="route">
          <h4>Votre itinéraire</h4>
          <ol>
            {answer.steps.map((s, i) => (
              <li key={i}>
                <span className="route-dot" aria-hidden="true">{i + 1}</span>
                <div><strong>{s.title}</strong><p>{s.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {answer.products && answer.products.length > 0 && (
        <section className="products">
          <h4>Ce qui peut vous aider chez KBC</h4>
          <ul>
            {answer.products.map((p) => (
              <li key={p.name}><strong>{p.name}</strong><span>{p.why}</span></li>
            ))}
          </ul>
        </section>
      )}

      {answer.handoff?.needed && (
        <section className="handoff">
          <div>
            <h4>Le moment de parler à un conseiller</h4>
            <p>{answer.handoff.reason}</p>
            <p className="handoff-note">Votre conseiller recevra un résumé de cette conversation. Vous n’aurez rien à réexpliquer.</p>
          </div>
          {booking?.state === 'done' ? (
            <p className="handoff-done" role="status">Demande envoyée, référence {booking.ref}. Un conseiller vous contacte sous 48 h.</p>
          ) : (
            <button className="btn-primary" onClick={book} disabled={booking?.state === 'sending'}>
              {booking?.state === 'sending' ? 'Envoi…' : 'Demander un rendez-vous'}
            </button>
          )}
          {booking?.state === 'error' && <p className="error">{booking.message}</p>}
        </section>
      )}

      {answer.followups && answer.followups.length > 0 && (
        <div className="followups">
          {answer.followups.map((f) => (
            <button key={f} className="chip" onClick={() => onFollowup(f)}>{f}</button>
          ))}
        </div>
      )}
    </article>
  );
}
