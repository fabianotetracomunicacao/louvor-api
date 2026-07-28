const fs = require('fs');

const migrationPath = 'supabase/migrations/20260728170000_create_cifraclub_import_queue.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

function requirePattern(pattern, behavior) {
  if (!pattern.test(sql)) {
    throw new Error(`Missing contract for ${behavior}`);
  }
}

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
