-- Synthetic demo data. All people, IBANs and product terms are fictional.
select setseed(0.42);

-- Helpers used only while seeding ------------------------------------------------

-- One fixed transaction per month for the last 6 full months.
create function pg_temp.monthly(c uuid, a uuid, dom int, amt numeric, cat text, descr text, jitter numeric default 0)
returns void language sql as $$
  insert into transactions (client_id, account_id, booked_on, amount, category, description)
  select c, a,
         (date_trunc('month', current_date) - make_interval(months => m))::date + (dom - 1),
         round(amt * (1 + jitter * (random()::numeric * 2 - 1)), 2), cat, descr
  from generate_series(1, 6) m;
$$;

-- `per_month` random transactions per month between lo and hi (outgoing).
create function pg_temp.variable(c uuid, a uuid, per_month int, lo numeric, hi numeric, cat text, descrs text[])
returns void language sql as $$
  insert into transactions (client_id, account_id, booked_on, amount, category, description)
  select c, a,
         (date_trunc('month', current_date) - make_interval(months => m))::date + floor(random() * 28)::int,
         -round(lo + random()::numeric * (hi - lo), 2), cat,
         descrs[1 + floor(random() * array_length(descrs, 1))::int]
  from generate_series(1, 6) m, generate_series(1, per_month);
$$;

-- One transaction per month with an explicit amount per month.
-- amounts[1] is the most recent full month, amounts[6] six months ago. 0 = no transaction.
create function pg_temp.series(c uuid, a uuid, dom int, amounts numeric[], cat text, descr text)
returns void language sql as $$
  insert into transactions (client_id, account_id, booked_on, amount, category, description)
  select c, a, (date_trunc('month', current_date) - make_interval(months => m))::date + (dom - 1), -amounts[m], cat, descr
  from generate_series(1, 6) m
  where amounts[m] <> 0;
$$;

-- A monthly total (same indexing as series) split evenly over several shops.
create function pg_temp.spread(c uuid, a uuid, amounts numeric[], cat text, descrs text[])
returns void language sql as $$
  insert into transactions (client_id, account_id, booked_on, amount, category, description)
  select c, a, (date_trunc('month', current_date) - make_interval(months => m))::date + (3 + (i - 1) * 25 / array_length(descrs, 1)),
         -round(amounts[m] / array_length(descrs, 1), 2), cat, descrs[i]
  from generate_series(1, 6) m, generate_series(1, array_length(descrs, 1)) i
  where amounts[m] <> 0;
$$;

-- Products -----------------------------------------------------------------------

insert into products (code, name, category, description, key_terms, risk_level, suitable_for) values
('SAVE_PLUS', 'Savings Account Plus', 'savings', 'Instant-access regulated savings account.', 'Base rate 1.25% + loyalty premium 0.75% (indicative). No fees. Instant access.', 1, 'Emergency funds and short-term savings (< 2 years).'),
('TERM_12M', 'Term Deposit 12 Months', 'savings', 'Fixed-rate deposit, capital locked for 12 months.', 'Fixed 2.40% gross (indicative). Minimum EUR 5,000.', 1, 'Cash not needed for 12 months; conservative clients.'),
('INVEST_PLAN', 'Monthly Investment Plan', 'investment', 'Automatic monthly investment in a diversified balanced fund (approx. 50% equity / 50% bonds).', 'From EUR 50/month. Entry fee 1%, ongoing charges 1.4%/yr. Can pause anytime.', 3, 'First-time investors with a horizon of 5+ years.'),
('GLOBAL_EQ', 'Global Equity Index Fund', 'investment', 'Low-cost fund tracking developed-market equities worldwide.', 'Ongoing charges 0.40%/yr. Daily liquidity.', 5, 'Dynamic/balanced clients with horizon of 8+ years.'),
('BOND_FUND', 'Euro Investment-Grade Bond Fund', 'investment', 'Diversified euro-denominated government and corporate bonds.', 'Ongoing charges 0.55%/yr. Daily liquidity.', 2, 'Reducing portfolio volatility; clients nearing a goal date.'),
('RETIRE_PLAN', 'Retirement Glide-Path Portfolio', 'investment', 'Managed portfolio that gradually shifts from equities to bonds and cash as the retirement date approaches, with optional monthly payout phase.', 'Management fee 0.9%/yr. Payout phase optional.', 3, 'Clients within 10 years of retirement.'),
('PENSION_FUND', 'Pension Savings Fund', 'pension', 'Long-term pension savings fund eligible for the Belgian pension-savings tax reduction.', 'Tax reduction on contributions up to the annual legal ceiling. Ongoing charges 1.2%/yr. Long-term lock-in with tax on exit at 60.', 3, 'Belgian tax residents aged 18-64 with taxable income.'),
('LIFE_B21', 'Guaranteed Life Savings (Branch 21)', 'insurance', 'Capital-guaranteed life insurance savings with profit sharing.', 'Guaranteed rate 1.75% + variable profit share (indicative). Entry fee 2%.', 1, 'Conservative savers, estate planning, 8+ years.'),
('EDU_PLAN', 'Children''s Future Plan', 'investment', 'Monthly investment plan earmarked for a child, with optional gifting documentation.', 'From EUR 25/month. Balanced fund, ongoing charges 1.3%/yr.', 3, 'Parents and grandparents saving for education 8+ years ahead.'),
('MORTGAGE', 'Home Mortgage', 'lending', 'Fixed or variable rate mortgage for buying or building a home.', 'Fixed 20y from 3.10% (indicative). Up to 90% LTV for first-time buyers. Requires own funds for registration fees.', null, 'Home buyers with stable income; typical debt-to-income limit around 1/3 of net income.'),
('GREEN_LOAN', 'Energy Renovation Loan', 'lending', 'Loan for insulation, heat pumps, solar panels and other energy-efficiency works.', 'From 2.90% fixed (indicative), up to EUR 60,000, 3-15 years.', null, 'Homeowners planning energy renovations.'),
('DEBT_CONSOL', 'Debt Consolidation Loan', 'lending', 'Replaces expensive credit card and personal loan balances with one fixed-rate loan.', 'From 6.40% fixed (indicative), 12-60 months.', null, 'Clients paying high interest on revolving credit.'),
('INCOME_PROTECT', 'Income Protection Insurance', 'insurance', 'Replaces part of income in case of long-term illness or disability.', 'Monthly premium depends on age and occupation; covers up to 80% of income after waiting period.', null, 'Self-employed people and single earners.'),
('BUSINESS_ACC', 'Business Account for Self-Employed', 'banking', 'Separate professional account with invoicing, VAT reserve pots and accounting export.', 'EUR 6/month. Automatic tax/VAT set-aside rules.', null, 'Freelancers and small business owners.'),
('INVEST_CREDIT', 'Business Investment Credit', 'lending', 'Financing for professional vehicles and equipment.', 'From 4.20% fixed (indicative), 2-7 years.', null, 'SMEs and self-employed with an established activity.'),
('BUDGET_COACH', 'Budget Coach (mobile app)', 'banking', 'Free categorised spending insights, budgets per category and subscription tracker.', 'Free for all customers.', null, 'Anyone who wants to control spending.');

-- Clients -------------------------------------------------------------------------

insert into clients (id, full_name, email, phone, date_of_birth, city, status, segment, occupation, employment_type,
                     annual_gross_income, monthly_net_income, marital_status, dependents, housing, risk_profile,
                     investment_horizon_years, customer_since, notes) values
('11111111-1111-4111-8111-111111111111', 'Lotte Peeters', 'lotte.peeters@example.be', '+32 470 11 22 33', '1997-04-12', 'Ghent',
 'customer', 'Young professional', 'UX designer (permanent contract since 2022)', 'employee', 57800, 2860, 'single', 0, 'renter', 'balanced',
 10, '2015-09-01', 'Mentioned in the app survey that she wants to buy an apartment within a few years. Rent was indexed in July.'),
('22222222-2222-4222-8222-222222222222', 'Jan Vermeulen', 'jan.vermeulen@example.be', '+32 475 44 55 66', '1981-02-03', 'Leuven',
 'customer', 'Family', 'IT project manager', 'employee', 82000, 5200, 'married', 2, 'owner', 'balanced',
 15, '2004-06-15', 'Two children (9 and 12). Partner banks elsewhere. Owns a 1970s house with poor energy label.'),
('33333333-3333-4333-8333-333333333333', 'Amira El Idrissi', 'amira.elidrissi@example.be', '+32 486 77 88 99', '1992-10-21', 'Brussels',
 'customer', 'Self-employed', 'Freelance graphic designer', 'self_employed', 48000, 2900, 'single', 0, 'renter', 'unknown',
 null, '2019-03-10', null),
('44444444-4444-4444-8444-444444444444', 'Marc Dubois', 'marc.dubois@example.be', '+32 478 12 34 56', '1965-06-30', 'Namur',
 'customer', 'Private banking', 'Senior engineer', 'employee', 98000, 5900, 'married', 0, 'owner', 'dynamic',
 4, '1991-01-20', 'Plans to retire at 65. Risk profile questionnaire last updated in 2014.'),
('55555555-5555-4555-8555-555555555555', 'Lotte Janssens', 'lotte.j@example.be', null, '2003-01-08', 'Antwerp',
 'prospect', null, null, null, null, null, null, null, null, 'unknown', null, null,
 'Signed up via the website chat. No further information yet.'),
('77777777-7777-4777-8777-777777777777', 'Karim El Amrani', 'karim.elamrani@example.be', '+32 495 31 42 53', '1988-03-17', 'Liège',
 'customer', 'Family', 'Nurse (full-time); partner Sophie Lambert is a teacher (80%)', 'employee', 51000, 2800, 'cohabiting', 3, 'owner', 'conservative',
 null, '2012-05-02', 'Joint account with partner Sophie Lambert. Car loan with Autofin Belgium (another lender).'),
('66666666-6666-4666-8666-666666666666', 'Thomas Claes', 'thomas@bakkerijclaes.example.be', '+32 491 23 45 67', '1988-08-14', 'Mechelen',
 'prospect', 'Small business', 'Owner of an artisan bakery', 'self_employed', null, 4100, 'married', 2, 'owner', 'unknown', null, null,
 'Online contact form: currently banks elsewhere, has ~EUR 60,000 savings at another bank, wants to consolidate business and private banking. Considering buying a delivery van.');

-- Accounts --------------------------------------------------------------------------

insert into accounts (id, client_id, type, name, iban, balance, interest_rate) values
('a1111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'current', 'Current account', 'BE68 7340 1234 5678', 14820.35, 0),
('a1111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'savings', 'Savings account', 'BE12 3456 7890 1002', 23400.00, 0.75),

('a7777777-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'current', 'Joint account', 'BE77 3456 7890 7001', -180.00, 0),
('a7777777-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', 'savings', 'Savings account', 'BE77 3456 7890 7002', 3200.00, 0.75),

('a2222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'current', 'Current account', 'BE22 3456 7890 2001', 6310.12, 0),
('a2222222-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'savings', 'Savings account', 'BE22 3456 7890 2002', 41500.00, 0.80),
('a2222222-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'investment', 'Investment account', 'BE22 3456 7890 2003', 0, null),

('a3333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'current', 'Current account', 'BE33 3456 7890 3001', 1148.70, 0),
('a3333333-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'savings', 'Savings account', 'BE33 3456 7890 3002', 2400.00, 0.75),

('a4444444-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'current', 'Current account', 'BE44 3456 7890 4001', 22040.90, 0),
('a4444444-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'savings', 'Savings account', 'BE44 3456 7890 4002', 65000.00, 0.80),
('a4444444-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 'investment', 'Investment account', 'BE44 3456 7890 4003', 0, null),
('a4444444-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 'pension', 'Pension savings', 'BE44 3456 7890 4004', 0, null);

-- Holdings --------------------------------------------------------------------------

insert into holdings (client_id, account_id, name, asset_class, market_value, cost_basis) values
('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000003', 'Global Equity Index Fund', 'equity', 28400, 21000),
('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000003', 'Balanced Mixed Fund', 'mixed', 15200, 14000),
('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000003', 'Tech Leaders Equity Fund', 'equity', 142000, 88000),
('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000003', 'European individual stocks (8 positions)', 'equity', 96000, 71000),
('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000003', 'Global Equity Index Fund', 'equity', 48000, 39000),
('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000003', 'Euro Investment-Grade Bond Fund', 'bonds', 12000, 12500),
('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000004', 'Pension Savings Fund', 'pension', 38000, 29000);

update accounts a set balance = h.total
from (select account_id, sum(market_value) total from holdings group by account_id) h
where a.id = h.account_id;

-- Loans -----------------------------------------------------------------------------

insert into loans (client_id, type, outstanding, interest_rate, monthly_payment, end_date) values
('22222222-2222-4222-8222-222222222222', 'mortgage', 186000, 1.90, 1240, '2041-05-01'),
('22222222-2222-4222-8222-222222222222', 'car', 14500, 5.90, 420, '2029-03-01'),
('33333333-3333-4333-8333-333333333333', 'credit_card', 4800, 16.90, 150, null),
('33333333-3333-4333-8333-333333333333', 'personal', 7500, 7.40, 260, '2028-11-01'),
('77777777-7777-4777-8777-777777777777', 'mortgage', 168000, 2.10, 1240, '2045-06-01'),
('77777777-7777-4777-8777-777777777777', 'car', 9380, 7.49, 385, '2028-11-01');

-- Goals -----------------------------------------------------------------------------

insert into goals (client_id, title, target_amount, current_amount, target_date, priority) values
('11111111-1111-4111-8111-111111111111', 'Buy first apartment in Ghent (own funds)', 60000, 23400, '2029-06-30', 'high'),
('22222222-2222-4222-8222-222222222222', 'University fund for both children', 50000, 8000, '2034-09-01', 'high'),
('22222222-2222-4222-8222-222222222222', 'Energy renovation (insulation + heat pump)', 35000, 0, '2027-12-31', 'medium'),
('33333333-3333-4333-8333-333333333333', 'Pay off credit card', 4800, 0, '2027-06-30', 'high'),
('44444444-4444-4444-8444-444444444444', 'Retire at 65 with EUR 4,000/month net', null, 0, '2030-07-01', 'high'),
('44444444-4444-4444-8444-444444444444', 'Help grandchildren with education', 20000, 0, '2035-01-01', 'low');

-- Transactions (last 6 full months) ----------------------------------------------------

-- Lotte: saves regularly, rent indexed in July, lots of idle cash, thinking about buying.
-- Matches samples/fiche-de-paie-lotte-peeters-2026-09.pdf and samples/contrat-de-bail-lotte-peeters.pdf.
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 28, 2863.19, 'income', 'Salary - Studio Noord BV');
select pg_temp.series('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 1, array[1050, 1050, 980, 980, 980, 980], 'housing', 'Rent - Immo Ghent');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 1, -60, 'housing', 'Building charges - Immo Ghent');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 8, -55, 'subscriptions', 'Proximus internet + mobile');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 3, -29.99, 'subscriptions', 'Basic-Fit');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 12, -15.99, 'subscriptions', 'Netflix');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 14, -11.99, 'subscriptions', 'Spotify');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 20, -9.99, 'subscriptions', 'Disney+');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 2, -65, 'transport', 'NMBS/SNCB season ticket');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 18, -53, 'transport', 'Cambio car sharing');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 16, -35, 'health', 'Pharmacy');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 22, -80, 'other', 'Cash withdrawal');
select pg_temp.monthly('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', 29, -500, 'savings_transfer', 'Transfer to savings account');
select pg_temp.spread('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', array[405, 400, 420, 395, 410, 380], 'groceries', array['Delhaize', 'Colruyt', 'Albert Heijn', 'Local market']);
select pg_temp.spread('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', array[270, 350, 290, 260, 310, 240], 'leisure', array['Concert tickets', 'Cafe Labath', 'Weekend trip']);
select pg_temp.spread('11111111-1111-4111-8111-111111111111', 'a1111111-0000-4000-8000-000000000001', array[190, 210, 260, 150, 240, 180], 'shopping', array['Zalando', 'Bol.com', 'Coolblue']);

-- Jan: family budget, mortgage + car loan, kids.
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 25, 5200, 'income', 'Salary - Orbis Consulting');
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 1, -1240, 'housing', 'Mortgage repayment');
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 5, -420, 'loans', 'Car loan repayment');
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 6, -310, 'utilities', 'Energy (gas + electricity)', 0.2);
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 8, -89, 'utilities', 'Internet, TV & mobile');
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 10, -142, 'insurance', 'Home, car & family insurance');
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 3, -360, 'children', 'School, after-school care & activities', 0.1);
select pg_temp.monthly('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 26, -150, 'savings_transfer', 'Monthly plan - Global Equity Index Fund');
select pg_temp.variable('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 10, 40, 125, 'groceries', array['Colruyt', 'Delhaize', 'Aldi', 'Carrefour']);
select pg_temp.variable('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 4, 50, 80, 'transport', array['Fuel - TotalEnergies', 'Fuel - Q8']);
select pg_temp.variable('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 3, 30, 110, 'dining', array['Family restaurant', 'Pizzeria', 'Takeaway']);
select pg_temp.variable('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 3, 25, 220, 'shopping', array['Decathlon', 'IKEA', 'Kids clothing', 'Bol.com']);
select pg_temp.variable('22222222-2222-4222-8222-222222222222', 'a2222222-0000-4000-8000-000000000001', 1, 80, 600, 'leisure', array['Holiday park', 'Family day out', 'Sports club']);

-- Amira: irregular freelance income, quarterly social contributions, high-interest debt.
insert into transactions (client_id, account_id, booked_on, amount, category, description)
select '33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001',
       (date_trunc('month', current_date) - make_interval(months => m))::date + 14, amt, 'income', 'Client invoice payment'
from unnest(array[1, 2, 3, 4, 5, 6], array[1800, 4600, 2100, 3900, 1500, 5200]) as t(m, amt);
insert into transactions (client_id, account_id, booked_on, amount, category, description)
select '33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001',
       (date_trunc('month', current_date) - make_interval(months => m))::date + 19, -1050, 'taxes', 'Quarterly social security contribution (self-employed)'
from unnest(array[2, 5]) m;
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 1, -980, 'housing', 'Rent - Ixelles studio');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 5, -95, 'utilities', 'Energy', 0.15);
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 8, -49, 'utilities', 'Internet & mobile');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 10, -150, 'loans', 'Credit card repayment');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 12, -260, 'loans', 'Personal loan repayment');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 15, -62.99, 'business', 'Adobe Creative Cloud');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 3, -49, 'transport', 'STIB/MIVB pass');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 12, -13.99, 'subscriptions', 'Netflix');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 14, -11.99, 'subscriptions', 'Spotify');
select pg_temp.monthly('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 20, -17.99, 'subscriptions', 'Disney+');
select pg_temp.variable('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 7, 20, 70, 'groceries', array['Carrefour Express', 'Delhaize', 'Night shop']);
select pg_temp.variable('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 9, 18, 75, 'dining', array['Uber Eats', 'Deliveroo', 'Bar', 'Restaurant']);
select pg_temp.variable('33333333-3333-4333-8333-333333333333', 'a3333333-0000-4000-8000-000000000001', 3, 40, 190, 'shopping', array['Zara', 'Amazon', 'Fnac', 'Inno']);

-- Marc: high earner close to retirement, heavy equity exposure, large idle cash.
select pg_temp.monthly('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 25, 5900, 'income', 'Salary - Meuse Engineering SA');
select pg_temp.monthly('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 6, -240, 'utilities', 'Energy', 0.2);
select pg_temp.monthly('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 8, -95, 'utilities', 'Internet, TV & mobile');
select pg_temp.monthly('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 10, -210, 'insurance', 'Home, car & hospitalisation insurance');
select pg_temp.monthly('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 20, -90, 'savings_transfer', 'Pension savings contribution');
select pg_temp.variable('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 8, 50, 160, 'groceries', array['Delhaize', 'Carrefour', 'Local butcher']);
select pg_temp.variable('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 4, 40, 180, 'dining', array['Restaurant', 'Brasserie', 'Wine bar']);
select pg_temp.variable('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 4, 55, 90, 'transport', array['Fuel - TotalEnergies', 'Fuel - Esso']);
select pg_temp.variable('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 1, 300, 2200, 'travel', array['Brussels Airlines', 'Hotel booking', 'Holiday rental']);
select pg_temp.variable('44444444-4444-4444-8444-444444444444', 'a4444444-0000-4000-8000-000000000001', 2, 50, 300, 'shopping', array['Garden centre', 'Mediamarkt', 'Clothing']);

-- Karim: family of five, third child born in spring, joint account now ends the month overdrawn.
-- Matches samples/contrat-pret-auto-el-amrani.pdf.
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 25, 2800, 'income', 'Salary - CHR Citadelle');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 26, 2300, 'income', 'Salary - Sophie Lambert (FWB)');
select pg_temp.series('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 10, array[-620, -620, -620, -620, -380, -380], 'income', 'Family allowance - Famiwal');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 1, -1240, 'housing', 'Mortgage repayment');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 5, -385, 'loans', 'Car loan - Autofin Belgium');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 6, -310, 'utilities', 'Engie electricity + gas');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 8, -72, 'subscriptions', 'VOO internet + TV');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 12, -15.99, 'subscriptions', 'Netflix');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 15, -7.99, 'subscriptions', 'iCloud+');
select pg_temp.monthly('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 10, -78, 'transport', 'Car insurance');
select pg_temp.series('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 3, array[430, 440, 420, 360, 560, 540], 'children', 'School & after-school care');
select pg_temp.series('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 4, array[420, 420, 420, 420, 0, 0], 'children', 'Daycare - Creche Les Petits Pas');
select pg_temp.series('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', 27, array[0, 0, 0, 0, 600, 300], 'savings_transfer', 'Transfer to savings account');
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[1170, 1120, 1150, 1080, 960, 920], 'groceries', array['Colruyt', 'Delhaize', 'Aldi', 'Carrefour']);
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[322, 342, 317, 332, 282, 302], 'transport', array['Fuel - TotalEnergies', 'Fuel - Q8']);
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[190, 170, 210, 180, 220, 260], 'leisure', array['Swimming pool', 'Family day out']);
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[510, 480, 540, 620, 380, 420], 'shopping', array['Kids clothing', 'Action', 'Bol.com']);
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[160, 140, 180, 310, 90, 120], 'health', array['Pharmacy', 'Paediatrician']);
select pg_temp.spread('77777777-7777-4777-8777-777777777777', 'a7777777-0000-4000-8000-000000000001', array[470, 450, 480, 420, 280, 260], 'other', array['Cash withdrawal', 'Various payments']);

-- Behavioural signals (Kompass) ----------------------------------------------------------

insert into client_events (client_id, kind, code, title, detail, count, occurred_on) values
('11111111-1111-4111-8111-111111111111', 'app_activity', 'mortgage_simulator', 'Simulateur de prêt hypothécaire ouvert', null, 3, current_date - 9),
('11111111-1111-4111-8111-111111111111', 'app_activity', 'article_first_home', 'Article « Acheter son premier logement » lu', null, 1, current_date - 14),
('11111111-1111-4111-8111-111111111111', 'unused_subscription', 'unused_subscription', 'Disney+', 'Aucune utilisation détectée', 1, current_date - 3),
('77777777-7777-4777-8777-777777777777', 'app_activity', 'balance_checks', 'Solde consulté plus de 3 fois par jour en fin de mois', null, 14, current_date - 2),
('77777777-7777-4777-8777-777777777777', 'app_activity', 'overdraft_page', 'Page « Découvert autorisé » consultée', null, 2, current_date - 5),
('77777777-7777-4777-8777-777777777777', 'life_event', 'birth', 'Naissance probable', 'Allocations familiales (Famiwal) en hausse et nouveaux frais de crèche', 1, (date_trunc('month', current_date) - interval '4 months')::date),
('44444444-4444-4444-8444-444444444444', 'app_activity', 'pension_page', 'Page « Préparer sa pension » lue', null, 2, current_date - 20),
('44444444-4444-4444-8444-444444444444', 'app_activity', 'savings_rates', 'Comparaison des taux d’épargne consultée', null, 1, current_date - 6),
('44444444-4444-4444-8444-444444444444', 'life_event', 'retirement', 'Pension dans environ 4 ans', 'Départ à 65 ans indiqué dans le profil', 1, current_date);
