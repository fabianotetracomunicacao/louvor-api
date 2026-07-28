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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'lease duration must be positive';
  end if;

  lease_expires_at := now() + make_interval(secs => p_lease_seconds);

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
    false;
end;
$$;

create or replace function public.finish_cifraclub_import_item(
  p_item_id uuid,
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

  update public.cifraclub_import_items
  set status = p_status,
      song_id = p_song_id,
      last_error = p_error,
      lease_until = null,
      updated_at = now()
  where id = p_item_id
    and status = 'processing'
  returning job_id into selected_job_id;

  if selected_job_id is null then
    raise exception 'item is not being processed';
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
revoke all on function public.finish_cifraclub_import_item(uuid, text, uuid, text, timestamptz) from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.enqueue_cifraclub_import(text, text, integer) to authenticated;
grant execute on function public.cancel_cifraclub_import(uuid) to authenticated;
grant execute on function public.retry_cifraclub_import_failures(uuid) to authenticated;
grant execute on function public.claim_cifraclub_import_work(integer) to service_role;
grant execute on function public.finish_cifraclub_import_item(uuid, text, uuid, text, timestamptz) to service_role;
