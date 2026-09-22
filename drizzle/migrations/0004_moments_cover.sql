-- A private, user-owned cover image for Moments. The file itself is stored in
-- the existing `moments` bucket under the user's RLS-protected folder.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS moment_cover_url text;

