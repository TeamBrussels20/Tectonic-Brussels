import { eur } from '../api.js';

const FAMILIES = [
  { id: 'situation', label: 'Votre situation', hint: 'Ce qui est vrai aujourd’hui' },
  { id: 'comportement', label: 'Ce qui change', hint: 'Tendances des 6 derniers mois' },
  { id: 'intention', label: 'Ce que vous préparez', hint: 'Vos recherches et événements de vie' }
];

const ACCOUNT_LABEL = { courant: 'Compte courant', epargne: 'Épargne', pension: 'Pension', credit: 'Crédit' };

export default function ContextPanel({ profile, consent, onToggle, open, onClose, onRemoveDocument }) {
  if (!profile) return <aside className={`context${open ? ' open' : ''}`} />;
  const { customer: c, metrics: m, signals, lifeMoment, documents = [] } = profile;

  return (
    <aside className={`context${open ? ' open' : ''}`} aria-label="Ce que Kompass comprend de votre situation">
      <button className="context-close" onClick={onClose} aria-label="Fermer le panneau">×</button>

      <div className="who">
        <p className="who-name">{c.firstName} {c.lastName}</p>
        <p className="who-meta">{c.age} ans, {c.city}. {c.household}.</p>
      </div>

      <div className="moment">
        <span className="moment-label">Moment de vie</span>
        <strong>{lifeMoment.label}</strong>
        <p>{lifeMoment.why}</p>
      </div>

      <dl className="accounts">
        {c.accounts.map((a) => (
          <div key={a.name}>
            <dt>{a.name}<span>{ACCOUNT_LABEL[a.type]}</span></dt>
            <dd className={a.balance < 0 ? 'neg' : ''}>{eur(a.balance)}</dd>
          </div>
        ))}
      </dl>

      <div className="flow">
        <div><span>Revenus / mois</span><strong>{eur(m.avgIncome)}</strong></div>
        <div><span>Dépenses / mois</span><strong>{eur(m.avgSpending)}</strong></div>
        <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (m.avgSpending / m.avgIncome) * 100)}%` }} /></div>
      </div>

      <h2 className="signals-title">Vos documents</h2>
      {documents.length === 0 ? (
        <p className="signals-intro">Ajoutez une fiche de paie, un bail ou un contrat avec le trombone, ou glissez-le dans la conversation. Kompass en extrait l’essentiel.</p>
      ) : (
        <ul className="docs">
          {documents.map((d) => (
            <li key={d.id}>
              <div className="doc-head">
                <div>
                  <p className="doc-type">{d.typeLabel}</p>
                  <p className="doc-name" title={d.name}>{d.name}</p>
                </div>
                <button className="doc-remove" onClick={() => onRemoveDocument(d.id)} aria-label={`Supprimer ${d.name}`} title="Supprimer ce document">×</button>
              </div>
              {d.fields.length > 0 && (
                <dl className="doc-fields">
                  {d.fields.slice(0, 3).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                </dl>
              )}
              <p className="doc-by">{d.analyzedBy === 'claude' ? 'Lu par Claude' : 'Lu automatiquement (mode démo)'}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="docs-privacy">Démo : les documents restent en mémoire sur votre ordinateur et sont effacés au redémarrage du serveur.</p>

      <h2 className="signals-title">Ce que Kompass comprend</h2>
      <p className="signals-intro">Vous décidez de ce que Kompass peut utiliser. Désactivez un signal et il ne sera plus pris en compte.</p>

      {FAMILIES.map((f) => {
        const list = signals.filter((s) => s.family === f.id);
        if (!list.length) return null;
        return (
          <section key={f.id} className="family">
            <h3>{f.label} <span>{f.hint}</span></h3>
            <ul>
              {list.map((s) => {
                const on = consent[s.id] !== false;
                return (
                  <li key={s.id} className={`${on ? '' : 'off'} ${s.tone === 'warn' ? 'warn' : ''}`}>
                    <div>
                      <p className="sig-title">{s.title}</p>
                      <p className="sig-detail">{s.detail}</p>
                      <p className="sig-source">Source : {s.source}</p>
                    </div>
                    <button role="switch" aria-checked={on} aria-label={`Utiliser le signal ${s.title}`} className="switch" onClick={() => onToggle(s.id)}><i /></button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
