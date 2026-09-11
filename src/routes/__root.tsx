import React, { useState, useEffect } from 'react';
import { createRootRouteWithContext, Outlet, useLocation, Navigate } from '@tanstack/react-router';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { LoginScreen } from '../components/auth/LoginScreen';
import { supabase } from '../lib/supabase';
import { toast, Toaster } from 'sonner';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <AuthProvider>
      <AuthGuard />
      <Toaster position="top-center" richColors theme="light" />
    </AuthProvider>
  ),
});

// ------------------------------------------------------------------
// GLOBAL REALTIME MULTIPLEXER (ENTERPRISE STANDARD)
// ------------------------------------------------------------------
function GlobalSyncEngine() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return; 

    console.log('[Sync Engine] Initializing Global Realtime Multiplexer...');

    const channel = supabase.channel('strix-global-multiplexer')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const table = payload.table;
        
        // Strict routing of database mutations to local cache invalidations
        const tableToKeyMap: Record<string, string[]> = {
          'daily_logs': ['daily_logs', 'weekly_compliance_audit'],
          'animals': ['animals'],
          'users': ['internal_users', 'userProfile'],
          'rbac_matrix': ['rbac_matrix', 'rbac_permissions'],
          'role_permissions': ['role_permissions'],
          'external_directory': ['external_directory'],
          'safety_drills': ['safety_drills'],
          'shifts': ['shifts_data'],
          'timesheets': ['timesheets', 'my_active_shift', 'active_timesheets_rollcall'],
          'isolation_logs': ['isolation_logs_complete'],
          'vouchers': ['vouchers', 'vouchers_list', 'all_vouchers_directory'],
          'events_calendar': ['events_ledger_management', 'operational_calendar'],
          'event_commercials': ['events_ledger_management'],
          'event_staff_allocations': ['events_ledger_management'],
          'events_animals': ['events_ledger_management'],
          'feed_logs': ['feeds', 'feed_logs', 'weekly_compliance_audit', 'husbandry_logs_feed'],
          'weight_logs': ['weights', 'weight_logs', 'weekly_compliance_audit', 'husbandry_logs_feed'],
          'feeding_schedules': ['feeds', 'feeding_schedules', 'weekly_compliance_audit', 'husbandry_logs_feed'],
          'temperature_logs': ['temperatures', 'temperature_logs', 'weekly_compliance_audit'],
          'mist_logs': ['mist_logs', 'weekly_compliance_audit']
        };

        const keysToInvalidate = tableToKeyMap[table];
        if (keysToInvalidate) {
          keysToInvalidate.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });
        }
      })
      .subscribe();

    return () => {
      console.log('[Sync Engine] Terminating Global Multiplexer...');
      supabase.removeChannel(channel);
    };
  }, [queryClient, session]);

  return null;
}

// ------------------------------------------------------------------
// ROUTE GATEKEEPER & ACCESS DEFLECTOR (REACT 19 OPTIMIZED)
// ------------------------------------------------------------------
function RouteGatekeeper({ children }: { children: React.ReactNode }) {
  const { hasPermission, profile, isLocked, isLoading } = useAuth();
  const location = useLocation();

  const path = location.pathname;
  
  // Sorted longest-prefix matching to prioritize granular sub-routes (/logistics/events over /logistics)
  const routePermissions: Record<string, string | string[]> = {
    '/husbandry/import': 'husbandry:write',
    '/clinical': 'clinical:read',
    '/logistics/events': 'events:manage',
    '/logistics/calendar': 'events:manage',
    '/logistics/vouchers': ['vouchers:read', 'vouchers:scan', 'vouchers:manage', 'logistics:read'],
    '/logistics/internal-movements': ['transfers:read', 'logistics:read'],
    '/logistics/external-transfers': ['transfers:read', 'logistics:read'],
    '/safety': 'safety:read', 
    '/staff/rota': ['rota:view', 'hr:read'],
    '/staff/shifts': ['shifts:manage', 'timesheet:self'],
    '/staff/leave': ['hr:read', 'timesheet:self'],
    '/staff/timesheets': ['timesheet:self', 'hr:read'],
    '/staff/missing-records': 'timesheet:self',
    '/settings/rbac': 'admin:settings',
    '/settings/directory': 'admin:users',
  };

  const matchedPerms = Object.entries(routePermissions)
    .sort(([a], [b]) => b.length - a.length)
    .find(([routePrefix]) => path.startsWith(routePrefix))?.[1];

  const hasAccess = matchedPerms
    ? Array.isArray(matchedPerms)
      ? matchedPerms.some((perm) => hasPermission(perm))
      : hasPermission(matchedPerms)
    : true;

  const isDenied = !isLoading && profile && !isLocked && !hasAccess;

  useEffect(() => {
    if (isDenied) {
      console.warn(`[Route Gatekeeper] Access denied for path: ${path}. Required:`, matchedPerms);
      toast.error('Unauthorized Access: You do not have permission to view this module.');
    }
  }, [isDenied, path, matchedPerms]);

  if (isDenied) {
    return <Navigate to="/" replace={true} />;
  }

  return <>{children}</>;
}

// ------------------------------------------------------------------
// LAYOUT GATEKEEPER WITH UI SHELL
// ------------------------------------------------------------------
function AuthGuard() {
  const { session, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center">
        <div className="animate-pulse text-emerald-500 font-black tracking-widest uppercase">
          Initializing Engine...
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased relative overflow-hidden">
      <GlobalSyncEngine />
      <Sidebar isOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 overflow-auto p-6 relative">
          <RouteGatekeeper>
            <Outlet />
          </RouteGatekeeper>
        </main>
      </div>
    </div>
  );
}

export default Route;