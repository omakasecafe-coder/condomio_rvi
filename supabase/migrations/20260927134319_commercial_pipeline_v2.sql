-- Commercial pipeline v2.
-- Prepared locally only: do not apply to production without explicit approval.

alter table public.buildings
  add column normalized_address text,
  add column lead_status text not null default 'ACTIVE'
    check (lead_status in ('ACTIVE', 'DISCARDED')),
  add column discarded_at timestamptz,
  add column discard_reason text,
  add column updated_at timestamptz not null default now();

update public.buildings
set normalized_address = lower(regexp_replace(
  concat_ws(' ', street_type, street_name, street_number, district, province, department),
  '[^[:alnum:]]+', ' ', 'g'
));

alter table public.buildings
  alter column normalized_address set not null,
  alter column contact_name drop not null,
  alter column contact_role drop not null,
  alter column contact_phone drop not null,
  alter column contact_email drop not null;

create unique index buildings_normalized_address_unique
  on public.buildings (normalized_address);

create table public.building_contacts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  role text not null,
  phone text not null,
  email text,
  contact_type text not null default 'OTRO'
    check (contact_type in ('ADMINISTRADOR', 'PRESIDENTE_JUNTA', 'PROPIETARIO', 'OTRO')),
  is_primary boolean not null default false,
  is_authorized_signer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.building_contacts (
  building_id, name, role, phone, email, contact_type, is_primary
)
select id, contact_name, contact_role, contact_phone, nullif(contact_email, ''), 'OTRO', true
from public.buildings
where contact_name is not null and contact_role is not null and contact_phone is not null;

create unique index building_contacts_one_primary
  on public.building_contacts (building_id)
  where is_primary;
create index building_contacts_building_id on public.building_contacts(building_id);

create table public.commercial_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  name text not null,
  basic_price_cents bigint not null check (basic_price_cents >= 0),
  pro_price_cents bigint not null check (pro_price_cents >= 0),
  autonomy_discount_cents bigint not null default 50 check (autonomy_discount_cents >= 0),
  commission_percentage numeric(5,2) not null default 100
    check (commission_percentage > 0 and commission_percentage <= 100),
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index commercial_versions_one_active
  on public.commercial_versions(active) where active;

insert into public.commercial_versions
  (version, name, basic_price_cents, pro_price_cents, autonomy_discount_cents, active)
values (1, 'Modelo comercial inicial', 250, 350, 50, true);

alter table public.opportunities
  drop constraint if exists opportunities_plan_check,
  drop constraint if exists opportunities_unit_price_cents_check,
  drop constraint if exists opportunities_status_check,
  drop constraint if exists opportunities_check,
  drop constraint if exists opportunities_payment_status_check,
  drop constraint if exists opportunities_lost_reason_check,
  alter column plan drop not null,
  alter column unit_price_cents drop not null,
  alter column observations set default '',
  add column seller_state text,
  add column primary_contact_id uuid references public.building_contacts(id),
  add column commercial_version_id uuid references public.commercial_versions(id),
  add column list_price_cents bigint check (list_price_cents >= 0),
  add column autonomy_discount_applied boolean not null default false,
  add column discount_cents bigint check (discount_cents >= 0),
  add column final_price_cents bigint check (final_price_cents >= 0),
  add column confirmed_apartments integer check (confirmed_apartments > 0),
  add column recurring_total_cents bigint check (recurring_total_cents >= 0),
  add column potential_commission_cents bigint check (potential_commission_cents >= 0),
  add column active boolean not null default true;

update public.opportunities
set seller_state = case status
  when 'CONTACTO' then 'CONTACTO_REGISTRADO'
  when 'DEMO' then case when demo_scheduled then 'DEMO_AGENDADA' else 'CONTACTO_REGISTRADO' end
  when 'NEGOCIACIÓN' then 'PLAN_PENDIENTE'
  when 'GANADO' then 'CONCRETADA'
  when 'PERDIDO' then 'NO_CONCRETADA'
  else 'CONTACTO_REGISTRADO'
end,
commercial_version_id = (select id from public.commercial_versions where active limit 1),
list_price_cents = unit_price_cents,
final_price_cents = unit_price_cents,
confirmed_apartments = (select apartments from public.buildings where id = opportunities.building_id),
active = status not in ('GANADO', 'PERDIDO');

alter table public.opportunities
  alter column seller_state set not null,
  add constraint opportunities_seller_state_check check (seller_state in (
    'SIN_CONTACTO', 'CONTACTO_REGISTRADO', 'DEMO_AGENDADA', 'DEMO_REALIZADA',
    'INFORMACION_ENVIADA', 'PLAN_PENDIENTE', 'PLAN_SELECCIONADO',
    'CONTRATO_SOLICITADO', 'CONTRATO_ENVIADO', 'CONTRATO_EN_VALIDACION',
    'ONBOARDING', 'PRIMERA_CUOTA_PENDIENTE', 'CONCRETADA', 'NO_CONCRETADA'
  )),
  add constraint opportunities_plan_v2_check check (plan is null or plan in ('BASICO', 'PRO')),
  add constraint opportunities_loss_v2_check check (
    seller_state <> 'NO_CONCRETADA' or lost_reason in (
      'SIN_RESPUESTA', 'SIN_INTERES', 'PRECIO', 'OTRA_SOLUCION', 'NO_PRIORIDAD',
      'NO_HAY_AUTORIDAD', 'SIN_PRESUPUESTO', 'DATOS_INCORRECTOS', 'OTRO'
    )
  );

create unique index opportunities_one_active_per_building
  on public.opportunities(building_id) where active;
create index opportunities_seller_state_created_at
  on public.opportunities(seller_state, created_at desc);

create table public.opportunity_demos (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  contact_id uuid not null references public.building_contacts(id),
  booking_uid text unique,
  starts_at timestamptz not null,
  ends_at timestamptz,
  booking_status text not null default 'SCHEDULED'
    check (booking_status in ('SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED')),
  contact_attended boolean,
  seller_attended boolean,
  result text check (result in ('QUALIFIED', 'NOT_QUALIFIED', 'RESCHEDULE')),
  information_sent_at timestamptz,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  status text not null default 'REQUESTED' check (status in (
    'REQUESTED', 'APPROVED', 'GENERATED', 'SENT', 'UPLOADED', 'IN_VALIDATION', 'VALIDATED', 'REJECTED'
  )),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  generated_at timestamptz,
  sent_at timestamptz,
  signed_document_path text,
  signed_document_uploaded_at timestamptz,
  validated_at timestamptz,
  rejected_reason text,
  updated_at timestamptz not null default now()
);

create table public.onboardings (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

create table public.first_installments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED')),
  due_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(id),
  base_amount_cents bigint not null check (base_amount_cents >= 0),
  commission_percentage numeric(5,2) not null check (commission_percentage > 0 and commission_percentage <= 100),
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID')),
  generated_at timestamptz not null default now(),
  paid_at timestamptz,
  check (status <> 'PAID' or paid_at is not null)
);

create index commissions_seller_status on public.commissions(seller_id, status);

create table public.opportunity_state_history (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_state text,
  to_state text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create index opportunity_state_history_opportunity
  on public.opportunity_state_history(opportunity_id, changed_at desc);

create function public.record_opportunity_state_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.seller_state is distinct from new.seller_state then
    insert into public.opportunity_state_history(opportunity_id, from_state, to_state, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.seller_state end, new.seller_state, auth.uid());
  end if;
  return new;
end;
$$;

create trigger opportunity_state_history_trigger
after insert or update of seller_state on public.opportunities
for each row execute function public.record_opportunity_state_change();

grant select on public.building_contacts, public.commercial_versions,
  public.opportunity_demos, public.contracts, public.onboardings,
  public.first_installments, public.commissions, public.opportunity_state_history
to authenticated;
grant insert, update, delete on public.commercial_versions, public.opportunity_demos,
  public.contracts, public.onboardings, public.first_installments, public.commissions
to authenticated;
grant insert on public.opportunity_state_history to authenticated;
grant select, insert, update, delete on public.building_contacts, public.commercial_versions,
  public.opportunity_demos, public.contracts, public.onboardings,
  public.first_installments, public.commissions, public.opportunity_state_history
to service_role;
grant usage, select on sequence public.opportunity_state_history_id_seq to service_role;
grant usage, select on sequence public.opportunity_state_history_id_seq to authenticated;

alter table public.building_contacts enable row level security;
alter table public.commercial_versions enable row level security;
alter table public.opportunity_demos enable row level security;
alter table public.contracts enable row level security;
alter table public.onboardings enable row level security;
alter table public.first_installments enable row level security;
alter table public.commissions enable row level security;
alter table public.opportunity_state_history enable row level security;

create policy seller_read_building_contacts on public.building_contacts
for select to authenticated using (exists (
  select 1 from public.buildings b join public.seller_profiles p on p.id = b.seller_id
  where b.id = building_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy authenticated_read_commercial_versions on public.commercial_versions
for select to authenticated using (true);
create policy seller_read_opportunity_demos on public.opportunity_demos
for select to authenticated using (exists (
  select 1 from public.opportunities o join public.buildings b on b.id = o.building_id
  join public.seller_profiles p on p.id = b.seller_id
  where o.id = opportunity_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy seller_read_contracts on public.contracts
for select to authenticated using (exists (
  select 1 from public.opportunities o join public.buildings b on b.id = o.building_id
  join public.seller_profiles p on p.id = b.seller_id
  where o.id = opportunity_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy seller_read_onboardings on public.onboardings
for select to authenticated using (exists (
  select 1 from public.opportunities o join public.buildings b on b.id = o.building_id
  join public.seller_profiles p on p.id = b.seller_id
  where o.id = opportunity_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy seller_read_first_installments on public.first_installments
for select to authenticated using (exists (
  select 1 from public.opportunities o join public.buildings b on b.id = o.building_id
  join public.seller_profiles p on p.id = b.seller_id
  where o.id = opportunity_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy seller_read_own_commissions on public.commissions
for select to authenticated using (exists (
  select 1 from public.seller_profiles p
  where p.id = seller_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy seller_read_opportunity_history on public.opportunity_state_history
for select to authenticated using (exists (
  select 1 from public.opportunities o join public.buildings b on b.id = o.building_id
  join public.seller_profiles p on p.id = b.seller_id
  where o.id = opportunity_id and p.auth_user_id = (select auth.uid()) and p.status = 'ACTIVE'
));

create policy admin_manage_commercial_versions on public.commercial_versions
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_manage_opportunity_demos on public.opportunity_demos
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_manage_contracts on public.contracts
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_manage_onboardings on public.onboardings
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_manage_first_installments on public.first_installments
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_manage_commissions on public.commissions
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_read_opportunity_history on public.opportunity_state_history
for select to authenticated using ((select private.is_admin()));
create policy admin_insert_opportunity_history on public.opportunity_state_history
for insert to authenticated with check ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signed-contracts', 'signed-contracts', false, 8388608,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
