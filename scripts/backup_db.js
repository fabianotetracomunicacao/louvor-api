import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const supabaseUrl = 'https://jthvbixdlkrbeztqqqkx.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0aHZiaXhkbGtyYmV6dHFxcWt4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTE1ODgwNCwiZXhwIjoyMTAwNzM0ODA0fQ.HeVRSWN2C2EElct55y6uGBhn-lERE0oODlKxkctypdc';

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Lista das tabelas do schema public
const tablesToBackup = [
    'profiles',
    'songs',
    'playlists',
    'playlist_items',
    'playlist_members',
    'playlist_comments',
    'setlists',
    'setlist_items',
    'setlist_scales',
    'churches',
    'church_user_memberships',
    'invitations',
    'subscriptions',
    'plans',
    'legacy_subscriptions',
    'user_likes',
    'notifications',
    'user_preferences',
    'user_song_preferences',
    'user_activity_logs',
    'user_history',
    'chords',
    'song_functions',
    'musical_styles',
    'instrument_metadata',
    'song_instrument_metadata',
    'system_media',
    'app_settings',
    'e2e_reports'
];

async function runBackup() {
    console.log('[Backup Database] Iniciando exportação completa dos dados do banco...');
    
    const backupDir = path.join(projectRoot, '.backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
        timestamp: new Date().toISOString(),
        project: 'LouvorPlay',
        projectRef: 'jthvbixdlkrbeztqqqkx',
        tablesCount: tablesToBackup.length,
        tables: {}
    };

    let totalRecords = 0;
    let sqlContent = `-- LouvorPlay Backup Completo\n-- Data: ${new Date().toISOString()}\n-- Supabase Ref: jthvbixdlkrbeztqqqkx\n\n`;

    for (const table of tablesToBackup) {
        try {
            const { data, error } = await supabase.from(table).select('*');
            if (error) {
                console.warn(`  ⚠️ Tabela ${table}:`, error.message);
                backupData.tables[table] = { error: error.message, data: [] };
            } else {
                const rows = data || [];
                backupData.tables[table] = { count: rows.length, data: rows };
                totalRecords += rows.length;
                console.log(`  ✓ Tabela ${table}: ${rows.length} registros`);

                if (rows.length > 0) {
                    const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');
                    sqlContent += `-- Tabela: ${table}\n`;
                    for (const row of rows) {
                        const vals = Object.values(row).map(val => {
                            if (val === null || val === undefined) return 'NULL';
                            if (typeof val === 'boolean' || typeof val === 'number') return val;
                            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                            return `'${String(val).replace(/'/g, "''")}'`;
                        }).join(', ');
                        sqlContent += `INSERT INTO public."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
                    }
                    sqlContent += '\n';
                }
            }
        } catch (e) {
            console.warn(`  ⚠️ Falha ao ler ${table}:`, e.message);
        }
    }

    const jsonFile = path.join(backupDir, `db_backup_${timestamp}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(backupData, null, 2));

    const sqlFile = path.join(backupDir, `db_backup_${timestamp}.sql`);
    fs.writeFileSync(sqlFile, sqlContent);

    const sizeJson = (fs.statSync(jsonFile).size / 1024).toFixed(2);
    const sizeSql = (fs.statSync(sqlFile).size / 1024).toFixed(2);

    console.log(`\n✅ Backup leve e completo do banco concluído com sucesso!`);
    console.log(`   JSON: .backups/db_backup_${timestamp}.json (${sizeJson} KB)`);
    console.log(`   SQL:  .backups/db_backup_${timestamp}.sql (${sizeSql} KB)`);
    console.log(`   Tabelas: ${tablesToBackup.length} | Registros: ${totalRecords}\n`);

    return { jsonFile, sqlFile };
}

runBackup().catch(err => {
    console.error('Erro ao executar backup:', err);
    process.exit(1);
});
