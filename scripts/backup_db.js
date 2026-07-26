import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const supabaseUrl = 'https://hqhjhnjauuyxithgeens.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxaGpobmphdXV5eGl0aGdlZW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTc3ODksImV4cCI6MjA4MTk5Mzc4OX0.x_Hfu6eRlIAY_RV6YOhVIo4dw0pKHyYNpXyUOQ7Po60';

const supabase = createClient(supabaseUrl, supabaseKey);

const tablesToBackup = [
    'songs',
    'playlists',
    'playlist_items',
    'playlist_members',
    'profiles',
    'user_song_preferences',
    'chords',
    'comments',
    'likes',
    'notifications'
];

async function runBackup() {
    console.log('[Backup Database] Iniciando exportação leve de dados...');
    
    const backupDir = path.join(projectRoot, '.backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
        timestamp: new Date().toISOString(),
        project: 'LouvorPlay',
        tables: {}
    };

    let totalRecords = 0;

    for (const table of tablesToBackup) {
        try {
            const { data, error } = await supabase.from(table).select('*');
            if (error) {
                console.warn(`[Backup Database] Aviso na tabela ${table}:`, error.message);
                backupData.tables[table] = { error: error.message, data: [] };
            } else {
                backupData.tables[table] = { count: data ? data.length : 0, data: data || [] };
                totalRecords += data ? data.length : 0;
                console.log(`  ✓ Tabela ${table}: ${data ? data.length : 0} registros`);
            }
        } catch (e) {
            console.warn(`[Backup Database] Falha ao ler ${table}:`, e.message);
        }
    }

    const backupFile = path.join(backupDir, `db_backup_${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

    const stats = fs.statSync(backupFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`\n✅ Backup leve do banco de dados concluído com sucesso!`);
    console.log(`   Arquivo: .backups/db_backup_${timestamp}.json`);
    console.log(`   Total de registros: ${totalRecords}`);
    console.log(`   Tamanho do arquivo: ${sizeKB} KB\n`);

    return backupFile;
}

runBackup().catch(err => {
    console.error('Erro ao executar backup:', err);
    process.exit(1);
});
