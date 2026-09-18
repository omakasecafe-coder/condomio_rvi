-- Initial MVP data model. Apply only to a Condomio-owned Supabase project.
create table public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  document_type text not null check (document_type in ('DNI', 'CE', 'PASAPORTE')),
  document_number text not null,
  email text not null,
  first_name text not null,
  paternal_surname text not null,
  maternal_surname text not null,
  birth_date date not null,
  phone text not null,
  status text not null default 'APPLICANT' check (status in ('APPLICANT', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
  attitude_score integer,
  knowledge_score integer,
  identity_document_path text,
  bank_account text,
  cci text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, document_number)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id),
  street_type text not null,
  street_name text not null,
  street_number text not null,
  district text not null,
  province text not null,
  department text not null,
  building_name text not null,
  apartments integer not null check (apartments > 0),
  administration_type text not null check (administration_type in ('PROPIA', 'TERCERA')),
  administration_company text,
  contact_name text not null,
  contact_role text not null,
  contact_phone text not null,
  contact_email text not null,
  created_at timestamptz not null default now(),
  check (administration_type <> 'TERCERA' or nullif(trim(administration_company), '') is not null)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id),
  plan text not null check (plan in ('BASICO', 'PRO', 'PERSONALIZADO')),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  observations text not null default '',
  status text not null default 'CONTACTO' check (status in ('CONTACTO', 'DEMO', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO')),
  contract_validated_at timestamptz,
  commission_cents bigint check (commission_cents >= 0),
  payment_status text check (payment_status in ('PENDIENTE_DE_PAGO', 'PAGADO')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status <> 'GANADO' and commission_cents is null and payment_status is null and paid_at is null)
    or
    (status = 'GANADO' and contract_validated_at is not null and commission_cents is not null and payment_status is not null)
  ),
  check (payment_status <> 'PAGADO' or paid_at is not null)
);

create index idx_buildings_seller_id on public.buildings(seller_id);
create index idx_opportunities_building_id_status on public.opportunities(building_id, status);

grant select on public.seller_profiles, public.buildings, public.opportunities to authenticated;
grant select, insert, update on public.seller_profiles, public.buildings, public.opportunities to service_role;

alter table public.seller_profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.opportunities enable row level security;

create policy seller_read_own_profile on public.seller_profiles
  for select to authenticated using (auth.uid() = auth_user_id);
create policy seller_read_own_buildings on public.buildings
  for select to authenticated using (
    exists (select 1 from public.seller_profiles p where p.id = seller_id and p.auth_user_id = auth.uid() and p.status = 'ACTIVE')
  );
create policy seller_read_own_opportunities on public.opportunities
  for select to authenticated using (
    exists (
      select 1 from public.buildings b
      join public.seller_profiles p on p.id = b.seller_id
      where b.id = building_id and p.auth_user_id = auth.uid() and p.status = 'ACTIVE'
    )
  );

-- Writes are deliberately not granted to browser clients. API handlers must
-- authenticate the caller and enforce the status transitions before writing.
