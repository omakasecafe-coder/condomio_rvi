-- Banco de preguntas configurable y selección aleatoria por intento.
-- Las evaluaciones existentes conservan inicialmente su cantidad total de preguntas.

alter table public.assessment_sets
  add column questions_per_attempt integer not null default 1
    check (questions_per_attempt between 1 and 50);

update public.assessment_sets s
set questions_per_attempt = greatest(1, coalesce((
  select count(*)::integer
  from public.assessment_questions q
  where q.set_id = s.id
), 0)),
    randomize_questions = true;

alter table public.assessment_sets
  alter column randomize_questions set default true;

create or replace function public.get_published_assessments()
returns jsonb
language sql
volatile
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
      'randomizeQuestions', true,
      'questionCount', s.questions_per_attempt,
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', selected.id,
          'prompt', selected.prompt,
          'options', selected.options
        ) order by selected.random_order)
        from (
          select q.id, q.prompt, q.options, random() as random_order
          from public.assessment_questions q
          where q.set_id = s.id
          order by random_order
          limit s.questions_per_attempt
        ) selected
      ), '[]'::jsonb)
    ) as payload
    from public.assessment_sets s
    where s.status = 'PUBLISHED'
  ) published;
$$;

revoke all on function public.get_published_assessments() from public;
revoke all on function public.get_published_assessments() from anon, authenticated;
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
  v_bank_count integer;
  v_question_count integer;
  v_answer_count integer;
  v_distinct_answer_count integer;
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

  select count(*)::integer into v_bank_count
  from public.assessment_questions
  where set_id = v_set.id;
  v_question_count := v_set.questions_per_attempt;
  if v_bank_count < v_question_count then
    raise exception 'El banco no tiene suficientes preguntas';
  end if;

  select count(*)::integer, count(distinct answer.question_id)::integer
  into v_answer_count, v_distinct_answer_count
  from jsonb_to_recordset(p_answers) as answer(question_id uuid, option_index integer);
  if v_question_count = 0
     or v_answer_count <> v_question_count
     or v_distinct_answer_count <> v_question_count then
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
revoke all on function public.submit_assessment_attempt(uuid, jsonb) from anon, authenticated;
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
    kind, name, version, status, pass_percentage, allowed_attempts,
    randomize_questions, questions_per_attempt
  ) values (
    p_kind,
    coalesce(v_source.name, case when p_kind = 'ATTITUDINAL' then 'Evaluación actitudinal' else 'Evaluación aptitudinal' end),
    v_version, 'DRAFT', coalesce(v_source.pass_percentage, 75),
    coalesce(v_source.allowed_attempts, 1), true,
    coalesce(v_source.questions_per_attempt, 1)
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
revoke all on function public.admin_create_assessment_version(text) from anon, authenticated;
grant execute on function public.admin_create_assessment_version(text) to authenticated;

drop function if exists public.admin_save_assessment_set(uuid, text, integer, integer, boolean, jsonb);

create function public.admin_save_assessment_set(
  p_set_id uuid,
  p_name text,
  p_pass_percentage integer,
  p_allowed_attempts integer,
  p_questions_per_attempt integer,
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
     or p_questions_per_attempt not between 1 and 50
     or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Configuración inválida';
  end if;
  select count(*) into v_count from jsonb_array_elements(p_questions);
  if v_count not between 1 and 50 then raise exception 'La evaluación debe tener entre 1 y 50 preguntas'; end if;
  if p_questions_per_attempt > v_count then
    raise exception 'Las preguntas por examen no pueden superar el tamaño del banco';
  end if;
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
    questions_per_attempt = p_questions_per_attempt,
    randomize_questions = true,
    updated_at = now()
  where id = p_set_id;
  delete from public.assessment_questions where set_id = p_set_id;
  insert into public.assessment_questions (set_id, position, prompt, options, correct_option, is_knockout)
  select p_set_id, position, trim(prompt), options, correct_option, coalesce(is_knockout, false)
  from jsonb_to_recordset(p_questions)
    as q(position integer, prompt text, options jsonb, correct_option integer, is_knockout boolean)
  order by position;
end;
$$;

revoke all on function public.admin_save_assessment_set(uuid, text, integer, integer, integer, boolean, jsonb) from public;
revoke all on function public.admin_save_assessment_set(uuid, text, integer, integer, integer, boolean, jsonb) from anon, authenticated;
grant execute on function public.admin_save_assessment_set(uuid, text, integer, integer, integer, boolean, jsonb) to authenticated;

create or replace function public.admin_publish_assessment_set(p_set_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_questions_per_attempt integer;
  v_bank_count integer;
begin
  if not (select private.is_admin()) then raise exception 'Acceso no autorizado'; end if;
  select kind, questions_per_attempt into v_kind, v_questions_per_attempt
  from public.assessment_sets
  where id = p_set_id and status = 'DRAFT' for update;
  if v_kind is null then raise exception 'Borrador no encontrado'; end if;
  select count(*)::integer into v_bank_count
  from public.assessment_questions where set_id = p_set_id;
  if v_bank_count = 0 then raise exception 'Agrega al menos una pregunta'; end if;
  if v_questions_per_attempt > v_bank_count then
    raise exception 'Las preguntas por examen no pueden superar el tamaño del banco';
  end if;
  update public.assessment_sets set status = 'ARCHIVED', updated_at = now()
  where kind = v_kind and status = 'PUBLISHED';
  update public.assessment_sets
  set status = 'PUBLISHED', randomize_questions = true,
      published_at = now(), updated_at = now()
  where id = p_set_id;
end;
$$;

revoke all on function public.admin_publish_assessment_set(uuid) from public;
revoke all on function public.admin_publish_assessment_set(uuid) from anon, authenticated;
grant execute on function public.admin_publish_assessment_set(uuid) to authenticated;
