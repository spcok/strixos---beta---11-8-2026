import { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  useCallback, 
  useMemo, 
  type ReactNode 
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { get, set, del } from 'idb-keyval';
import { supabase } from './supabase';
import { toast } from 'sonner';

// --- Configuration & Constants ---
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5-minute inactivity soft-lock
const SECURITY_HEARTBEAT_TTL_MS = 72 * 60 * 60 * 1000; // 72-hour offline GDPR limit
const HEARTBEAT_STORAGE_KEY = 'strixos_last_auth_heartbeat';
const HEARTBEAT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const AUTH_SESSION_KEY = 'strix-auth-session';
const LOCK_STORAGE_KEY = 'strix-is-locked';

export interface UserProfile {
  id: string;
  name: string | null;
  initials: string | null;
  pin: string | null;
  role: string | null;
  avatar_url?: string;
  phone?: string;
  emergency_contact_phone?: string;
  is_active?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isLocked: boolean;
  hasPermission: (permission: string | string[], showToastOnDenied?: boolean) => boolean;
  checkAccess: (allowedRoles: string[]) => boolean;
  lockSession: () => void;
  unlockSession: (pinCode: string) => boolean;
  logout: (isExpired?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ------------------------------------------------------------------
// 1. RBAC PERMISSIONS QUERY (Robust JSON/Array Normalization)
// ------------------------------------------------------------------
export const getPermissionsQueryOptions = (role?: string | null) => {
  const normalizedRole = role ? role.toUpperCase().trim() : 'ANONYMOUS';
  return queryOptions({
    queryKey: ['rbac_permissions', normalizedRole],
    queryFn: async () => {
      if (!role) return [];

      // Root bypass for top-tier management
      if (normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR') {
        return ['*'];
      }

      const { data, error } = await supabase
        .from('rbac_matrix')
        .select('permissions')
        .ilike('role', normalizedRole)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('[RBAC Matrix Query Notice]:', error.message);
      }

      if (!data?.permissions) return [];

      let perms: string[] = [];
      if (Array.isArray(data.permissions)) {
        perms = data.permissions;
      } else if (typeof data.permissions === 'string') {
        try {
          const parsed = JSON.parse(data.permissions);
          if (Array.isArray(parsed)) {
            perms = parsed;
          } else {
            perms = data.permissions.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
          }
        } catch {
          perms = data.permissions.split(',').map((s: string) => s.trim().replace(/^["'\[\]]|["'\[\]]$/g, ''));
        }
      }

      return perms.filter(Boolean);
    },
    enabled: Boolean(role),
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    meta: { persist: true },
  });
};

// ------------------------------------------------------------------
// 2. USER PROFILE QUERY
// ------------------------------------------------------------------
export const getUserProfileQueryOptions = (userId?: string | null) => queryOptions({
  queryKey: ['userProfile', userId],
  queryFn: async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, pin, role, avatar_url, phone, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[UserProfile Query Notice]:', error.message);
      const cached = await get('strix-user-profile');
      return (cached || null) as UserProfile | null;
    }

    if (data) {
      await set('strix-user-profile', data);
    }
    return data as UserProfile;
  },
  enabled: Boolean(userId),
  networkMode: 'offlineFirst',
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  meta: { persist: true },
});

// ------------------------------------------------------------------
// 3. AUTH PROVIDER COMPONENT
// ------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LOCK_STORAGE_KEY) === 'true') {
      setIsLocked(true);
    }
  }, []);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    localStorage.setItem(LOCK_STORAGE_KEY, 'true');
  }, []);

  const logout = useCallback(async (isExpired = false) => {
    await supabase.auth.signOut();
    await del(AUTH_SESSION_KEY);
    await del('strix-user-profile');
    localStorage.removeItem(HEARTBEAT_STORAGE_KEY);
    localStorage.removeItem(LOCK_STORAGE_KEY);
    
    queryClient.clear();
    setSession(null);
    setUser(null);
    setIsLocked(false);

    if (isExpired) {
      toast.error('Security session expired (72h offline limit reached). Logged out for data protection.');
    }
  }, [queryClient]);

  const evaluateSecurityHeartbeat = useCallback(() => {
    if (!user) return;
    if (navigator.onLine) {
      localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
    } else {
      const lastHeartbeatStr = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
      const lastHeartbeat = lastHeartbeatStr ? parseInt(lastHeartbeatStr, 10) : 0;
      if (Date.now() - lastHeartbeat > SECURITY_HEARTBEAT_TTL_MS) {
        logout(true);
      }
    }
  }, [user, logout]);

  // Auth Initialization & Realtime Subscription
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: nativeSession } } = await supabase.auth.getSession();
        let activeSession = nativeSession;
        
        if (!activeSession) {
          const cachedSession = await get(AUTH_SESSION_KEY);
          if (cachedSession) {
            await supabase.auth.setSession(cachedSession);
            activeSession = cachedSession;
          }
        }

        if (isMounted) {
          setSession(activeSession ?? null);
          setUser(activeSession?.user ?? null);
        }
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        if (isMounted) setIsSessionLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        await set(AUTH_SESSION_KEY, newSession);
        localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setIsLocked(false);
        await del(AUTH_SESSION_KEY);
        await del('strix-user-profile');
        localStorage.removeItem(HEARTBEAT_STORAGE_KEY);
        localStorage.removeItem(LOCK_STORAGE_KEY);
        queryClient.clear();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // 72-Hour Security Heartbeat
  useEffect(() => {
    if (!user) return; 
    
    const heartbeatInterval = setInterval(() => {
      evaluateSecurityHeartbeat();
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    evaluateSecurityHeartbeat();

    return () => clearInterval(heartbeatInterval);
  }, [evaluateSecurityHeartbeat, user]);

  // 5-Minute Inactivity Soft-Lock
  useEffect(() => {
    if (!session || isLocked) return;

    let timeoutId: NodeJS.Timeout;

    const resetIdleTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lockSession();
      }, IDLE_TIMEOUT_MS);
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetIdleTimer));
    resetIdleTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [session, isLocked, lockSession]);

  // Query Profile & RBAC Permissions
  const { data: profile, status: profileStatus } = useQuery(getUserProfileQueryOptions(user?.id));
  const { data: rawPermissions = [] } = useQuery(getPermissionsQueryOptions(profile?.role));

  const activePermissionsSet = useMemo(() => new Set<string>(rawPermissions), [rawPermissions]);

  // Permission Verification (Supports single key or array of keys)
  const hasPermission = useCallback((permission: string | string[], showToastOnDenied = false): boolean => {
    if (profileStatus === 'pending') return false; 
    if (!profile && !session) return false;

    const normalizedRole = (profile?.role || session?.user?.user_metadata?.role || '').toUpperCase().trim();
    const isRootRole = normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR';
    
    let allowed = isRootRole || activePermissionsSet.has('*');
    if (!allowed) {
      if (Array.isArray(permission)) {
        allowed = permission.some((p) => activePermissionsSet.has(p));
      } else {
        allowed = activePermissionsSet.has(permission);
      }
    }

    if (!allowed && showToastOnDenied) {
      toast.error('Unauthorized Access');
    }

    return allowed;
  }, [profile, session, profileStatus, activePermissionsSet]);

  const checkAccess = useCallback((allowedRoles: string[]): boolean => {
    if (!profile || isLocked) return false;
    const normalizedRole = profile.role?.toUpperCase().trim() || '';
    if (normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR') return true;
    return allowedRoles.map((r) => r.toUpperCase().trim()).includes(normalizedRole);
  }, [profile, isLocked]);

  const unlockSession = useCallback((pinCode: string) => {
    if (!profile?.pin || profile.pin.trim() === pinCode.trim()) {
      setIsLocked(false);
      localStorage.removeItem(LOCK_STORAGE_KEY);
      return true;
    }
    return false;
  }, [profile]);

  const isFullyLoading = isSessionLoading || (Boolean(user) && profileStatus === 'pending');

  const contextValue = useMemo(() => ({
    session,
    user,
    profile: profile || null,
    isLoading: isFullyLoading,
    isLocked,
    hasPermission,
    checkAccess,
    lockSession,
    unlockSession,
    logout: () => logout(false),
    signOut: () => logout(false),
  }), [session, user, profile, isFullyLoading, isLocked, hasPermission, checkAccess, lockSession, unlockSession, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthProvider;