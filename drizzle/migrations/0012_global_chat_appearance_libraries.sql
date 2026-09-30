-- Additive account-level libraries; old character CSS/presets remain available for migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_appearance_libraries jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.save_chat_appearance_library(p_theme text, p_library jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_theme NOT IN ('chatBubble', 'chatChrome') THEN
    RAISE EXCEPTION 'Invalid appearance library scope';
  END IF;
  IF jsonb_typeof(p_library->'presets') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid appearance library';
  END IF;
  UPDATE public.profiles
    SET chat_appearance_libraries = jsonb_set(chat_appearance_libraries, ARRAY[p_theme], p_library, true)
    WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_chat_appearance_library(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_chat_appearance_library(text, jsonb) TO authenticated;
