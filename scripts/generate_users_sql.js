import fs from 'fs';
import path from 'path';

const csvContent = fs.readFileSync(path.resolve(process.cwd(), 'exported_users.csv'), 'utf8');

// Parse CSV manually
const lines = csvContent.trim().split('\n');
const header = lines[0].split(',');

let sql = `-- ==============================================================================
-- RESTORE AUTH USERS (15 USERS)
-- ==============================================================================

`;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  // Pattern match columns carefully or use basic regex
  // Match UUID, email, encrypted_password, metadata
  const match = line.match(/^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*)$/);
  
  if (match) {
    const [_, instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, rest] = match;

    sql += `INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmed_at
) VALUES (
  '${instance_id}',
  '${id}',
  '${aud}',
  '${role}',
  '${email}',
  '${encrypted_password}',
  ${email_confirmed_at ? `'${email_confirmed_at}'` : 'NULL'},
  ${last_sign_in_at ? `'${last_sign_in_at}'` : 'NULL'},
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "${email.split('@')[0]}"}'::jsonb,
  now(),
  now(),
  ${email_confirmed_at ? `'${email_confirmed_at}'` : 'NULL'}
) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

`;
  }
}

fs.writeFileSync(path.resolve(process.cwd(), 'insert_users.sql'), sql);
console.log('✅ Arquivo insert_users.sql gerado com sucesso!');
