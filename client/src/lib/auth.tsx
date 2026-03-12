import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { apiRequest } from "./queryClient";
import { isSupabaseAuthEnabled, supabase } from "./supabase";

interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  emailVerified?: boolean;
  marketingOptIn?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  formSessionId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUserState: (user: AuthUser | null, formSessionId: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [formSessionId, setFormSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setUserState = useCallback((nextUser: AuthUser | null, nextFormSessionId: string | null) => {
    setUser(nextUser);
    setFormSessionId(nextFormSessionId);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSupabaseAuthEnabled && supabase) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setUserState(null, null);
          return;
        }
      }
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        headers: await (async (): Promise<Record<string, string>> => {
          const session = await supabase?.auth.getSession();
          const token = session?.data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        })(),
      });
      if (!res.ok) {
        setUserState(null, null);
        return;
      }
      const data = await res.json();
      setUserState(data.user, data.formSessionId);
    } finally {
      setIsLoading(false);
    }
  }, [setUserState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      if (isSupabaseAuthEnabled && supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refresh();
        return;
      }
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      setUserState(data.user, data.formSessionId);
    } finally {
      setIsLoading(false);
    }
  }, [refresh, setUserState]);

  const signup = useCallback(async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    try {
      if (isSupabaseAuthEnabled && supabase) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        await refresh();
        return;
      }
      const res = await apiRequest("POST", "/api/auth/signup", { email, password, fullName });
      const data = await res.json();
      setUserState(data.user, data.formSessionId);
    } finally {
      setIsLoading(false);
    }
  }, [refresh, setUserState]);

  const loginDemo = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSupabaseAuthEnabled) {
        throw new Error("Demo mode is disabled when Supabase Auth is enabled.");
      }
      const res = await apiRequest("POST", "/api/auth/demo");
      const data = await res.json();
      setUserState(data.user, data.formSessionId);
    } finally {
      setIsLoading(false);
    }
  }, [setUserState]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSupabaseAuthEnabled && supabase) {
        await supabase.auth.signOut();
      }
      await apiRequest("POST", "/api/auth/logout");
      setUserState(null, null);
    } finally {
      setIsLoading(false);
    }
  }, [setUserState]);

  useEffect(() => {
    if (!isSupabaseAuthEnabled || !supabase) return;
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.subscription.unsubscribe();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, formSessionId, isLoading, login, signup, loginDemo, logout, refresh, setUserState }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
