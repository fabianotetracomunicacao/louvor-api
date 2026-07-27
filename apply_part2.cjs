const fs = require('fs');
const { Client } = require('pg');

const newDbUrl = 'postgresql://postgres.jthvbixdlkrbeztqqqkx:Akl29louvorplay!!!@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

// We gather all SQL scripts to run sequentially
const scripts = [
    { name: 'rename_table', content: 'ALTER TABLE IF EXISTS public.instrument_metadata RENAME TO song_instrument_metadata;' }
];

// Extract user_preferences
const setupSql = fs.readFileSync('setup_clean_project.sql', 'utf8');
const lines = setupSql.split('\n');
const startIdx = lines.findIndex(l => l.includes('CREATE TABLE IF NOT EXISTS public.user_preferences'));
let endIdx = startIdx;
while (endIdx < lines.length && !lines[endIdx].includes(');')) endIdx++;
scripts.push({
    name: 'user_preferences',
    content: lines.slice(startIdx, endIdx + 1).join('\n')
});

// Other root scripts
const rootFiles = [
    'create_missing_playlist_tables.sql',
    'fix_setlist_schema.sql',
    'add_projection_content_column.sql',
    'add_projection_overrides_to_items.sql'
];
for (const f of rootFiles) {
    if (fs.existsSync(f)) {
        scripts.push({ name: f, content: fs.readFileSync(f, 'utf8') });
    }
}

// All migration files
const migrationsDir = 'supabase/migrations';
const mFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
mFiles.sort();
for (const f of mFiles) {
    scripts.push({ name: f, content: fs.readFileSync(migrationsDir + '/' + f, 'utf8') });
}

async function migrate() {
    const client = new Client({ connectionString: newDbUrl });
    try {
        await client.connect();
        console.log('Connected to new Supabase DB.');

        for (const script of scripts) {
            try {
                console.log(`Running ${script.name}...`);
                await client.query(script.content);
                console.log(`  -> SUCCESS`);
            } catch (err) {
                console.log(`  -> WARNING: ${err.message}`);
                // We continue on error because some might be "already exists" or "policy exists"
            }
        }

        // Reload schema cache
        await client.query("NOTIFY pgrst, 'reload schema'");
        console.log('Reloaded PostgREST schema cache.');

    } catch (err) {
        console.error('Fatal Error:', err);
    } finally {
        await client.end();
        console.log('Done.');
    }
}

migrate();
