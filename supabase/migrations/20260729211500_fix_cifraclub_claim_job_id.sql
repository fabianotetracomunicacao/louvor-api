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
  has_active_discovery boolean;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'lease duration must be positive';
  end if;

  lease_expires_at := now() + make_interval(secs => p_lease_seconds);

  perform pg_advisory_xact_lock(hashtext('cifraclub_import_work_claim'));

  update public.cifraclub_import_items as item
  set status = 'pending',
      lease_until = null,
      claim_token = null,
      updated_at = now()
  where item.status = 'processing'
    and item.lease_until < now();

  update public.cifraclub_import_jobs as job
  set lease_until = null,
      updated_at = now()
  where job.status = 'processing'
    and job.lease_until < now();

  select exists (
    select 1
    from public.cifraclub_import_items as item
    where item.status = 'processing'
      and item.lease_until >= now()
  ) into has_active_item;

  select exists (
    select 1
    from public.cifraclub_import_jobs as job
    where job.status = 'discovering'
      and job.lease_until >= now()
  ) into has_active_discovery;

  if has_active_item or has_active_discovery then
    return;
  end if;

  select job.* into selected_job
  from public.cifraclub_import_jobs as job
  where (
      job.status in ('pending', 'discovering', 'processing')
      or (
        job.status = 'paused'
        and job.blocked_count > 0
        and job.blocked_count < job.blocked_retry_limit
      )
    )
    and (job.lease_until is null or job.lease_until < now())
  order by job.created_at, job.id
  for update
  limit 1;

  if selected_job.id is null then
    return;
  end if;

  if selected_job.next_run_at > now() then
    return;
  end if;

  select exists (
    select 1
    from public.cifraclub_import_items as item
    where item.job_id = selected_job.id
  ) into has_items;

  if not has_items then
    update public.cifraclub_import_jobs as job
    set status = 'discovering',
        lease_until = lease_expires_at,
        claim_token = gen_random_uuid(),
        discovery_attempts = job.discovery_attempts + 1,
        updated_at = now()
    where job.id = selected_job.id
    returning job.* into selected_job;

    return query
    select
      selected_job.id,
      selected_job.artist_name,
      selected_job.artist_slug,
      selected_job.created_by,
      null::uuid,
      null::text,
      null::text,
      selected_job.discovery_attempts,
      selected_job.claim_token,
      true;
    return;
  end if;

  select item.* into selected_item
  from public.cifraclub_import_items as item
  where item.job_id = selected_job.id
    and (
      item.status = 'pending'
      or (item.status = 'processing' and item.lease_until < now())
    )
  order by item.created_at
  for update skip locked
  limit 1;

  if selected_item.id is null then
    update public.cifraclub_import_jobs as job
    set status = case
          when job.failed_count > 0 then 'completed_with_errors'
          else 'completed'
        end,
        lease_until = null,
        updated_at = now()
    where job.id = selected_job.id;
    return;
  end if;

  update public.cifraclub_import_jobs as job
  set status = 'processing',
      lease_until = lease_expires_at,
      claim_token = null,
      updated_at = now()
  where job.id = selected_job.id;

  update public.cifraclub_import_items as item
  set status = 'processing',
      attempts = item.attempts + 1,
      lease_until = lease_expires_at,
      claim_token = gen_random_uuid(),
      updated_at = now()
  where item.id = selected_item.id
  returning item.* into selected_item;

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

revoke all on function public.claim_cifraclub_import_work(integer) from public;
grant execute on function public.claim_cifraclub_import_work(integer) to service_role;
