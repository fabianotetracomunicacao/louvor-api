const fs = require('fs');

const migrationPath = 'supabase/migrations/20260728170000_create_cifraclub_import_queue.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const passenger = fs.readFileSync('passenger_wsgi.py', 'utf8');
const apiSource = fs.readFileSync('api.py', 'utf8');
const cifraClubSource = fs.readFileSync('cifraclub.py', 'utf8');

function requirePattern(pattern, behavior) {
  if (!pattern.test(sql)) {
    throw new Error(`Missing contract for ${behavior}`);
  }
}

function requireSourcePattern(source, pattern, behavior) {
  if (!pattern.test(source)) {
    throw new Error(`Missing production artifact contract for ${behavior}`);
  }
}

function rejectSourcePattern(source, pattern, behavior) {
  if (pattern.test(source)) {
    throw new Error(`Forbidden production artifact contract: ${behavior}`);
  }
}

requireSourcePattern(
  dockerfile,
  /^COPY requirements\.txt requirements\.txt$/m,
  'Docker installs the root API requirements'
);
requireSourcePattern(
  dockerfile,
  /^COPY api\.py cifraclub\.py \.\/$/m,
  'Docker packages the canonical root API modules'
);
requireSourcePattern(
  dockerfile,
  /^COPY static\/ \.\/static\/$/m,
  'Docker packages root static assets'
);
rejectSourcePattern(
  dockerfile,
  /COPY app\/|app\/requirements\.txt/,
  'Docker must not execute the divergent app copy'
);
requireSourcePattern(
  passenger,
  /sys\.path\.insert\(0, os\.path\.dirname\(os\.path\.abspath\(__file__\)\)\)/,
  'Passenger imports the canonical root API'
);
rejectSourcePattern(
  passenger,
  /['"]\/app['"]/,
  'Passenger must not import the divergent app copy'
);
requireSourcePattern(
  apiSource,
  /@app\.get\("\/api\/artists\/<artist_slug>\/catalog"\)/,
  'the production catalog route'
);
requireSourcePattern(
  apiSource,
  /@app\.(?:get|route)\(['"]\/artists\/<artist>\/songs\/<song>['"]\)/,
  'the production detail route'
);
rejectSourcePattern(
  `${apiSource}\n${cifraClubSource}`,
  /\bimpersonate\s*=/,
  'production HTTP requests must not impersonate browsers'
);
requireSourcePattern(
  `${apiSource}\n${cifraClubSource}`,
  /LouvorPlay-CifraImporter\/1\.0/,
  'a transparent stable production User-Agent'
);

requirePattern(
  /claim_token uuid/,
  'a claim token stored with each item'
);
requirePattern(
  /claim_token uuid,\s*needs_discovery boolean/s,
  'the claim token returned by claim_cifraclub_import_work'
);
requirePattern(
  /claim_token = gen_random_uuid\(\)/,
  'a fresh token when an item is claimed'
);
requirePattern(
  /p_claim_token uuid/,
  'a claim token required by finish_cifraclub_import_item'
);
requirePattern(
  /and claim_token = p_claim_token/,
  'stale completion rejected by claim-token fencing'
);

requirePattern(
  /create unique index cifraclub_import_only_one_processing_item\s+on public\.cifraclub_import_items \(\(true\)\)\s+where status = 'processing';/s,
  'a database-wide single processing item invariant'
);
requirePattern(
  /if exists \(\s*select 1\s*from pg_publication\s*where pubname = 'supabase_realtime'\s*\)[\s\S]*if not exists \([\s\S]*from pg_publication_tables[\s\S]*tablename = 'cifraclub_import_jobs'[\s\S]*alter publication supabase_realtime add table public\.cifraclub_import_jobs;/s,
  'an idempotent Realtime publication entry for import jobs'
);
requirePattern(
  /if not exists \([\s\S]*from pg_publication_tables[\s\S]*tablename = 'cifraclub_import_items'[\s\S]*alter publication supabase_realtime add table public\.cifraclub_import_items;/s,
  'an idempotent Realtime publication entry for import items'
);
requirePattern(
  /perform pg_advisory_xact_lock\(hashtext\('cifraclub_import_work_claim'\)\);/,
  'serialized concurrent claim attempts'
);
requirePattern(
  /from public\.cifraclub_import_items\s+where status = 'processing'\s+and lease_until >= now\(\)/s,
  'an active global processing lease blocking another job'
);
requirePattern(
  /perform pg_advisory_xact_lock[\s\S]*update public\.cifraclub_import_items\s+set status = 'pending'[\s\S]*where status = 'processing'\s+and lease_until < now\(\)[\s\S]*select exists \(/,
  'expired global processing items recovered before the active-item check'
);

requirePattern(
  /check \(status = 'imported' or song_id is null\)/,
  'historical imported rows without a song after ON DELETE SET NULL'
);
requirePattern(
  /if \(p_status = 'imported' and p_song_id is null\)/,
  'finish RPC rejection of imported without a song ID'
);
requirePattern(
  /p_status <> 'imported' and p_song_id is not null/,
  'finish-time rejection of song_id for non-imported states'
);

requirePattern(
  /alter table public\.songs\s+add column if not exists cifraclub_url text;/,
  'the CifraClub source URL stored with imported songs'
);
requirePattern(
  /create or replace function public\.normalize_cifraclub_identity\(p_value text\)/,
  'canonical title and artist normalization in the database'
);
requirePattern(
  /create or replace function public\.find_cifraclub_song_duplicate\(\s*p_slug text,\s*p_title text,\s*p_artist text\s*\)/s,
  'deduplication before and after the individual page fetch'
);
requirePattern(
  /create or replace function public\.complete_cifraclub_import_discovery\(/,
  'transactional discovery completion'
);
requirePattern(
  /cifraclub_import_jobs \([\s\S]*claim_token uuid/,
  'a fencing token stored for discovery claims'
);
requirePattern(
  /set status = 'discovering',[\s\S]*claim_token = gen_random_uuid\(\)/,
  'a fresh discovery fencing token'
);
requirePattern(
  /complete_cifraclub_import_discovery\([\s\S]*p_claim_token uuid[\s\S]*and claim_token = p_claim_token/,
  'discovery completion fenced by its token'
);
requirePattern(
  /fail_cifraclub_import_discovery\([\s\S]*p_claim_token uuid[\s\S]*and claim_token = p_claim_token/,
  'discovery failure fenced by its token'
);
requirePattern(
  /on conflict \(job_id, song_slug\)\s+do update set song_name = excluded\.song_name/s,
  'catalog item upsert'
);
requirePattern(
  /artist_name = normalized_artist_name/,
  'the canonical artist name persisted from discovery'
);
requirePattern(
  /create or replace function public\.fail_cifraclub_import_discovery\(/,
  'terminal discovery failure that releases its lease'
);
requirePattern(
  /create or replace function public\.pause_cifraclub_import_job\(/,
  'blocked upstream pause handling'
);
requirePattern(
  /pause_cifraclub_import_job\([\s\S]*p_next_run_at timestamptz[\s\S]*blocked_count = blocked_count \+ 1[\s\S]*next_run_at = p_next_run_at/,
  'pause backoff and repeated-block accounting'
);
requirePattern(
  /create or replace function public\.retry_cifraclub_import_item\(/,
  'temporary item retry without failed counters'
);
requirePattern(
  /create or replace function public\.retry_cifraclub_import_discovery\(/,
  'temporary discovery retry'
);
requirePattern(
  /create or replace function public\.resume_cifraclub_import\(/,
  'an explicit paused-job resume path'
);

requirePattern(
  /create or replace function public\.import_cifraclub_song\(/,
  'atomic song import and item completion'
);
requirePattern(
  /from public\.cifraclub_import_items[\s\S]*status = 'processing'[\s\S]*claim_token = p_claim_token[\s\S]*lease_until >= now\(\)[\s\S]*for update/,
  'atomic import locks only the current unexpired claim'
);
requirePattern(
  /insert into public\.songs[\s\S]*update public\.cifraclub_import_items[\s\S]*update public\.cifraclub_import_jobs/s,
  'song insert, item completion and counters in one RPC transaction'
);

requirePattern(
  /create extension if not exists supabase_vault with schema vault;/,
  'Vault availability'
);
requirePattern(
  /vault\.create_secret\(\s*encode\(gen_random_bytes\(32\), 'hex'\),\s*'cifraclub_import_worker_secret'/s,
  'a random worker secret created in Vault'
);
requirePattern(
  /create or replace function public\.validate_cifraclub_import_worker_secret\(\s*p_secret text\s*\)/s,
  'worker header validation against Vault'
);
requirePattern(
  /from vault\.decrypted_secrets\s+where name = 'cifraclub_import_worker_secret'/s,
  'decrypted worker secret lookup'
);
requirePattern(
  /create extension if not exists pg_net with schema extensions;/,
  'pg_net availability'
);
requirePattern(
  /create extension if not exists pg_cron with schema pg_catalog;/,
  'pg_cron availability'
);
requirePattern(
  /cron\.schedule\(\s*'cifraclub-import-worker',\s*'\* \* \* \* \*'/s,
  'one cron attempt per minute'
);
requirePattern(
  /net\.http_post\(/,
  'the cron HTTP invocation'
);
requirePattern(
  /'x-worker-secret', worker_secret/,
  'the Vault secret sent in the worker header'
);

console.log('cifraclub import queue static validation: PASS');
