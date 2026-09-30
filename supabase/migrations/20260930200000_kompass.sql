-- Kompass (customer app): behavioural signals and appointment requests.

-- What the bank observes beyond transactions: activity in the mobile app,
-- detected life events and subscriptions that no longer seem used.
-- Titles are customer-facing (Kompass shows them as signals).
create table client_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  kind text not null check (kind in ('app_activity', 'life_event', 'unused_subscription')),
  code text not null, -- stable identifier used by the signals engine, e.g. 'mortgage_simulator'
  title text not null,
  detail text,
  count int not null default 1,
  occurred_on date not null default current_date
);
create index client_events_client on client_events (client_id);

-- "Demander un rendez-vous" in Kompass: the advisor gets the conversation
-- summary so the customer never has to explain everything again.
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  reference text not null unique,
  topic text not null,
  summary text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index handoffs_client on handoffs (client_id, created_at);

-- Same hackathon demo access as the advisor schema.
alter table client_events enable row level security;
alter table handoffs enable row level security;
create policy "demo read" on client_events for select to anon, authenticated using (true);
create policy "demo read" on handoffs for select to anon, authenticated using (true);
create policy "demo update status" on handoffs for update to anon, authenticated using (true) with check (true);
