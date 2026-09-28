-- Additive: existing characters and messages remain intact.
BEGIN;
ALTER TABLE public.ai_personas ADD COLUMN IF NOT EXISTS chat_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.character_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  char_id uuid NOT NULL REFERENCES public.ai_personas(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_memories_owner_char ON public.character_memories(user_id, char_id, updated_at DESC);
ALTER TABLE public.character_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS character_memories_own ON public.character_memories;
CREATE POLICY character_memories_own ON public.character_memories FOR ALL TO authenticated
USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.ai_personas p WHERE p.id = character_memories.char_id AND p.user_id = auth.uid()))
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.ai_personas p WHERE p.id = character_memories.char_id AND p.user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_memories TO authenticated;
DROP TRIGGER IF EXISTS character_memories_updated_at ON public.character_memories;
CREATE TRIGGER character_memories_updated_at BEFORE UPDATE ON public.character_memories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMIT;
