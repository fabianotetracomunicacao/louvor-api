-- Handles WhatsApp scale confirmation replies received through Z-API.
-- Before using it, replace the placeholder secret below and configure the
-- Z-API "On receive" webhook with:
-- https://www.louvorplay.com.br/api/zapi-webhook?secret=YOUR_SECRET

insert into public.app_settings (key, value, description)
values (
  'zapi_webhook_secret',
  to_jsonb('CHANGE_ME_TO_A_LONG_RANDOM_SECRET'::text),
  'Segredo usado para validar o webhook de recebimento da Z-API.'
)
on conflict (key) do nothing;

create or replace function public.normalize_br_phone(input_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
  ddd text;
  rest text;
begin
  digits := regexp_replace(coalesce(input_phone, ''), '\D', '', 'g');

  if digits = '' then
    return '';
  end if;

  if left(digits, 2) <> '55' then
    digits := '55' || digits;
  end if;

  if length(digits) = 12 then
    ddd := substring(digits from 3 for 2);
    rest := substring(digits from 5);
    digits := '55' || ddd || '9' || rest;
  end if;

  return digits;
end;
$$;

create or replace function public.process_zapi_scale_response(
  p_phone text,
  p_message text,
  p_button_id text default '',
  p_secret text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_secret text;
  cleaned_message text;
  cleaned_button_id text;
  response_status text;
  requested_scale_id uuid;
  normalized_phone text;
  without_country text;
  without_ninth text;
  without_country_and_ninth text;
  candidates text[];
  target_scale record;
  setlist_info record;
  leader_phone text;
  summary_lines text;
  summary_totals record;
  now_value timestamptz := now();
begin
  select value #>> '{}'
    into configured_secret
  from public.app_settings
  where key = 'zapi_webhook_secret';

  if coalesce(configured_secret, '') = ''
     or configured_secret = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET'
     or coalesce(p_secret, '') <> configured_secret then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  cleaned_button_id := lower(trim(coalesce(p_button_id, '')));
  cleaned_message := lower(trim(coalesce(p_message, '')));
  cleaned_message := translate(
    cleaned_message,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );

  if cleaned_button_id ~ '^scale_confirm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    response_status := 'CONFIRMED';
    requested_scale_id := split_part(cleaned_button_id, ':', 2)::uuid;
  elsif cleaned_button_id ~ '^scale_decline:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    response_status := 'DECLINED';
    requested_scale_id := split_part(cleaned_button_id, ':', 2)::uuid;
  elsif cleaned_message ~ '^(1|sim|s|confirmo|confirmar|confirmado|presente|vou)(\s|$)' then
    response_status := 'CONFIRMED';
  elsif cleaned_message ~ '^(2|nao|n|recuso|recusar|declino|declinar)(\s|$)'
     or cleaned_message like '%nao poderei%' then
    response_status := 'DECLINED';
  else
    return jsonb_build_object('ignored', true, 'reason', 'unrecognized_response');
  end if;

  normalized_phone := public.normalize_br_phone(p_phone);

  if normalized_phone = '' then
    return jsonb_build_object('ignored', true, 'reason', 'missing_phone');
  end if;

  without_country := case
    when left(normalized_phone, 2) = '55' then substring(normalized_phone from 3)
    else normalized_phone
  end;

  without_ninth := case
    when length(normalized_phone) = 13 then substring(normalized_phone from 1 for 4) || substring(normalized_phone from 6)
    else normalized_phone
  end;

  without_country_and_ninth := case
    when left(without_ninth, 2) = '55' then substring(without_ninth from 3)
    else without_ninth
  end;

  candidates := array_remove(array[
    normalized_phone,
    regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
    without_country,
    without_ninth,
    without_country_and_ninth
  ], '');

  if requested_scale_id is not null then
    select ss.id, ss.user_id, ss.setlist_id
      into target_scale
    from public.setlist_scales ss
    join public.profiles p on p.id = ss.user_id
    where ss.id = requested_scale_id
      and ss.status = 'PENDING'
      and (
        regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = any(candidates)
        or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = any(candidates)
        or public.normalize_br_phone(p.phone) = any(candidates)
        or public.normalize_br_phone(p.whatsapp) = any(candidates)
      )
    limit 1;
  else
    select ss.id, ss.user_id, ss.setlist_id
      into target_scale
    from public.setlist_scales ss
    join public.profiles p on p.id = ss.user_id
    where ss.status = 'PENDING'
      and (
        regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = any(candidates)
        or regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g') = any(candidates)
        or public.normalize_br_phone(p.phone) = any(candidates)
        or public.normalize_br_phone(p.whatsapp) = any(candidates)
      )
    order by coalesce(ss.whatsapp_sent_at, ss.created_at) desc, ss.created_at desc
    limit 1;
  end if;

  if target_scale.id is null then
    return jsonb_build_object('ignored', true, 'reason', 'pending_scale_not_found');
  end if;

  update public.setlist_scales
  set status = response_status,
      whatsapp_status = response_status,
      confirmed_at = case when response_status = 'CONFIRMED' then now_value else confirmed_at end,
      declined_at = case when response_status = 'DECLINED' then now_value else declined_at end,
      decline_reason = case when response_status = 'DECLINED' then 'Resposta recebida via WhatsApp' else decline_reason end
  where id = target_scale.id;

  select s.id,
         coalesce(s.title, s.name, 'Culto') as title,
         s.date,
         s.created_by,
         coalesce(leader.whatsapp, leader.phone) as leader_phone
    into setlist_info
  from public.setlists s
  left join public.profiles leader on leader.id = s.created_by
  where s.id = target_scale.setlist_id;

  leader_phone := setlist_info.leader_phone;

  select string_agg(
           case coalesce(ss.status, 'PENDING')
             when 'CONFIRMED' then '✅ '
             when 'DECLINED' then '❌ '
             else '⏳ '
           end ||
           coalesce(p.name, p.full_name, p.email, 'Músico') ||
           case when coalesce(ss.role, '') <> '' then ' — ' || ss.role else '' end,
           E'\n'
           order by
             case coalesce(ss.status, 'PENDING')
               when 'DECLINED' then 1
               when 'PENDING' then 2
               when 'CONFIRMED' then 3
               else 4
             end,
             coalesce(p.name, p.full_name, p.email, '')
         ) as lines,
         count(*) filter (where ss.status = 'CONFIRMED') as confirmed_count,
         count(*) filter (where ss.status = 'DECLINED') as declined_count,
         count(*) filter (where coalesce(ss.status, 'PENDING') = 'PENDING') as pending_count
    into summary_totals
  from public.setlist_scales ss
  join public.profiles p on p.id = ss.user_id
  where ss.setlist_id = target_scale.setlist_id;

  summary_lines := coalesce(summary_totals.lines, 'Nenhum músico escalado.');

  return jsonb_build_object(
    'success', true,
    'scaleId', target_scale.id,
    'status', response_status,
    'leaderPhone', leader_phone,
    'leaderMessage', concat(
      case response_status
        when 'CONFIRMED' then '✅ Confirmação recebida'
        else '❌ Recusa recebida'
      end,
      E'\n\n',
      '📌 ', coalesce(setlist_info.title, 'Culto'),
      case
        when setlist_info.date is not null then E'\n📅 ' || to_char(setlist_info.date at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        else ''
      end,
      E'\n\n',
      summary_lines,
      E'\n\n',
      'Resumo: ✅ ', coalesce(summary_totals.confirmed_count, 0)::text,
      ' | ❌ ', coalesce(summary_totals.declined_count, 0)::text,
      ' | ⏳ ', coalesce(summary_totals.pending_count, 0)::text
    )
  );
end;
$$;

grant execute on function public.process_zapi_scale_response(text, text, text, text) to anon;
grant execute on function public.process_zapi_scale_response(text, text, text, text) to authenticated;
