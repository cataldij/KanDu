import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Helper to validate user has required fields
    const isValidUser = (user: User | null | undefined): user is User => {
      return !!(user && user.email && user.id);
    };

    // Force clear all auth storage - doesn't rely on Supabase at all
    const forceCleanStorage = async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const keysToRemove = allKeys.filter(key =>
          key.includes('supabase') ||
          key.includes('sb-') ||
          key.includes('auth') ||
          key.includes('session') ||
          key.includes('token')
        );
        if (keysToRemove.length > 0) {
          await AsyncStorage.multiRemove(keysToRemove);
          console.log('[Auth] Force cleared storage keys:', keysToRemove);
        }
      } catch (e) {
        console.log('[Auth] Error in force clean:', e);
      }
    };

    // Get initial session and verify with server
    const initializeAuth = async () => {
      try {
        // First get local session
        const { data: { session: localSession } } = await supabase.auth.getSession();
        console.log('[Auth] Local session:', localSession ? 'exists' : 'none');
        console.log('[Auth] Local user email:', localSession?.user?.email || 'NO EMAIL');
        console.log('[Auth] Local user id:', localSession?.user?.id || 'NO ID');

        // If we have a session but user data is incomplete, it's corrupt
        if (localSession && (!localSession.user?.email || !localSession.user?.id)) {
          console.log('[Auth] Corrupt local session detected - forcing clear');
          await forceCleanStorage();
          try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        if (localSession) {
          // Verify the session is actually valid with the server
          const { data: { user: serverUser }, error } = await supabase.auth.getUser();
          console.log('[Auth] Server user:', serverUser ? 'valid' : 'invalid');
          console.log('[Auth] Server user email:', serverUser?.email || 'NO EMAIL');

          if (error || !serverUser || !serverUser.email) {
            // Session is invalid or user doesn't exist on server
            console.log('[Auth] Invalid server session, clearing. Error:', error?.message);
            await forceCleanStorage();
            try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
            setSession(null);
            setUser(null);
          } else {
            // Valid session with verified user
            setSession(localSession);
            setUser(serverUser);
          }
        } else {
          // No session
          setSession(null);
          setUser(null);
        }
      } catch (e) {
        console.log('[Auth] Error during init:', e);
        // On any error, force clear everything
        await forceCleanStorage();
        try { await supabase.auth.signOut(); } catch (err) { /* ignore */ }
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event, session ? 'has session' : 'no session');

      // If signing out, just clear state
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (session && !isValidUser(session.user)) {
        // Invalid session - clear it (but don't call signOut to avoid loop)
        console.log('[Auth] Invalid session on state change, clearing state...');
        await forceCleanStorage();
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (error) throw error;

      // Profile creation is optional - will be added when profiles table exists
      // The user metadata (full_name) is stored in auth.users already

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    console.log('[Auth] Sign out requested');

    // IMMEDIATELY clear React state first
    setSession(null);
    setUser(null);
    console.log('[Auth] React state cleared');

    try {
      // Clear ALL potentially auth-related keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      console.log('[Auth] All AsyncStorage keys:', allKeys);

      const keysToRemove = allKeys.filter(key =>
        key.includes('supabase') ||
        key.includes('sb-') ||
        key.includes('auth') ||
        key.includes('session') ||
        key.includes('token') ||
        key.includes('user')
      );

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log('[Auth] Removed AsyncStorage keys:', keysToRemove);
      }

      // Then try Supabase signOut (may fail if credentials are bad)
      try {
        await supabase.auth.signOut();
        console.log('[Auth] Supabase signOut completed');
      } catch (supabaseError) {
        console.log('[Auth] Supabase signOut failed (ignored):', supabaseError);
      }
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    }

    console.log('[Auth] Sign out complete');
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'kandu://auth/callback',
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('Google sign in error:', error);
      return;
    }

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        'kandu://auth/callback'
      );

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const params = new URLSearchParams(url.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
