-- Preserve atomic re-rolls while allowing assistant sticker messages.
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
  item_type text;
  item_content text;
  item_payload jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_sessions s
    JOIN public.ai_personas p ON p.id = s.char_id
    WHERE s.id = p_session_id AND s.user_id = auth.uid()
      AND s.char_id = p_char_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized session or character';
  END IF;
  IF jsonb_typeof(p_messages) <> 'array' OR jsonb_array_length(p_messages) = 0 THEN
    RAISE EXCEPTION 'messages must be a non-empty array';
  END IF;

  DELETE FROM public.chat_messages
    WHERE session_id = p_session_id AND turn_id = p_turn_id AND role = 'assistant';

  FOR item IN SELECT * FROM jsonb_array_elements(p_messages)
  LOOP
    ordinal := ordinal + 1;
    IF jsonb_typeof(item) = 'string' THEN
      item_type := 'text';
      item_content := trim(item #>> '{}');
      item_payload := '{}'::jsonb;
    ELSE
      item_type := COALESCE(NULLIF(item ->> 'message_type', ''), 'text');
      item_content := trim(COALESCE(item ->> 'content', ''));
      item_payload := CASE
        WHEN jsonb_typeof(item -> 'payload') = 'object' THEN item -> 'payload'
        ELSE '{}'::jsonb
      END;
    END IF;
    IF item_type NOT IN ('text', 'sticker') THEN
      RAISE EXCEPTION 'unsupported assistant message type';
    END IF;
    IF item_type = 'text' AND item_content = '' THEN
      RAISE EXCEPTION 'assistant text message cannot be empty';
    END IF;
    IF item_type = 'sticker' AND NOT (
      COALESCE(item_payload ->> 'sticker_path', '') LIKE auth.uid()::text || '/stickers/%'
    ) THEN
      RAISE EXCEPTION 'invalid assistant sticker path';
    END IF;

    INSERT INTO public.chat_messages (
      session_id, user_id, role, content, message_type, payload,
      delivery_status, turn_id, message_order
    ) VALUES (
      p_session_id, auth.uid(), 'assistant', item_content, item_type, item_payload,
      'sent', p_turn_id, ordinal
    ) RETURNING * INTO saved;
    RETURN NEXT saved;
  END LOOP;
  UPDATE public.chat_sessions SET updated_at = now() WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_chat_turn(uuid, uuid, uuid, jsonb) TO authenticated;
