-- One private, user-controlled switch for the hidden planning stage used by
-- both instant chat and diary letters. Existing users keep the new behavior on.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inner_life_enabled boolean NOT NULL DEFAULT true;
