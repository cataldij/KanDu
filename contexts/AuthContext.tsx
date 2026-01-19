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
      return !!(user && user.email);
    };

    // Get initial session and verify with server
    const initializeAuth = async () => {
      try {
        // First get local session
        const { data: { session: localSession } } = await supabase.auth.getSession();
        console.log('[Auth] Local session:', localSession ? 'exists' : 'none');
        console.log('[Auth] Local user email:', localSession?.user?.email || 'NO EMAIL');

        if (localSession) {
          // Verify the session is actually valid with the server
          const { data: { user: serverUser }, error } = await supabase.auth.getUser();
          console.log('[Auth] Server user:', serverUser ? 'valid' : 'invalid');
          console.log('[Auth] Server user email:', serverUser?.email || 'NO EMAIL');

          if (error || !serverUser || !serverUser.email) {
            // Session is invalid or user doesn't exist on server
            console.log('[Auth] Invalid session, clearing. Error:', error?.message);

            // Aggressively clear ALL Supabase/auth keys from AsyncStorage
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const keysToRemove = allKeys.filter(key =>
                key.includes('supabase') ||
                key.includes('sb-') ||
                key.includes('auth') ||
                key.includes('session')
              );
              if (keysToRemove.length > 0) {
                await AsyncStorage.multiRemove(keysToRemove);
                console.log('[Auth] Cleared corrupt storage keys:', keysToRemove);
              }
            } catch (clearError) {
              console.log('[Auth] Error clearing storage:', clearError);
            }

            await supabase.auth.signOut();
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
        // On any error, clear session to be safe
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session && !isValidUser(session.user)) {
        // Invalid session - clear it
        console.log('[Auth] Invalid session on state change, clearing...');
        await supabase.auth.signOut();
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
    try {
      // First clear all Supabase-related keys from AsyncStorage directly
      const allKeys = await AsyncStorage.getAllKeys();
      const supabaseKeys = allKeys.filter(key =>
        key.includes('supabase') ||
        key.includes('sb-') ||
        key.includes('auth')
      );
      if (supabaseKeys.length > 0) {
        await AsyncStorage.multiRemove(supabaseKeys);
        console.log('[Auth] Cleared AsyncStorage keys:', supabaseKeys);
      }

      // Then call Supabase signOut
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Always force clear local session state
      setSession(null);
      setUser(null);
    }
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
