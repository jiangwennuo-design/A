-- Sticker manifest import metadata. Existing stickers remain valid and ungrouped.

CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sticker_packs_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

ALTER TABLE public.chat_stickers
  ADD COLUMN IF NOT EXISTS pack_id uuid REFERENCES public.sticker_packs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '表情',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_sticker_packs_owner_created
  ON public.sticker_packs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_stickers_pack_created
  ON public.chat_stickers(pack_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_stickers_owner_hash
  ON public.chat_stickers(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sticker_packs TO authenticated;
GRANT ALL ON public.sticker_packs TO service_role;

DROP POLICY IF EXISTS "sticker_packs_select_own" ON public.sticker_packs;
DROP POLICY IF EXISTS "sticker_packs_insert_own" ON public.sticker_packs;
DROP POLICY IF EXISTS "sticker_packs_update_own" ON public.sticker_packs;
DROP POLICY IF EXISTS "sticker_packs_delete_own" ON public.sticker_packs;
CREATE POLICY "sticker_packs_select_own" ON public.sticker_packs FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "sticker_packs_insert_own" ON public.sticker_packs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "sticker_packs_update_own" ON public.sticker_packs FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "sticker_packs_delete_own" ON public.sticker_packs FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chat_stickers_update_own" ON public.chat_stickers;
CREATE POLICY "chat_stickers_update_own" ON public.chat_stickers FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

