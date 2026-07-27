-- ==============================================================================
-- LOUVORPLAY - COMPLETE DATABASE & USER INITIALIZATION (SÃO PAULO - SA-EAST-1)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & TYPES
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'editor', 'musician', 'super_admin', 'user', 'viewer', 'church_admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. CORE TABLES

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  role user_role DEFAULT 'musician'::user_role,
  full_name TEXT,
  name TEXT,
  active_church_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SONGS
CREATE TABLE IF NOT EXISTS public.songs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  content TEXT,
  original_key TEXT,
  font_size INTEGER DEFAULT 12,
  line_spacing FLOAT DEFAULT 1.0,
  cifraclub_slug TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PLAYLISTS
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  playlist_type TEXT DEFAULT 'personal',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PLAYLIST ITEMS
CREATE TABLE IF NOT EXISTS public.playlist_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  custom_transposition INTEGER DEFAULT 0,
  proj_bg_color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SETLISTS
CREATE TABLE IF NOT EXISTS public.setlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  name TEXT,
  description TEXT,
  date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SETLIST ITEMS
CREATE TABLE IF NOT EXISTS public.setlist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setlist_id UUID REFERENCES public.setlists(id) ON DELETE CASCADE NOT NULL,
  song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  usage_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- MUSICAL STYLES
CREATE TABLE IF NOT EXISTS public.musical_styles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SONG FUNCTIONS
CREATE TABLE IF NOT EXISTS public.song_functions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CHORDS
CREATE TABLE IF NOT EXISTS public.chords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  diagram JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- APP SETTINGS
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SYSTEM MEDIA
CREATE TABLE IF NOT EXISTS public.system_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- E2E REPORTS (ROBÔS DE TESTE)
CREATE TABLE IF NOT EXISTS public.e2e_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL,
  total_passes INT NOT NULL,
  total_tests INT NOT NULL,
  passed_tests INT NOT NULL,
  failed_tests INT NOT NULL,
  total_time_ms INT NOT NULL,
  details JSONB
);

-- INSTRUMENT METADATA
CREATE TABLE IF NOT EXISTS public.instrument_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  instrument_name TEXT NOT NULL,
  key TEXT,
  tuning TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SUBSCRIPTIONS & ASAAS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  customer_id TEXT,
  subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan_type TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- USER ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ROW LEVEL SECURITY (RLS) & POLICIES

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musical_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Songs are viewable by everyone" ON public.songs FOR SELECT USING (true);
CREATE POLICY "Authenticated can create songs" ON public.songs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Editors can update own songs" ON public.songs FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Admins can update all songs" ON public.songs FOR UPDATE USING (true);

CREATE POLICY "Public playlists are viewable by everyone" ON public.playlists FOR SELECT USING (true);
CREATE POLICY "Users can insert own playlists" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own playlists" ON public.playlists FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own playlists" ON public.playlists FOR DELETE USING (auth.uid() = owner_id);

CREATE POLICY "Items viewable by everyone" ON public.playlist_items FOR SELECT USING (true);
CREATE POLICY "Users can manage playlist items" ON public.playlist_items FOR ALL USING (true);

-- POLICIES FOR SETLISTS & ITEMS
DROP POLICY IF EXISTS "Setlists viewable by everyone" ON public.setlists;
DROP POLICY IF EXISTS "Setlists editable by authenticated" ON public.setlists;
CREATE POLICY "Setlists viewable by everyone" ON public.setlists FOR SELECT USING (true);
CREATE POLICY "Setlists editable by authenticated" ON public.setlists FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Setlist items viewable by everyone" ON public.setlist_items;
DROP POLICY IF EXISTS "Setlist items editable by authenticated" ON public.setlist_items;
CREATE POLICY "Setlist items viewable by everyone" ON public.setlist_items FOR SELECT USING (true);
CREATE POLICY "Setlist items editable by authenticated" ON public.setlist_items FOR ALL USING (auth.role() = 'authenticated');

-- POLICIES FOR E2E REPORTS
DROP POLICY IF EXISTS "Enable read access for everyone" ON public.e2e_reports;
DROP POLICY IF EXISTS "Enable insert access for everyone" ON public.e2e_reports;
CREATE POLICY "Enable read access for everyone" ON public.e2e_reports FOR SELECT USING (true);
CREATE POLICY "Enable insert access for everyone" ON public.e2e_reports FOR INSERT WITH CHECK (true);

-- OTHER POLICIES
DROP POLICY IF EXISTS "Enable read access for all musical_styles" ON public.musical_styles;
DROP POLICY IF EXISTS "Enable read access for all song_functions" ON public.song_functions;
DROP POLICY IF EXISTS "Enable read access for all chords" ON public.chords;
DROP POLICY IF EXISTS "Enable read access for app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Enable read access for system_media" ON public.system_media;
CREATE POLICY "Enable read access for all musical_styles" ON public.musical_styles FOR SELECT USING (true);
CREATE POLICY "Enable read access for all song_functions" ON public.song_functions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all chords" ON public.chords FOR SELECT USING (true);
CREATE POLICY "Enable read access for app_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Enable read access for system_media" ON public.system_media FOR SELECT USING (true);

-- 5. TRIGGER FOR NEW USERS
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name, name)
  VALUES (
    new.id, 
    new.email, 
    'musician'::user_role,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    COALESCE(new.raw_user_meta_data->>'full_name', 'Novo Usuário')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
