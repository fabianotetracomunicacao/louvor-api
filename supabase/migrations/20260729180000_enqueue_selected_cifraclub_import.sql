create or replace function public.enqueue_selected_cifraclub_import(
  p_artist_name text,
  p_artist_slug text,
  p_songs jsonb
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
  inserted_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if normalized_name = '' or normalized_slug !~ '^[a-z0-9-]+$' then
    raise exception 'invalid artist';
  end if;

  if p_songs is null
    or jsonb_typeof(p_songs) <> 'array'
    or jsonb_array_length(p_songs) = 0
    or jsonb_array_length(p_songs) > 5000
  then
    raise exception 'invalid song selection';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_songs) as song(name text, song_slug text)
    where btrim(coalesce(song.name, '')) = ''
      or lower(btrim(coalesce(song.song_slug, ''))) !~ '^[a-z0-9-]+$'
  ) then
    raise exception 'selection contains an invalid song';
  end if;

  insert into public.cifraclub_import_jobs (
    artist_name,
    artist_slug,
    status,
    total_count,
    next_run_at,
    created_by
  )
  values (
    normalized_name,
    normalized_slug,
    'processing',
    0,
    now(),
    auth.uid()
  )
  returning * into created_job;

  insert into public.cifraclub_import_items (
    job_id,
    song_name,
    song_slug
  )
  select
    created_job.id,
    selected_song.name,
    selected_song.song_slug
  from (
    select distinct on (lower(btrim(song.song_slug)))
      btrim(song.name) as name,
      lower(btrim(song.song_slug)) as song_slug
    from jsonb_to_recordset(p_songs) as song(name text, song_slug text)
    order by lower(btrim(song.song_slug)), btrim(song.name)
  ) as selected_song
  on conflict (job_id, song_slug) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception 'selection has no valid songs';
  end if;

  update public.cifraclub_import_jobs
  set total_count = inserted_count,
      status = 'processing',
      updated_at = now()
  where id = created_job.id
  returning * into created_job;

  return created_job;
end;
$$;

revoke all on function public.enqueue_selected_cifraclub_import(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_selected_cifraclub_import(text, text, jsonb)
  to authenticated;
