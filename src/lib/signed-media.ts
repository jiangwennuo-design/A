import { supabase } from "@/integrations/supabase/client";

const signedMedia = new Map<string, { expires: number; promise: Promise<string> }>();

/** Resolve private storage media once and share both in-flight and recent signed URLs. */
export function resolveSignedMediaUrl(bucket: string, path: string, expiresIn = 3_600) {
  if (!path) return Promise.resolve("");
  const key = `${bucket}:${path}`;
  const cached = signedMedia.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;

  const promise = supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
    .then(({ data }) => {
      if (!data?.signedUrl) signedMedia.delete(key);
      return data?.signedUrl ?? "";
    })
    .catch(() => {
      signedMedia.delete(key);
      return "";
    });

  if (signedMedia.size >= 200) signedMedia.delete(signedMedia.keys().next().value!);
  signedMedia.set(key, {
    expires: Date.now() + Math.max(60, expiresIn - 900) * 1_000,
    promise,
  });
  return promise;
}
