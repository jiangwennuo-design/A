-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ DIARIES ============
CREATE TABLE IF NOT EXISTS public.diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  diary_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diaries TO authenticated;
GRANT ALL ON public.diaries TO service_role;

ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_diaries" ON public.diaries;
CREATE POLICY "select_own_diaries" ON public.diaries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_diaries" ON public.diaries;
CREATE POLICY "insert_own_diaries" ON public.diaries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_diaries" ON public.diaries;
CREATE POLICY "update_own_diaries" ON public.diaries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_diaries" ON public.diaries;
CREATE POLICY "delete_own_diaries" ON public.diaries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_diaries_user_created ON public.diaries (user_id, created_at DESC);

-- ============ AI PERSONAS ============
CREATE TABLE IF NOT EXISTS public.ai_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '笔友',
  description text NOT NULL DEFAULT '',
  personality text NOT NULL DEFAULT '',
  speaking_style text NOT NULL DEFAULT '',
  interests text NOT NULL DEFAULT '',
  dislikes text NOT NULL DEFAULT '',
  relationship text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT '',
  additional_prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_personas TO authenticated;
GRANT ALL ON public.ai_personas TO service_role;

ALTER TABLE public.ai_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_personas" ON public.ai_personas;
CREATE POLICY "select_own_personas" ON public.ai_personas FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_personas" ON public.ai_personas;
CREATE POLICY "insert_own_personas" ON public.ai_personas FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_personas" ON public.ai_personas;
CREATE POLICY "update_own_personas" ON public.ai_personas FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_personas" ON public.ai_personas;
CREATE POLICY "delete_own_personas" ON public.ai_personas FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_personas_user ON public.ai_personas (user_id);

-- ============ CHAT SESSIONS ============
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  diary_context_mode text NOT NULL DEFAULT 'none',
  context_diary_id uuid REFERENCES public.diaries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON public.chat_sessions;
CREATE POLICY "select_own_sessions" ON public.chat_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON public.chat_sessions;
CREATE POLICY "insert_own_sessions" ON public.chat_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON public.chat_sessions;
CREATE POLICY "update_own_sessions" ON public.chat_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON public.chat_sessions;
CREATE POLICY "delete_own_sessions" ON public.chat_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.chat_sessions (user_id, updated_at DESC);

-- ============ CHAT MESSAGES ============
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON public.chat_messages;
CREATE POLICY "select_own_messages" ON public.chat_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_messages" ON public.chat_messages;
CREATE POLICY "insert_own_messages" ON public.chat_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_messages" ON public.chat_messages;
CREATE POLICY "delete_own_messages" ON public.chat_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_messages_session ON public.chat_messages (session_id, created_at ASC);

-- ============ TRIGGER: updated_at ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_diaries_updated_at ON public.diaries;
CREATE TRIGGER trigger_diaries_updated_at BEFORE UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_personas_updated_at ON public.ai_personas;
CREATE TRIGGER trigger_personas_updated_at BEFORE UPDATE ON public.ai_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER trigger_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();