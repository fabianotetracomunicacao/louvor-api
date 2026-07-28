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
  /check \(\s*\(status = 'imported' and song_id is not null\)\s*or \(status <> 'imported' and song_id is null\)\s*\)/s,
  'song_id integrity for imported and non-imported states'
);
requirePattern(
  /if \(p_status = 'imported' and p_song_id is null\)\s+or \(p_status <> 'imported' and p_song_id is not null\) then/s,
  'finish-time song_id validation'
);

console.log('cifraclub import queue static validation: PASS');
