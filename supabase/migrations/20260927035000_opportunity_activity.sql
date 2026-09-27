alter table public.opportunities
  add column brochure_sent boolean not null default false,
  add column demo_scheduled boolean not null default false,
  add column contract_generated_at timestamptz,
  add column contract_sent boolean not null default false,
  add column lost_reason text;

alter table public.opportunities
  add constraint opportunities_lost_reason_check
  check (
    (status <> 'PERDIDO' and lost_reason is null)
    or
    (status = 'PERDIDO' and lost_reason in ('PRECIO', 'SIN_RESPUESTA', 'OTRA_SOLUCION', 'NO_PRIORIDAD', 'OTRO'))
  ),
  add constraint opportunities_contract_sent_check
  check (not contract_sent or contract_generated_at is not null);
