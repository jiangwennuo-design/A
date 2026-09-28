-- Additive shared library; character bindings live in existing chat_preferences.
BEGIN;
CREATE TABLE IF NOT EXISTS public.world_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  enabled boolean NOT NULL DEFAULT true,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(entries) = 'array' AND jsonb_array_length(entries) <= 5000),
  entry_count integer GENERATED ALWAYS AS (jsonb_array_length(entries)) STORED,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_books_owner_created ON public.world_books(user_id, created_at DESC);
ALTER TABLE public.world_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS world_books_own ON public.world_books;
CREATE POLICY world_books_own ON public.world_books FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_books TO authenticated;
GRANT ALL ON public.world_books TO service_role;
DROP TRIGGER IF EXISTS world_books_updated_at ON public.world_books;
CREATE TRIGGER world_books_updated_at BEFORE UPDATE ON public.world_books
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.unlink_deleted_world_book() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_personas p
  SET chat_preferences = jsonb_set(p.chat_preferences, '{worldBookIds}',
    COALESCE((SELECT jsonb_agg(item)
      FROM jsonb_array_elements(p.chat_preferences -> 'worldBookIds') item
      WHERE item <> to_jsonb(OLD.id::text)), '[]'::jsonb))
  WHERE p.user_id = OLD.user_id
    AND p.chat_preferences -> 'worldBookIds' @> jsonb_build_array(OLD.id::text);
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS world_books_unlink ON public.world_books;
CREATE TRIGGER world_books_unlink BEFORE DELETE ON public.world_books
FOR EACH ROW EXECUTE FUNCTION public.unlink_deleted_world_book();
COMMIT;
