-- Per-character chat thinking. The existing profile switch remains for diary letters.
ALTER TABLE public.ai_personas
  ADD COLUMN IF NOT EXISTS chat_thinking_mode text,
  ADD COLUMN IF NOT EXISTS show_chat_thinking boolean NOT NULL DEFAULT false;

-- Preserve each existing user's prior global chat choice exactly once.
UPDATE public.ai_personas AS persona
SET chat_thinking_mode = CASE
  WHEN profile.inner_life_enabled = false THEN 'off'
  ELSE 'native'
END
FROM public.profiles AS profile
WHERE persona.user_id = profile.id AND persona.chat_thinking_mode IS NULL;

UPDATE public.ai_personas
SET chat_thinking_mode = 'native'
WHERE chat_thinking_mode IS NULL;

ALTER TABLE public.ai_personas
  ALTER COLUMN chat_thinking_mode SET DEFAULT 'native',
  ALTER COLUMN chat_thinking_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_personas_chat_thinking_mode_check'
      AND conrelid = 'public.ai_personas'::regclass
  ) THEN
    ALTER TABLE public.ai_personas
      ADD CONSTRAINT ai_personas_chat_thinking_mode_check
      CHECK (chat_thinking_mode IN ('off', 'native', 'nuojiji'));
  END IF;
END $$;
