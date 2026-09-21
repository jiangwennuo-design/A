-- Batch 1 + 2: keep existing data and extend it for user profiles, multiple
-- penpals, grouped chat replies, diary letters, and per-user wallpaper.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'non_binary')),
  ADD COLUMN IF NOT EXISTS persona_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signature text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wallpaper_url text,
  ADD COLUMN IF NOT EXISTS wallpaper_blur integer NOT NULL DEFAULT 0 CHECK (wallpaper_blur BETWEEN 0 AND 24),
  ADD COLUMN IF NOT EXISTS wallpaper_opacity numeric NOT NULL DEFAULT 0.18 CHECK (wallpaper_opacity BETWEEN 0 AND 0.75),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ai_personas
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'non_binary')),
  ADD COLUMN IF NOT EXISTS minimum_messages integer NOT NULL DEFAULT 1 CHECK (minimum_messages >= 1),
  ADD COLUMN IF NOT EXISTS maximum_messages integer NOT NULL DEFAULT 1 CHECK (maximum_messages >= minimum_messages);

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS char_id uuid REFERENCES public.ai_personas(id) ON DELETE SET NULL;

-- Compatibility backfill: legacy sessions are attached to that user's earliest
-- existing persona, only when a persona exists. Sessions without an old persona
-- remain usable and require choosing a penpal before new AI messages are sent.
UPDATE public.chat_sessions s
SET char_id = p.id
FROM LATERAL (
  SELECT id FROM public.ai_personas p
  WHERE p.user_id = s.user_id
  ORDER BY p.created_at ASC
  LIMIT 1
) p
WHERE s.char_id IS NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS turn_id uuid,
  ADD COLUMN IF NOT EXISTS message_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.diary_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  diary_id uuid NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  char_id uuid NOT NULL REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_char_updated ON public.chat_sessions (user_id, char_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_turn_order ON public.chat_messages (session_id, turn_id, message_order, created_at);
CREATE INDEX IF NOT EXISTS idx_diary_replies_owner ON public.diary_replies (user_id, diary_id, char_id, created_at DESC);

DROP POLICY IF EXISTS "select_own_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "insert_own_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "update_own_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "delete_own_messages" ON public.chat_messages;

CREATE POLICY "select_own_messages" ON public.chat_messages FOR SELECT TO authenticated
USING (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
      AND (s.char_id IS NULL OR EXISTS (
        SELECT 1 FROM public.ai_personas p WHERE p.id = s.char_id AND p.user_id = auth.uid()
      ))
  )
);
CREATE POLICY "insert_own_messages" ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()
      AND (s.char_id IS NULL OR EXISTS (
        SELECT 1 FROM public.ai_personas p WHERE p.id = s.char_id AND p.user_id = auth.uid()
      ))
  )
);
CREATE POLICY "update_own_messages" ON public.chat_messages FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()))
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()));
CREATE POLICY "delete_own_messages" ON public.chat_messages FOR DELETE TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = chat_messages.session_id AND s.user_id = auth.uid()));

-- Re-roll replacement is a single transaction. The function validates that the
-- session and its selected penpal belong to the caller before it touches data.
CREATE OR REPLACE FUNCTION public.replace_chat_turn(
  p_session_id uuid,
  p_char_id uuid,
  p_turn_id uuid,
  p_messages jsonb
) RETURNS SETOF public.chat_messages
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  item jsonb;
  ordinal integer := 0;
  saved public.chat_messages%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_sessions s
    JOIN public.ai_personas p ON p.id = s.char_id
    WHERE s.id = p_session_id AND s.user_id = auth.uid() AND s.char_id = p_char_id AND p.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'unauthorized session or penpal'; END IF;
  IF jsonb_typeof(p_messages) <> 'array' OR jsonb_array_length(p_messages) = 0 THEN
    RAISE EXCEPTION 'messages must be a non-empty array';
  END IF;
  DELETE FROM public.chat_messages WHERE session_id = p_session_id AND turn_id = p_turn_id AND role = 'assistant';
  FOR item IN SELECT * FROM jsonb_array_elements(p_messages)
  LOOP
    ordinal := ordinal + 1;
    INSERT INTO public.chat_messages (session_id, user_id, role, content, turn_id, message_order)
    VALUES (p_session_id, auth.uid(), 'assistant', trim(item #>> '{}'), p_turn_id, ordinal)
    RETURNING * INTO saved;
    RETURN NEXT saved;
  END LOOP;
  UPDATE public.chat_sessions SET updated_at = now() WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.replace_chat_turn(uuid, uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_current_chat(p_session_id uuid, p_char_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_sessions s JOIN public.ai_personas p ON p.id = s.char_id
    WHERE s.id = p_session_id AND s.user_id = auth.uid() AND s.char_id = p_char_id AND p.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'unauthorized session or penpal'; END IF;
  DELETE FROM public.chat_messages WHERE session_id = p_session_id;
  UPDATE public.chat_sessions SET updated_at = now() WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_current_chat(uuid, uuid) TO authenticated;

ALTER TABLE public.diary_replies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_replies TO authenticated;
GRANT ALL ON public.diary_replies TO service_role;
CREATE POLICY "select_own_diary_replies" ON public.diary_replies FOR SELECT TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.ai_personas p WHERE p.id = char_id AND p.user_id = auth.uid()));
CREATE POLICY "insert_own_diary_replies" ON public.diary_replies FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.ai_personas p WHERE p.id = char_id AND p.user_id = auth.uid()));
CREATE POLICY "update_own_diary_replies" ON public.diary_replies FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_diary_replies" ON public.diary_replies FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- User-owned wallpaper files. A user can access only the files inside their
-- own prefix: wallpapers/<auth.uid()>/... .
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wallpapers', 'wallpapers', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "wallpapers_select_own" ON storage.objects;
DROP POLICY IF EXISTS "wallpapers_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "wallpapers_update_own" ON storage.objects;
DROP POLICY IF EXISTS "wallpapers_delete_own" ON storage.objects;
CREATE POLICY "wallpapers_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wallpapers_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wallpapers_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "wallpapers_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_messages_updated_at ON public.chat_messages;
CREATE TRIGGER trigger_messages_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_diary_replies_updated_at ON public.diary_replies;
CREATE TRIGGER trigger_diary_replies_updated_at BEFORE UPDATE ON public.diary_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
