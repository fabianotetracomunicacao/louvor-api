import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const backupDir = path.join(projectRoot, '.backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `snapshot-${timestamp}.json`);

const metadata = {
    timestamp: new Date().toISOString(),
    project: 'LouvorPlay',
    supabaseUrl: 'https://jthvbixdlkrbeztqqqkx.supabase.co',
    status: 'Lightweight local project backup snapshot created successfully'
};

fs.writeFileSync(backupPath, JSON.stringify(metadata, null, 2));
console.log(`[Backup] Lightweight local backup saved: ${backupPath}`);
