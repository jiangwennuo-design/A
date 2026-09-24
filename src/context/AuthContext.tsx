import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let profileGeneration = 0;
    let loadedUserId = "";

    async function loadProfile(userId: string, email: string, generation: number) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Failed to load profile:", error);
      }

      if (!data) {
        // 原版用 auth 触发器自动建资料，这里在首次登录时补建。
        const { data: created } = await supabase
          .from("profiles")
          .insert({ id: userId, email, display_name: email })
          .select("*")
          .maybeSingle();
        if (active && generation === profileGeneration)
          setProfile((created as Profile | null) ?? null);
        return;
      }

      if (active && generation === profileGeneration) setProfile(data as Profile);
    }

    function applySession(nextSession: Session | null) {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
      const nextUser = nextSession?.user;
      if (!nextUser) {
        loadedUserId = "";
        profileGeneration += 1;
        setProfile(null);
        return;
      }
      if (loadedUserId === nextUser.id) return;
      loadedUserId = nextUser.id;
      const generation = ++profileGeneration;
      void loadProfile(nextUser.id, nextUser.email ?? "", generation);
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Failed to restore session:", error);
      }
      applySession(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [session?.user]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signOut,
      refreshProfile,
    }),
    [loading, profile, refreshProfile, session, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
