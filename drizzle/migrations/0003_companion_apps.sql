-- Companion apps: time-aware chat, private moments, focus history, and a
-- user-owned local music library. This migration is additive and preserves all
-- existing profile, diary, persona, and chat data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS time_awareness_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  ADD COLUMN IF NOT EXISTS wallpaper_preset text NOT NULL DEFAULT 'linen';

CREATE TABLE IF NOT EXISTS public.moment_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(content)) > 0 OR cardinality(image_paths) > 0),
  CHECK (cardinality(image_paths) <= 9)
);

CREATE TABLE IF NOT EXISTS public.moment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.moment_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'char')),
  char_id uuid REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_kind = 'user' AND char_id IS NULL) OR (actor_kind = 'char' AND char_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.moment_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'char')),
  char_id uuid REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.moment_comments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_kind = 'user' AND char_id IS NULL) OR (actor_kind = 'char' AND char_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  char_id uuid REFERENCES public.ai_personas(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
  planned_seconds integer NOT NULL CHECK (planned_seconds BETWEEN 60 AND 14400),
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'reset')),
  start_message text NOT NULL DEFAULT '',
  end_message text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  artist text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.music_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  char_id uuid NOT NULL REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moment_posts_owner_created ON public.moment_posts(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moment_likes_actor ON public.moment_likes(post_id, actor_kind, COALESCE(char_id, user_id));
CREATE INDEX IF NOT EXISTS idx_moment_comments_post_created ON public.moment_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_owner_created ON public.focus_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_music_tracks_owner_created ON public.music_tracks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_music_messages_track_created ON public.music_messages(track_id, created_at ASC);

ALTER TABLE public.moment_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.moment_posts, public.moment_likes, public.moment_comments,
  public.focus_sessions, public.music_tracks, public.music_messages TO authenticated;
GRANT ALL ON public.moment_posts, public.moment_likes, public.moment_comments,
  public.focus_sessions, public.music_tracks, public.music_messages TO service_role;

DROP POLICY IF EXISTS "moment_posts_own" ON public.moment_posts;
CREATE POLICY "moment_posts_own" ON public.moment_posts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "moment_likes_own" ON public.moment_likes;
CREATE POLICY "moment_likes_own" ON public.moment_likes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.moment_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
    AND (char_id IS NULL OR EXISTS (SELECT 1 FROM public.ai_personas c WHERE c.id = char_id AND c.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "moment_comments_own" ON public.moment_comments;
CREATE POLICY "moment_comments_own" ON public.moment_comments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.moment_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
    AND (char_id IS NULL OR EXISTS (SELECT 1 FROM public.ai_personas c WHERE c.id = char_id AND c.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "focus_sessions_own" ON public.focus_sessions;
CREATE POLICY "focus_sessions_own" ON public.focus_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (char_id IS NULL OR EXISTS (
    SELECT 1 FROM public.ai_personas c WHERE c.id = char_id AND c.user_id = auth.uid()
  )));

DROP POLICY IF EXISTS "music_tracks_own" ON public.music_tracks;
CREATE POLICY "music_tracks_own" ON public.music_tracks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "music_messages_own" ON public.music_messages;
CREATE POLICY "music_messages_own" ON public.music_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.music_tracks t WHERE t.id = track_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.ai_personas c WHERE c.id = char_id AND c.user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trigger_moment_posts_updated_at ON public.moment_posts;
CREATE TRIGGER trigger_moment_posts_updated_at BEFORE UPDATE ON public.moment_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('moments', 'moments', false, 8388608, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('music', 'music', false, 26214400, ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
DECLARE bucket text;
BEGIN
  FOREACH bucket IN ARRAY ARRAY['moments', 'music'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || '_select_own');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || '_insert_own');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || '_delete_own');
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || '_select_own', bucket);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || '_insert_own', bucket);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || '_delete_own', bucket);
  END LOOP;
END $$;
