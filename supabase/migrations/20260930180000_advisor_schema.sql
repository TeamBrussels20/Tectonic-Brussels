-- Personal financial advisor: client data, bank products, AI output and conversations.

create table clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  city text,
  country text not null default 'Belgium',
  status text not null default 'prospect' check (status in ('customer', 'prospect')),
  segment text,
  occupation text,
  employment_type text check (employment_type in ('employee', 'self_employed', 'civil_servant', 'student', 'retired', 'unemployed')),
  annual_gross_income numeric(12, 2),
  monthly_net_income numeric(12, 2),
  marital_status text,
  dependents int,
  housing text check (housing in ('owner', 'renter', 'with_parents', 'other')),
  risk_profile text not null default 'unknown' check (risk_profile in ('conservative', 'balanced', 'dynamic', 'unknown')),
  investment_horizon_years int,
  customer_since date,
  notes text,
  created_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  type text not null check (type in ('current', 'savings', 'investment', 'pension')),
  name text not null,
  iban text,
  balance numeric(14, 2) not null default 0,
  interest_rate numeric(5, 3),
  currency text not null default 'EUR'
);

create table transactions (
  id bigint generated always as identity primary key,
  client_id uuid not null references clients on delete cascade,
  account_id uuid not null references accounts on delete cascade,
  booked_on date not null,
  amount numeric(12, 2) not null, -- negative = outgoing
  category text not null,
  description text not null
);
create index transactions_client_date on transactions (client_id, booked_on);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  account_id uuid references accounts on delete set null,
  name text not null,
  asset_class text not null check (asset_class in ('equity', 'bonds', 'mixed', 'real_estate', 'cash', 'pension')),
  market_value numeric(14, 2) not null,
  cost_basis numeric(14, 2)
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  type text not null check (type in ('mortgage', 'car', 'personal', 'credit_card', 'student')),
  outstanding numeric(14, 2) not null,
  interest_rate numeric(5, 3) not null,
  monthly_payment numeric(10, 2) not null,
  end_date date
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  title text not null,
  target_amount numeric(14, 2),
  current_amount numeric(14, 2) not null default 0,
  target_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create table products (
  code text primary key,
  name text not null,
  category text not null check (category in ('savings', 'investment', 'pension', 'lending', 'insurance', 'banking')),
  description text not null,
  key_terms text not null,
  risk_level int check (risk_level between 1 and 7),
  suitable_for text not null
);

create table assessments (
  client_id uuid primary key references clients on delete cascade,
  summary text not null,
  health_score int not null check (health_score between 0 and 100),
  strengths text[] not null default '{}',
  risks text[] not null default '{}',
  missing_information text[] not null default '{}',
  generated_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  title text not null,
  category text not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  rationale text not null,
  next_step text not null,
  product_code text references products,
  estimated_annual_impact numeric(12, 2),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  created_at timestamptz not null default now()
);

-- Full Claude message history (including thinking/tool blocks), appended to only.
create table conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients on delete cascade,
  channel text not null check (channel in ('client', 'employee')),
  messages jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Hackathon demo access: the dashboard reads with the publishable key; the edge
-- function writes with the service role. Replace with employee auth before real data.
do $$
declare t text;
begin
  foreach t in array array['clients', 'accounts', 'transactions', 'holdings', 'loans', 'goals',
                           'products', 'assessments', 'recommendations', 'conversations']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "demo read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

create policy "demo update status" on recommendations for update to anon, authenticated using (true) with check (true);
create policy "demo create prospect" on clients for insert to anon, authenticated with check (status = 'prospect');
