
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  owner_name text,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  unit text not null,
  name text not null,
  email text,
  rent_amount numeric not null,
  behavior_profile text not null check (behavior_profile in ('reliable','soft_fail','payment_plan','critical')),
  risk_score int not null default 0,
  mandate_status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.rent_obligations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  month text not null,
  amount numeric not null,
  due_date date not null,
  status text not null check (status in ('paid','auto_recovered','payment_plan','human_review','pending','failed','reconciled')),
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;
alter table public.tenants enable row level security;
alter table public.rent_obligations enable row level security;

create policy "public read properties" on public.properties for select using (true);
create policy "public read tenants" on public.tenants for select using (true);
create policy "public read rent_obligations" on public.rent_obligations for select using (true);
