async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Le serveur Kompass ne répond pas. Vérifiez que « npm run dev » tourne.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Le serveur Kompass a répondu ${res.status}.`);
  return data;
}

export const api = {
  status: () => request('/api/status'),
  customers: () => request('/api/customers'),
  profile: (id) => request(`/api/customers/${id}/profile`),
  chat: (body) => request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  uploadDocument: (customerId, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/api/customers/${customerId}/documents`, { method: 'POST', body: form });
  },
  deleteDocument: (customerId, docId) => request(`/api/customers/${customerId}/documents/${docId}`, { method: 'DELETE' }),
  handoff: (body) => request('/api/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
};

export const eur = (n) => `${Math.round(n).toLocaleString('fr-BE')} €`;

export const ACCEPTED_FILES = '.pdf,.png,.jpg,.jpeg,.webp,.txt';
export const MAX_FILE_MB = 10;
