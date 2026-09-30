-- Independent wallpaper storage prevents any theme/profile editor from overwriting it.
ALTER TABLE public.ai_personas ADD COLUMN IF NOT EXISTS chat_wallpaper jsonb;

-- Preserve existing wallpaper paths/URLs without validating unrelated legacy settings.
UPDATE public.ai_personas
SET chat_wallpaper = jsonb_build_object(
  'wallpaperPath', chat_preferences->'wallpaperPath',
  'wallpaperUrl', chat_preferences->'wallpaperUrl',
  'updatedAt', updated_at
)
WHERE chat_wallpaper IS NULL
  AND (chat_preferences ? 'wallpaperPath' OR chat_preferences ? 'wallpaperUrl');

CREATE OR REPLACE FUNCTION public.save_character_wallpaper(p_character_id uuid, p_wallpaper jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE saved public.ai_personas; wallpaper jsonb;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_wallpaper) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid wallpaper';
  END IF;
  IF COALESCE(jsonb_typeof(p_wallpaper->'wallpaperPath'), 'null') NOT IN ('string', 'null')
    OR COALESCE(jsonb_typeof(p_wallpaper->'wallpaperUrl'), 'null') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Invalid wallpaper fields';
  END IF;
  wallpaper := jsonb_build_object('wallpaperPath', p_wallpaper->'wallpaperPath',
    'wallpaperUrl', p_wallpaper->'wallpaperUrl', 'updatedAt', clock_timestamp());
  UPDATE public.ai_personas SET chat_wallpaper = wallpaper,
    chat_preferences = COALESCE(chat_preferences, '{}'::jsonb) ||
      jsonb_build_object('wallpaperPath', wallpaper->'wallpaperPath', 'wallpaperUrl', wallpaper->'wallpaperUrl')
    WHERE id = p_character_id AND user_id = auth.uid() RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Character not found'; END IF;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.save_character_wallpaper(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_character_wallpaper(uuid, jsonb) TO authenticated;
