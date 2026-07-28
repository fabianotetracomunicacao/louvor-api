create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.songs
  add column if not exists cifraclub_url text;

create table public.cifraclub_import_jobs (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null,
  artist_slug text not null check (artist_slug ~ '^[a-z0-9-]+$'),
  status text not null default 'pending'
    check (status in ('pending', 'discovering', 'processing', 'completed',
      'completed_with_errors', 'paused', 'cancelled')),
  total_count integer not null default 0 check (total_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cifraclub_import_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cifraclub_import_jobs(id) on delete cascade,
  song_name text not null,
  song_slug text not null check (song_slug ~ '^[a-z0-9-]+$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'imported', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  song_id uuid references public.songs(id) on delete set null,
  last_error text,
  lease_until timestamptz,
  claim_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'imported' or song_id is null),
  unique (job_id, song_slug)
);

create unique index cifraclub_import_one_active_artist
  on public.cifraclub_import_jobs (artist_slug)
  where status in ('pending', 'discovering', 'processing', 'paused');

create index cifraclub_import_jobs_claimable
  on public.cifraclub_import_jobs (created_at)
  where status in ('pending', 'discovering', 'processing');

create index cifraclub_import_items_claimable
  on public.cifraclub_import_items (job_id, created_at)
  where status in ('pending', 'processing');

create unique index cifraclub_import_only_one_processing_item
  on public.cifraclub_import_items ((true))
  where status = 'processing';

alter table public.cifraclub_import_jobs enable row level security;
alter table public.cifraclub_import_items enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'super_admin'
  )
$$;

create policy "Super admins can view CifraClub import jobs"
  on public.cifraclub_import_jobs
  for select
  to authenticated
  using (public.is_super_admin());

create policy "Super admins can view CifraClub import items"
  on public.cifraclub_import_items
  for select
  to authenticated
  using (public.is_super_admin());

revoke all on public.cifraclub_import_jobs from public, anon, authenticated;
revoke all on public.cifraclub_import_items from public, anon, authenticated;
grant select on public.cifraclub_import_jobs to authenticated;
grant select on public.cifraclub_import_items to authenticated;
grant select, insert, update on public.cifraclub_import_jobs to service_role;
grant select, insert, update on public.cifraclub_import_items to service_role;

create or replace function public.enqueue_cifraclub_import(
  p_artist_name text,
  p_artist_slug text,
  p_estimated_total integer
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  created_job public.cifraclub_import_jobs;
  normalized_name text := btrim(coalesce(p_artist_name, ''));
  normalized_slug text := lower(btrim(coalesce(p_artist_slug, '')));
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if normalized_name = '' or normalized_slug !~ '^[a-z0-9-]+$' then
    raise exception 'invalid artist';
  end if;

  insert into public.cifraclub_import_jobs (
    artist_name,
    artist_slug,
    total_count,
    created_by
  )
  values (
    normalized_name,
    normalized_slug,
    greatest(coalesce(p_estimated_total, 0), 0),
    auth.uid()
  )
  returning * into created_job;

  return created_job;
end;
$$;

create or replace function public.cancel_cifraclub_import(
  p_job_id uuid
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_job public.cifraclub_import_jobs;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update public.cifraclub_import_jobs
  set status = 'cancelled',
      lease_until = null,
      updated_at = now()
  where id = p_job_id
    and status = 'pending'
  returning * into cancelled_job;

  if cancelled_job.id is null then
    raise exception 'job cannot be cancelled';
  end if;

  return cancelled_job;
end;
$$;

create or replace function public.retry_cifraclub_import_failures(
  p_job_id uuid
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  retried_job public.cifraclub_import_jobs;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update public.cifraclub_import_jobs
  set status = 'pending',
      failed_count = 0,
      lease_until = null,
      last_error = null,
      next_run_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'completed_with_errors'
  returning * into retried_job;

  if retried_job.id is null then
    raise exception 'job has no retryable failures';
  end if;

  update public.cifraclub_import_items
  set status = 'pending',
      lease_until = null,
      last_error = null,
      updated_at = now()
  where job_id = p_job_id
    and status = 'failed';

  return retried_job;
end;
$$;

create or replace function public.claim_cifraclub_import_work(
  p_lease_seconds integer default 120
)
returns table (
  job_id uuid,
  artist_name text,
  artist_slug text,
  created_by uuid,
  item_id uuid,
  song_name text,
  song_slug text,
  attempts integer,
  claim_token uuid,
  needs_discovery boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job public.cifraclub_import_jobs;
  selected_item public.cifraclub_import_items;
  lease_expires_at timestamptz;
  has_items boolean;
  has_active_item boolean;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'lease duration must be positive';
  end if;

  lease_expires_at := now() + make_interval(secs => p_lease_seconds);

  perform pg_advisory_xact_lock(hashtext('cifraclub_import_work_claim'));

  select exists (
    select 1
    from public.cifraclub_import_items
    where status = 'processing'
      and lease_until >= now()
  ) into has_active_item;

  if has_active_item then
    return;
  end if;

  select * into selected_job
  from public.cifraclub_import_jobs
  where status in ('pending', 'discovering', 'processing')
    and next_run_at <= now()
    and (lease_until is null or lease_until < now())
  order by created_at
  for update skip locked
  limit 1;

  if selected_job.id is null then
    return;
  end if;

  select exists (
    select 1
    from public.cifraclub_import_items
    where job_id = selected_job.id
  ) into has_items;

  if not has_items then
    update public.cifraclub_import_jobs
    set status = 'discovering',
        lease_until = lease_expires_at,
        updated_at = now()
    where id = selected_job.id;

    return query
    select
      selected_job.id,
      selected_job.artist_name,
      selected_job.artist_slug,
      selected_job.created_by,
      null::uuid,
      null::text,
      null::text,
      null::integer,
      null::uuid,
      true;
    return;
  end if;

  select * into selected_item
  from public.cifraclub_import_items
  where job_id = selected_job.id
    and (
      status = 'pending'
      or (status = 'processing' and lease_until < now())
    )
  order by created_at
  for update skip locked
  limit 1;

  if selected_item.id is null then
    update public.cifraclub_import_jobs
    set status = case when failed_count > 0 then 'completed_with_errors' else 'completed' end,
        lease_until = null,
        updated_at = now()
    where id = selected_job.id;
    return;
  end if;

  update public.cifraclub_import_jobs
  set status = 'processing',
      lease_until = lease_expires_at,
      updated_at = now()
  where id = selected_job.id;

  update public.cifraclub_import_items
  set status = 'processing',
      attempts = attempts + 1,
      lease_until = lease_expires_at,
      claim_token = gen_random_uuid(),
      updated_at = now()
  where id = selected_item.id
  returning * into selected_item;

  return query
  select
    selected_job.id,
    selected_job.artist_name,
    selected_job.artist_slug,
    selected_job.created_by,
    selected_item.id,
    selected_item.song_name,
    selected_item.song_slug,
    selected_item.attempts,
    selected_item.claim_token,
    false;
end;
$$;

create or replace function public.finish_cifraclub_import_item(
  p_item_id uuid,
  p_claim_token uuid,
  p_status text,
  p_song_id uuid,
  p_error text,
  p_next_run_at timestamptz
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job_id uuid;
  finished_job public.cifraclub_import_jobs;
begin
  if p_status not in ('imported', 'skipped', 'failed') then
    raise exception 'invalid item status';
  end if;

  if (p_status = 'imported' and p_song_id is null)
    or (p_status <> 'imported' and p_song_id is not null) then
    raise exception 'invalid song reference for item status';
  end if;

  update public.cifraclub_import_items
  set status = p_status,
      song_id = p_song_id,
      last_error = p_error,
      lease_until = null,
      claim_token = null,
      updated_at = now()
  where id = p_item_id
    and status = 'processing'
    and claim_token = p_claim_token
  returning job_id into selected_job_id;

  if selected_job_id is null then
    raise exception 'item is not the current claim';
  end if;

  update public.cifraclub_import_jobs as job
  set imported_count = counts.imported_count,
      skipped_count = counts.skipped_count,
      failed_count = counts.failed_count,
      status = case
        when counts.pending_count > 0 then 'processing'
        when counts.failed_count > 0 then 'completed_with_errors'
        else 'completed'
      end,
      next_run_at = coalesce(p_next_run_at, now()),
      lease_until = null,
      last_error = case when p_status = 'failed' then p_error else job.last_error end,
      updated_at = now()
  from (
    select
      count(*) filter (where status = 'imported')::integer as imported_count,
      count(*) filter (where status = 'skipped')::integer as skipped_count,
      count(*) filter (where status = 'failed')::integer as failed_count,
      count(*) filter (where status in ('pending', 'processing'))::integer as pending_count
    from public.cifraclub_import_items
    where job_id = selected_job_id
  ) as counts
  where job.id = selected_job_id
  returning job.* into finished_job;

  return finished_job;
end;
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.enqueue_cifraclub_import(text, text, integer) from public;
revoke all on function public.cancel_cifraclub_import(uuid) from public;
revoke all on function public.retry_cifraclub_import_failures(uuid) from public;
revoke all on function public.claim_cifraclub_import_work(integer) from public;
revoke all on function public.finish_cifraclub_import_item(uuid, uuid, text, uuid, text, timestamptz) from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.enqueue_cifraclub_import(text, text, integer) to authenticated;
grant execute on function public.cancel_cifraclub_import(uuid) to authenticated;
grant execute on function public.retry_cifraclub_import_failures(uuid) to authenticated;
grant execute on function public.claim_cifraclub_import_work(integer) to service_role;
grant execute on function public.finish_cifraclub_import_item(uuid, uuid, text, uuid, text, timestamptz) to service_role;

create or replace function public.normalize_cifraclub_identity(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$$;

create or replace function public.find_cifraclub_song_duplicate(
  p_slug text,
  p_title text,
  p_artist text
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select song.id
  from public.songs as song
  where (
      nullif(btrim(p_slug), '') is not null
      and song.cifraclub_slug = btrim(p_slug)
    )
    or (
      nullif(btrim(p_slug), '') is null
      and song.deleted_at is null
      and public.normalize_cifraclub_identity(song.title)
        = public.normalize_cifraclub_identity(p_title)
      and public.normalize_cifraclub_identity(song.artist)
        = public.normalize_cifraclub_identity(p_artist)
    )
  order by
    case when song.cifraclub_slug = btrim(p_slug) then 0 else 1 end,
    song.created_at
  limit 1
$$;

create or replace function public.complete_cifraclub_import_discovery(
  p_job_id uuid,
  p_artist_name text,
  p_songs jsonb,
  p_next_run_at timestamptz
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_artist_name text := btrim(coalesce(p_artist_name, ''));
  selected_job public.cifraclub_import_jobs;
  discovered_count integer;
begin
  if normalized_artist_name = '' or p_next_run_at is null then
    raise exception 'invalid discovery result';
  end if;

  select * into selected_job
  from public.cifraclub_import_jobs
  where id = p_job_id
    and status = 'discovering'
    and lease_until >= now()
  for update;

  if selected_job.id is null then
    raise exception 'discovery is not the current claim';
  end if;

  insert into public.cifraclub_import_items (
    job_id,
    song_name,
    song_slug
  )
  select
    p_job_id,
    btrim(song.name),
    lower(btrim(song.song_slug))
  from jsonb_to_recordset(coalesce(p_songs, '[]'::jsonb))
    as song(name text, song_slug text)
  where btrim(coalesce(song.name, '')) <> ''
    and lower(btrim(coalesce(song.song_slug, ''))) ~ '^[a-z0-9-]+$'
  on conflict (job_id, song_slug)
  do update set song_name = excluded.song_name;

  select count(*)::integer into discovered_count
  from public.cifraclub_import_items
  where job_id = p_job_id;

  update public.cifraclub_import_jobs
  set artist_name = normalized_artist_name,
      total_count = discovered_count,
      status = case when discovered_count = 0 then 'completed' else 'processing' end,
      next_run_at = p_next_run_at,
      lease_until = null,
      last_error = null,
      updated_at = now()
  where id = p_job_id
  returning * into selected_job;

  return selected_job;
end;
$$;

create or replace function public.fail_cifraclub_import_discovery(
  p_job_id uuid,
  p_error text
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  failed_job public.cifraclub_import_jobs;
begin
  update public.cifraclub_import_jobs
  set status = 'completed_with_errors',
      lease_until = null,
      last_error = nullif(btrim(coalesce(p_error, '')), ''),
      updated_at = now()
  where id = p_job_id
    and status = 'discovering'
    and lease_until >= now()
  returning * into failed_job;

  if failed_job.id is null then
    raise exception 'discovery is not the current claim';
  end if;

  return failed_job;
end;
$$;

create or replace function public.pause_cifraclub_import_job(
  p_job_id uuid,
  p_item_id uuid,
  p_claim_token uuid,
  p_error text
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  paused_job public.cifraclub_import_jobs;
  released_item_id uuid;
begin
  if p_item_id is not null then
    if p_claim_token is null then
      raise exception 'claim token is required';
    end if;

    update public.cifraclub_import_items
    set status = 'pending',
        lease_until = null,
        claim_token = null,
        last_error = nullif(btrim(coalesce(p_error, '')), ''),
        updated_at = now()
    where id = p_item_id
      and job_id = p_job_id
      and status = 'processing'
      and claim_token = p_claim_token
    returning id into released_item_id;

    if released_item_id is null then
      raise exception 'item is not the current claim';
    end if;
  elsif p_claim_token is not null then
    raise exception 'discovery pause cannot include a claim token';
  end if;

  update public.cifraclub_import_jobs
  set status = 'paused',
      lease_until = null,
      last_error = nullif(btrim(coalesce(p_error, '')), ''),
      updated_at = now()
  where id = p_job_id
    and (
      released_item_id is not null
      or (status = 'discovering' and lease_until >= now())
    )
  returning * into paused_job;

  if paused_job.id is null then
    raise exception 'job is not the current claim';
  end if;

  return paused_job;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'cifraclub_import_worker_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cifraclub_import_worker_secret',
      'Authenticates the scheduled CifraClub import worker'
    );
  end if;
end;
$$;

create or replace function public.validate_cifraclub_import_worker_secret(
  p_secret text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(p_secret, '') is not null
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'cifraclub_import_worker_secret'
        and decrypted_secret = p_secret
    ),
    false
  )
$$;

create or replace function public.invoke_cifraclub_import_worker()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  worker_secret text;
  worker_base_url text;
  request_id bigint;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'cifraclub_import_worker_secret';

  select coalesce(
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'cifraclub_import_worker_url'
    ),
    nullif(current_setting('app.settings.api_external_url', true), ''),
    nullif(current_setting('app.settings.supabase_url', true), '')
  ) into worker_base_url;

  if worker_secret is null then
    raise exception 'CifraClub import worker secret is not configured';
  end if;
  if worker_base_url is null then
    raise exception 'CifraClub import worker URL is not configured';
  end if;

  select net.http_post(
    url := rtrim(worker_base_url, '/')
      || '/functions/v1/cifraclub-import-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-secret', worker_secret
    ),
    body := '{}'::jsonb
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.normalize_cifraclub_identity(text) from public;
revoke all on function public.find_cifraclub_song_duplicate(text, text, text) from public;
revoke all on function public.complete_cifraclub_import_discovery(uuid, text, jsonb, timestamptz) from public;
revoke all on function public.fail_cifraclub_import_discovery(uuid, text) from public;
revoke all on function public.pause_cifraclub_import_job(uuid, uuid, uuid, text) from public;
revoke all on function public.validate_cifraclub_import_worker_secret(text) from public;
revoke all on function public.invoke_cifraclub_import_worker() from public;

grant execute on function public.find_cifraclub_song_duplicate(text, text, text) to service_role;
grant execute on function public.complete_cifraclub_import_discovery(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function public.fail_cifraclub_import_discovery(uuid, text) to service_role;
grant execute on function public.pause_cifraclub_import_job(uuid, uuid, uuid, text) to service_role;
grant execute on function public.validate_cifraclub_import_worker_secret(text) to service_role;

select cron.schedule(
  'cifraclub-import-worker',
  '* * * * *',
  $cron$select public.invoke_cifraclub_import_worker();$cron$
);
