-- hallo flow v2 — initial schema
-- RLS intentionally disabled for hackathon: service-role writes only,
-- anon key reads via Realtime channels.

create extension if not exists "pgcrypto";

create type tenant_archetype as enum ('reliable', 'soft_fail', 'payment_plan', 'critical');

create type tenant_status as enum (
  'current',
  'paid',
  'retry_succeeded',
  'payment_plan_offered',
  'payment_plan_accepted',
  'escalated'
);

create type payment_status as enum (
  'pending',
  'succeeded',
  'failed',
  'retried_succeeded'
);

create type plan_part_status as enum ('scheduled', 'accepted', 'paid');

create table tenants (
  id text primary key,
  name text not null,
  unit text not null,
  rent_cents integer not null,
  archetype tenant_archetype not null,
  status tenant_status not null default 'current',
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_test_clock_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  amount_cents integer not null,
  status payment_status not null,
  failure_reason text,
  stripe_payment_intent_id text unique,
  cycle_month text not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index payments_tenant_idx on payments(tenant_id);
create index payments_created_idx on payments(created_at desc);

create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text references tenants(id) on delete cascade,
  timestamp timestamptz not null default now(),
  action text not null,
  reason text not null,
  result text not null
);

create index agent_actions_tenant_idx on agent_actions(tenant_id);
create index agent_actions_timestamp_idx on agent_actions(timestamp desc);

create table exceptions (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  risk_score integer not null,
  status text not null,
  recommended_action text not null,
  human_needed boolean not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table payment_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table payment_plan_parts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references payment_plans(id) on delete cascade,
  amount_cents integer not null,
  due_date text not null,
  label text not null,
  status plan_part_status not null default 'scheduled',
  position smallint not null
);

create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table tenants disable row level security;
alter table payments disable row level security;
alter table agent_actions disable row level security;
alter table exceptions disable row level security;
alter table payment_plans disable row level security;
alter table payment_plan_parts disable row level security;
alter table stripe_events disable row level security;

alter publication supabase_realtime add table tenants;
alter publication supabase_realtime add table agent_actions;
alter publication supabase_realtime add table exceptions;
alter publication supabase_realtime add table payment_plans;
alter publication supabase_realtime add table payment_plan_parts;
