CREATE TABLE public.ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  encrypted_api_key TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  temperature NUMERIC NOT NULL DEFAULT 0.8,
  max_tokens INTEGER,
  custom_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_test_status TEXT NOT NULL DEFAULT 'untested',
  last_test_message TEXT,
  last_test_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Column-level grants: the browser may never read encrypted_api_key.
GRANT SELECT (id, user_id, name, base_url, model_name, temperature, max_tokens,
  custom_headers, enabled, is_default, last_test_status, last_test_message,
  last_test_at, created_at, updated_at) ON public.ai_configs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_configs TO authenticated;
GRANT ALL ON public.ai_configs TO service_role;

ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ai configs"
  ON public.ai_configs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ai configs"
  ON public.ai_configs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ai configs"
  ON public.ai_configs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ai configs"
  ON public.ai_configs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX ai_configs_user_id_idx ON public.ai_configs (user_id);
CREATE UNIQUE INDEX ai_configs_one_default_per_user ON public.ai_configs (user_id) WHERE is_default;

CREATE TRIGGER ai_configs_set_updated_at
  BEFORE UPDATE ON public.ai_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();