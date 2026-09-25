-- Backoffice de postulantes y evaluaciones versionadas.
-- Las respuestas correctas nunca se exponen al flujo público; la corrección
-- ocurre dentro de funciones con permisos restringidos y contexto autenticado.

create schema if not exists private;

create table public.admin_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.seller_profiles
  add column aptitude_score integer,
  add column application_stage text not null default 'ACTITUDINAL'
    check (application_stage in (
      'REGISTERED', 'ACTITUDINAL', 'APTITUDINAL', 'TRAINING',
      'KNOWLEDGE', 'VALIDATION', 'CONTRACT', 'ACTIVE',
      'REJECTED', 'SUSPENDED'
    ));

create table public.assessment_sets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ATTITUDINAL', 'APTITUDINAL')),
  name text not null check (char_length(trim(name)) between 3 and 120),
  version integer not null check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  pass_percentage integer not null default 75 check (pass_percentage between 1 and 100),
  allowed_attempts integer not null default 1 check (allowed_attempts between 1 and 5),
  randomize_questions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (kind, version)
);

create unique index assessment_sets_one_published_kind
  on public.assessment_sets(kind) where status = 'PUBLISHED';

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.assessment_sets(id) on delete cascade,
  position integer not null check (position > 0),
  prompt text not null check (char_length(trim(prompt)) between 5 and 1000),
  options jsonb not null,
  correct_option integer not null check (correct_option >= 0),
  is_knockout boolean not null default false,
  created_at timestamptz not null default now(),
  unique (set_id, position),
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  check (correct_option < jsonb_array_length(options))
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  set_id uuid not null references public.assessment_sets(id),
  kind text not null check (kind in ('ATTITUDINAL', 'APTITUDINAL')),
  attempt_number integer not null check (attempt_number > 0),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  percentage integer not null check (percentage between 0 and 100),
  passed boolean not null,
  knockout_failed boolean not null default false,
  completed_at timestamptz not null default now(),
  unique (seller_id, set_id, attempt_number)
);

create index assessment_questions_set_position_idx
  on public.assessment_questions(set_id, position);
create index assessment_attempts_seller_completed_idx
  on public.assessment_attempts(seller_id, completed_at desc);
create index assessment_attempts_set_idx
  on public.assessment_attempts(set_id);
create index seller_profiles_stage_created_idx
  on public.seller_profiles(application_stage, created_at desc);

alter table public.admin_users enable row level security;
alter table public.assessment_sets enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_attempts enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.assessment_sets, public.assessment_questions to authenticated;
grant select on public.assessment_attempts to authenticated;
grant select, insert on public.seller_profiles to authenticated;

create policy admin_read_self on public.admin_users
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt() ->> 'email'), '')));

create policy admin_manage_assessment_sets on public.assessment_sets
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy admin_manage_assessment_questions on public.assessment_questions
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy seller_read_own_attempts on public.assessment_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_profiles p
      where p.id = seller_id and p.auth_user_id = (select auth.uid())
    )
  );

create policy admin_read_all_attempts on public.assessment_attempts
  for select to authenticated
  using ((select private.is_admin()));

create policy admin_read_all_sellers on public.seller_profiles
  for select to authenticated
  using ((select private.is_admin()));

create policy applicant_create_own_profile on public.seller_profiles
  for insert to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and status = 'APPLICANT'
    and application_stage in ('REGISTERED', 'ACTITUDINAL')
    and attitude_score is null
    and aptitude_score is null
  );

create policy admin_read_all_buildings on public.buildings
  for select to authenticated
  using ((select private.is_admin()));

create policy admin_read_all_opportunities on public.opportunities
  for select to authenticated
  using ((select private.is_admin()));

create policy admin_update_opportunities on public.opportunities
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create or replace function public.get_published_assessments()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(payload order by payload->>'kind'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', s.id,
      'kind', s.kind,
      'name', s.name,
      'version', s.version,
      'passPercentage', s.pass_percentage,
      'allowedAttempts', s.allowed_attempts,
      'randomizeQuestions', s.randomize_questions,
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id,
          'prompt', q.prompt,
          'options', q.options
        ) order by q.position)
        from public.assessment_questions q
        where q.set_id = s.id
      ), '[]'::jsonb)
    ) as payload
    from public.assessment_sets s
    where s.status = 'PUBLISHED'
  ) published;
$$;

revoke all on function public.get_published_assessments() from public;
grant execute on function public.get_published_assessments() to anon, authenticated;

create or replace function public.submit_assessment_attempt(
  p_set_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_seller public.seller_profiles%rowtype;
  v_set public.assessment_sets%rowtype;
  v_question_count integer;
  v_answer_count integer;
  v_attempt_number integer;
  v_score integer;
  v_percentage integer;
  v_knockout_failed boolean;
  v_passed boolean;
begin
  if v_user_id is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Solicitud inválida';
  end if;

  select * into v_seller
  from public.seller_profiles
  where auth_user_id = v_user_id
  for update;
  if not found or v_seller.status <> 'APPLICANT' then
    raise exception 'Postulación no disponible';
  end if;

  select * into v_set
  from public.assessment_sets
  where id = p_set_id and status = 'PUBLISHED';
  if not found then raise exception 'Evaluación no disponible'; end if;
  if v_set.kind = 'APTITUDINAL' and v_seller.attitude_score is null then
    raise exception 'Primero completa la evaluación actitudinal';
  end if;

  select count(*) into v_question_count
  from public.assessment_questions where set_id = v_set.id;
  select count(distinct answer.question_id) into v_answer_count
  from jsonb_to_recordset(p_answers) as answer(question_id uuid, option_index integer);
  if v_question_count = 0 or v_answer_count <> v_question_count then
    raise exception 'Respuestas incompletas';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_answers) as answer(question_id uuid, option_index integer)
    left join public.assessment_questions q
      on q.id = answer.question_id and q.set_id = v_set.id
    where q.id is null or answer.option_index < 0
      or answer.option_index >= jsonb_array_length(q.options)
  ) then
    raise exception 'Respuestas inválidas';
  end if;

  select count(*) + 1 into v_attempt_number
  from public.assessment_attempts
  where seller_id = v_seller.id and set_id = v_set.id;
  if v_attempt_number > v_set.allowed_attempts or exists (
    select 1 from public.assessment_attempts
    where seller_id = v_seller.id and set_id = v_set.id and passed
  ) then
    raise exception 'No quedan intentos disponibles';
  end if;

  select
    count(*) filter (where q.correct_option = answer.option_index),
    coalesce(bool_or(q.is_knockout and q.correct_option <> answer.option_index), false)
  into v_score, v_knockout_failed
  from jsonb_to_recordset(p_answers) as answer(question_id uuid, option_index integer)
  join public.assessment_questions q
    on q.id = answer.question_id and q.set_id = v_set.id;

  v_percentage := floor((v_score::numeric * 100) / v_question_count)::integer;
  v_passed := v_percentage >= v_set.pass_percentage and not v_knockout_failed;

  insert into public.assessment_attempts (
    seller_id, set_id, kind, attempt_number, answers, score, max_score,
    percentage, passed, knockout_failed
  ) values (
    v_seller.id, v_set.id, v_set.kind, v_attempt_number, p_answers,
    v_score, v_question_count, v_percentage, v_passed, v_knockout_failed
  );

  if v_set.kind = 'ATTITUDINAL' then
    update public.seller_profiles
    set attitude_score = v_score,
        application_stage = case
          when v_passed then 'APTITUDINAL'
          when v_attempt_number >= v_set.allowed_attempts then 'REJECTED'
          else 'ACTITUDINAL'
        end,
        status = case
          when not v_passed and v_attempt_number >= v_set.allowed_attempts then 'REJECTED'
          else status
        end,
        updated_at = now()
    where id = v_seller.id;
  else
    update public.seller_profiles
    set aptitude_score = v_score,
        knowledge_score = v_score,
        application_stage = case when v_passed then 'VALIDATION' else 'APTITUDINAL' end,
        updated_at = now()
    where id = v_seller.id;
  end if;

  return jsonb_build_object(
    'passed', v_passed,
    'score', v_score,
    'maxScore', v_question_count,
    'percentage', v_percentage,
    'attemptNumber', v_attempt_number,
    'attemptsRemaining', greatest(v_set.allowed_attempts - v_attempt_number, 0)
  );
end;
$$;

revoke all on function public.submit_assessment_attempt(uuid, jsonb) from public;
grant execute on function public.submit_assessment_attempt(uuid, jsonb) to authenticated;

create or replace function public.admin_create_assessment_version(p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.assessment_sets%rowtype;
  v_new_id uuid;
  v_version integer;
begin
  if not (select private.is_admin()) then raise exception 'Acceso no autorizado'; end if;
  if p_kind not in ('ATTITUDINAL', 'APTITUDINAL') then raise exception 'Tipo inválido'; end if;
  if exists (select 1 from public.assessment_sets where kind = p_kind and status = 'DRAFT') then
    raise exception 'Ya existe un borrador para esta evaluación';
  end if;
  select coalesce(max(version), 0) + 1 into v_version
  from public.assessment_sets where kind = p_kind;
  select * into v_source from public.assessment_sets
  where kind = p_kind and status = 'PUBLISHED' limit 1;
  insert into public.assessment_sets (
    kind, name, version, status, pass_percentage, allowed_attempts, randomize_questions
  ) values (
    p_kind,
    coalesce(v_source.name, case when p_kind = 'ATTITUDINAL' then 'Evaluación actitudinal' else 'Evaluación aptitudinal' end),
    v_version, 'DRAFT', coalesce(v_source.pass_percentage, 75),
    coalesce(v_source.allowed_attempts, 1), coalesce(v_source.randomize_questions, false)
  ) returning id into v_new_id;
  if v_source.id is not null then
    insert into public.assessment_questions (set_id, position, prompt, options, correct_option, is_knockout)
    select v_new_id, position, prompt, options, correct_option, is_knockout
    from public.assessment_questions where set_id = v_source.id order by position;
  end if;
  return v_new_id;
end;
$$;

revoke all on function public.admin_create_assessment_version(text) from public;
grant execute on function public.admin_create_assessment_version(text) to authenticated;

create or replace function public.admin_save_assessment_set(
  p_set_id uuid,
  p_name text,
  p_pass_percentage integer,
  p_allowed_attempts integer,
  p_randomize_questions boolean,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.assessment_sets%rowtype;
  v_count integer;
begin
  if not (select private.is_admin()) then raise exception 'Acceso no autorizado'; end if;
  select * into v_set from public.assessment_sets where id = p_set_id for update;
  if not found or v_set.status <> 'DRAFT' then raise exception 'Solo se pueden editar borradores'; end if;
  if char_length(trim(p_name)) not between 3 and 120
     or p_pass_percentage not between 1 and 100
     or p_allowed_attempts not between 1 and 5
     or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Configuración inválida';
  end if;
  select count(*) into v_count from jsonb_array_elements(p_questions);
  if v_count not between 1 and 50 then raise exception 'La evaluación debe tener entre 1 y 50 preguntas'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_questions)
      as q(position integer, prompt text, options jsonb, correct_option integer, is_knockout boolean)
    where position is null or position < 1
      or char_length(trim(prompt)) not between 5 and 1000
      or jsonb_typeof(options) <> 'array' or jsonb_array_length(options) not between 2 and 6
      or correct_option is null or correct_option < 0 or correct_option >= jsonb_array_length(options)
  ) then raise exception 'Hay preguntas incompletas o inválidas'; end if;
  update public.assessment_sets set
    name = trim(p_name), pass_percentage = p_pass_percentage,
    allowed_attempts = p_allowed_attempts,
    randomize_questions = p_randomize_questions, updated_at = now()
  where id = p_set_id;
  delete from public.assessment_questions where set_id = p_set_id;
  insert into public.assessment_questions (set_id, position, prompt, options, correct_option, is_knockout)
  select p_set_id, position, trim(prompt), options, correct_option, coalesce(is_knockout, false)
  from jsonb_to_recordset(p_questions)
    as q(position integer, prompt text, options jsonb, correct_option integer, is_knockout boolean)
  order by position;
end;
$$;

revoke all on function public.admin_save_assessment_set(uuid, text, integer, integer, boolean, jsonb) from public;
grant execute on function public.admin_save_assessment_set(uuid, text, integer, integer, boolean, jsonb) to authenticated;

create or replace function public.admin_publish_assessment_set(p_set_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if not (select private.is_admin()) then raise exception 'Acceso no autorizado'; end if;
  select kind into v_kind from public.assessment_sets
  where id = p_set_id and status = 'DRAFT' for update;
  if v_kind is null then raise exception 'Borrador no encontrado'; end if;
  if not exists (select 1 from public.assessment_questions where set_id = p_set_id) then
    raise exception 'Agrega al menos una pregunta';
  end if;
  update public.assessment_sets set status = 'ARCHIVED', updated_at = now()
  where kind = v_kind and status = 'PUBLISHED';
  update public.assessment_sets set status = 'PUBLISHED', published_at = now(), updated_at = now()
  where id = p_set_id;
end;
$$;

revoke all on function public.admin_publish_assessment_set(uuid) from public;
grant execute on function public.admin_publish_assessment_set(uuid) to authenticated;

-- Sets iniciales equivalentes a las evaluaciones incluidas en el MVP.
insert into public.assessment_sets (id, kind, name, version, status, pass_percentage, allowed_attempts, published_at)
values
  ('11111111-1111-4111-8111-111111111111', 'ATTITUDINAL', 'Evaluación actitudinal', 1, 'PUBLISHED', 75, 1, now()),
  ('22222222-2222-4222-8222-222222222222', 'APTITUDINAL', 'Evaluación aptitudinal comercial', 1, 'PUBLISHED', 75, 2, now());

insert into public.assessment_questions (set_id, position, prompt, options, correct_option, is_knockout)
values
  ('11111111-1111-4111-8111-111111111111', 1, 'Un edificio quiere conocer el servicio, pero aún no decide. ¿Qué haces?', '["Insisto en que firme hoy", "Escucho sus necesidades y acuerdo un siguiente paso", "Dejo de contactarlo"]', 1, false),
  ('11111111-1111-4111-8111-111111111111', 2, 'Un cliente pide una función que no sabes si existe. ¿Cómo respondes?', '["Prometo que sí existe", "Le digo que no se puede sin consultar", "Verifico la información antes de comprometerme"]', 2, true),
  ('11111111-1111-4111-8111-111111111111', 3, 'Tienes varias oportunidades abiertas. ¿Cómo priorizas?', '["Doy seguimiento y registro los próximos pasos", "Espero a que los clientes vuelvan a llamar", "Solo atiendo la que parece más grande"]', 0, false),
  ('11111111-1111-4111-8111-111111111111', 4, 'Administración detecta un dato incorrecto en tu propuesta. ¿Qué haces?', '["Lo oculto para no demorar", "Corrijo el dato y aviso oportunamente", "Culpo al cliente"]', 1, true),
  ('22222222-2222-4222-8222-222222222222', 1, 'Un edificio tiene 50 departamentos y el plan cuesta S/ 4 por departamento. ¿Cuál es el ingreso mensual?', '["S/ 54", "S/ 200", "S/ 500"]', 1, false),
  ('22222222-2222-4222-8222-222222222222', 2, 'El contacto muestra interés, pero necesita aprobación de la junta. ¿Cuál es el mejor siguiente paso?', '["Marcar la venta como ganada", "Acordar fecha y responsables para la presentación a la junta", "Cerrar la oportunidad"]', 1, false),
  ('22222222-2222-4222-8222-222222222222', 3, 'Dos vendedores registran el mismo edificio. ¿Qué corresponde hacer?', '["Ocultar el registro anterior", "Duplicar la oportunidad", "Informar a administración y respetar la atribución registrada"]', 2, true),
  ('22222222-2222-4222-8222-222222222222', 4, '¿Qué información ayuda más a priorizar una oportunidad?', '["El número de departamentos, decisión y próximo paso", "Solo el distrito", "La antigüedad del edificio"]', 0, false);
