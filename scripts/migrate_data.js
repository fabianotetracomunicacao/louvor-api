import { createClient } from '@supabase/supabase-js';

// Credenciais do Supabase ANTIGO (Oregon - us-west-2)
const OLD_URL = 'https://hqhjhnjauuyxithgeens.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxaGpobmphdXV5eGl0aGdlZW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTc3ODksImV4cCI6MjA4MTk5Mzc4OX0.x_Hfu6eRlIAY_RV6YOhVIo4dw0pKHyYNpXyUOQ7Po60';

// Credenciais do Supabase NOVO (São Paulo - sa-east-1)
const NEW_URL = process.env.VITE_SUPABASE_URL || 'https://jthvbixdlkrbeztqqqkx.supabase.co';
const NEW_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_jhIGoP1fIApPFDHi_enYcw_UNATA3Ja';

const oldSupabase = createClient(OLD_URL, OLD_KEY);
const newSupabase = createClient(NEW_URL, NEW_KEY);

// Lista de tabelas públicas a serem migradas
const TABLES_TO_MIGRATE = [
  'profiles',
  'musical_styles',
  'song_functions',
  'songs',
  'playlists',
  'playlist_items',
  'setlists',
  'setlist_items',
  'churches',
  'church_user_memberships',
  'instrument_metadata',
  'user_preferences',
  'subscriptions',
  'app_settings',
  'chords',
  'notifications',
  'playlist_comments',
  'playlist_members',
  'playlist_scales',
  'setlist_scales',
  'system_media',
  'user_activity_logs',
  'user_history',
  'user_likes',
  'user_song_preferences'
];

async function migrate() {
  console.log('🚀 Iniciando Migração Automática de Dados (Oregon -> São Paulo)...\n');

  for (const table of TABLES_TO_MIGRATE) {
    try {
      console.log(`📦 Lendo tabela: ${table}...`);
      const { data, error } = await oldSupabase.from(table).select('*');

      if (error) {
        console.warn(`   ⚠️ Aviso ao ler ${table}: ${error.message} (Pode não existir ou estar vazia)`);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`   ℹ️ Tabela ${table} está vazia. Pulando.`);
        continue;
      }

      console.log(`   --> ${data.length} registros encontrados. Inserindo no novo Supabase...`);
      
      // Inserção em lotes (batch)
      const { error: insertError } = await newSupabase.from(table).upsert(data, { ignoreDuplicates: true });

      if (insertError) {
        console.error(`   ❌ Erro ao inserir na tabela ${table}: ${insertError.message}`);
      } else {
        console.log(`   ✅ Tabela ${table} migrada com sucesso!`);
      }
    } catch (err) {
      console.error(`   ❌ Erro inesperado na tabela ${table}:`, err.message);
    }
  }

  console.log('\n✨ Migração de dados de tabelas finalizada!');
}

migrate();
