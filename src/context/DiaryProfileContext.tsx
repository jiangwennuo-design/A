/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { initialDiaryProfile, readDiaryProfile, type DiaryProfile } from "@/lib/diary-profile";

interface DiaryProfileValue {
  diaryProfile: DiaryProfile | null;
  avatarUrl: string;
  coverUrl: string;
  saveDiaryProfile: (next: DiaryProfile) => Promise<void>;
}

const Context = createContext<DiaryProfileValue | null>(null);

export function DiaryProfileProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [diaryProfile, setDiaryProfile] = useState<DiaryProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  useEffect(() => {
    if (!user || !profile) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      const account = !error && data.user ? data.user : user;
      const stored = readDiaryProfile(account.user_metadata?.["diary_profile"]);
      const next =
        stored ?? initialDiaryProfile(user.id, profile?.display_name || "我", user.created_at);
      if (!stored) {
        await supabase.auth.updateUser({ data: { diary_profile: next } });
      }
      if (active) setDiaryProfile(next);
    })();
    return () => {
      active = false;
    };
  }, [user, profile]);

  useEffect(() => {
    let active = true;
    setAvatarUrl("");
    setCoverUrl("");
    if (diaryProfile?.avatarPath) {
      void resolveSignedMediaUrl("moments", diaryProfile.avatarPath).then((url) => {
        if (active) setAvatarUrl(url);
      });
    }
    if (diaryProfile?.coverPath) {
      void resolveSignedMediaUrl("moments", diaryProfile.coverPath).then((url) => {
        if (active) setCoverUrl(url);
      });
    }
    return () => {
      active = false;
    };
  }, [diaryProfile?.avatarPath, diaryProfile?.coverPath]);

  async function saveDiaryProfile(next: DiaryProfile) {
    const { error } = await supabase.auth.updateUser({ data: { diary_profile: next } });
    if (error) throw new Error("资料保存失败，请稍后重试。");
    setDiaryProfile(next);
  }

  return (
    <Context.Provider value={{ diaryProfile, avatarUrl, coverUrl, saveDiaryProfile }}>
      {children}
    </Context.Provider>
  );
}

export function useDiaryProfile() {
  const context = useContext(Context);
  if (!context) throw new Error("DiaryProfileProvider is missing");
  return context;
}
