-- Communications and focus upgrade. All changes are additive so legacy text
-- messages, existing focus history, and user data remain valid.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_message_type_check'
  ) THEN
    ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'sticker', 'transfer', 'call'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_delivery_status_check'
  ) THEN
    ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_delivery_status_check
      CHECK (delivery_status IN ('sent', 'failed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.chat_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_stickers_owner_created
  ON public.chat_stickers(user_id, created_at DESC);

ALTER TABLE public.chat_stickers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_stickers TO authenticated;
GRANT ALL ON public.chat_stickers TO service_role;

DROP POLICY IF EXISTS "chat_stickers_own" ON public.chat_stickers;
DROP POLICY IF EXISTS "chat_stickers_select_own" ON public.chat_stickers;
DROP POLICY IF EXISTS "chat_stickers_insert_own" ON public.chat_stickers;
DROP POLICY IF EXISTS "chat_stickers_delete_own" ON public.chat_stickers;
CREATE POLICY "chat_stickers_select_own" ON public.chat_stickers FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "chat_stickers_insert_own" ON public.chat_stickers FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "chat_stickers_delete_own" ON public.chat_stickers FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 8388608, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat_media_select_own" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_delete_own" ON storage.objects;
CREATE POLICY "chat_media_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "chat_media_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY "chat_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = (select auth.uid()::text));

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quote text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_end_at timestamptz;
