import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontrados no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_IDENTIFIER = '[TEST_E2E]';

async function cleanupTestData() {
  console.log(`🧹 Iniciando limpeza segura de dados (Buscando identificador: ${TEST_IDENTIFIER})...`);
  
  try {
    // 1. Clean Songs
    const { data: songs, error: songErr } = await supabase
      .from('songs')
      .select('id')
      .like('title', `%${TEST_IDENTIFIER}%`);
      
    if (songErr) throw songErr;
    
    if (songs && songs.length > 0) {
      const songIds = songs.map(s => s.id);
      await supabase.from('songs').delete().in('id', songIds);
      console.log(`✅ ${songs.length} Músicas de teste removidas.`);
    }

    // 2. Clean Playlists
    const { data: playlists, error: pErr } = await supabase
      .from('playlists')
      .select('id')
      .like('name', `%${TEST_IDENTIFIER}%`);
      
    if (pErr) throw pErr;
    
    if (playlists && playlists.length > 0) {
      const pIds = playlists.map(p => p.id);
      await supabase.from('playlists').delete().in('id', pIds);
      console.log(`✅ ${playlists.length} Playlists de teste removidas.`);
    }
    
    // 3. Clean Setlists
    const { data: setlists, error: sErr } = await supabase
      .from('setlists')
      .select('id')
      .like('title', `%${TEST_IDENTIFIER}%`);
      
    if (sErr) throw sErr;
    
    if (setlists && setlists.length > 0) {
      const sIds = setlists.map(s => s.id);
      await supabase.from('setlists').delete().in('id', sIds);
      console.log(`✅ ${setlists.length} Setlists de teste removidas.`);
    }
    
    // 4. Clean Test Users Profiles
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .like('full_name', `%${TEST_IDENTIFIER}%`);
      
    if (!profErr && profiles && profiles.length > 0) {
       const profIds = profiles.map(p => p.id);
       await supabase.from('profiles').delete().in('id', profIds);
       console.log(`✅ ${profiles.length} Perfis de teste removidos.`);
    }

    console.log('✨ Limpeza segura concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a limpeza de dados de teste:', error.message);
  }
}

cleanupTestData();
