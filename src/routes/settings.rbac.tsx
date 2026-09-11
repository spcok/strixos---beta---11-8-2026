import { useState, useMemo, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { 
  ShieldCheck, Save, Loader2, Lock, Search, 
  ShieldAlert, Users, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS (14-DAY FAILOVER RETENTION)
// ------------------------------------------------------------------
const rbacMatrixOptions = queryOptions({
  queryKey: ['rbac_matrix'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('rbac_matrix')
      .select('role, permissions');
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION
// ------------------------------------------------------------------
export const Route = createFileRoute('/settings/rbac')({
  loader: async ({ context }: any) => {
    if (context?.queryClient) {
      try {
        await context.queryClient.ensureQueryData(rbacMatrixOptions);
      } catch (err) {
        console.warn('[RBAC Settings Loader]: Offline cache hydration active.', err);
      }
    }
  },
  component: RbacSettings,
});

// ------------------------------------------------------------------
// 3. EXHAUSTIVE SYSTEM PERMISSION REGISTRY
// ------------------------------------------------------------------
export interface PermissionAction {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionModule {
  module: string;
  description: string;
  actions: PermissionAction[];
}

export const RBAC_MODULES: PermissionModule[] = [
  {
    module: 'Husbandry & Animal Care',
    description: 'Daily logs, weight tracking, feeding charts, rounds, and census profiles',
    actions: [
      { key: 'husbandry:read', label: 'View Daily Logs, Rounds & Feeding Schedules', description: 'Read-only access to husbandry telemetry and feeding boards' },
      { key: 'husbandry:write', label: 'Create & Update Daily Logs, Weights & Food Intakes', description: 'Log feeds, daily rounds, temperatures, and bio-weights' },
      { key: 'husbandry:delete', label: 'Delete / Void Husbandry & Feeding Records', description: 'Purge erroneous logs and void recorded husbandry data' },
      { key: 'animal:manage', label: 'Create & Edit Specimen Profiles, Mobs & Census', description: 'Add new animals, reassign mobs, and edit identification markers' },
    ],
  },
  {
    module: 'Clinical & Veterinary',
    description: 'Medical history, quarantine monitoring, digital MAR charts, and prescriptions',
    actions: [
      { key: 'clinical:read', label: 'View Medical History, Quarantine & MAR Charts', description: 'Inspect specimen health files and active treatments' },
      { key: 'clinical:write', label: 'Administer Daily Medications & Log Health Checks', description: 'Sign off MAR dosages and record clinical observations' },
      { key: 'clinical:prescribe', label: 'Authorise & Prescribe Controlled Substances', description: 'Formulate veterinary prescriptions and active MAR regimes' },
      { key: 'clinical:vet', label: 'Attending Vet Clinical Sign-Off & Official Diagnoses', description: 'Formal statutory ZLA veterinary examination sign-off' },
    ],
  },
  {
    module: 'Logistics & Movements',
    description: 'Internal enclosure relocations and external institutional transfers',
    actions: [
      { key: 'transfers:read', label: 'View Internal Moves & Institutional Transfer Audits', description: 'Inspect historical and planned animal relocations' },
      { key: 'transfers:write', label: 'Request & Log Enclosure Movements', description: 'Initiate physical aviary and habitat transfers' },
      { key: 'transfers:approve', label: 'Authorize External Transfers & ZLA Dispositions', description: 'Sign off external loans, permanent acquisitions, and dispositions' },
      { key: 'logistics:delete', label: 'Permanently Delete Movement/Transfer Logs', description: 'Void and purge transfer logs from the ledger' },
    ],
  },
  {
    module: 'Events & Commercials',
    description: 'Weddings, school workshops, private encounters, and master operational calendar',
    actions: [
      { key: 'events:view', label: 'View Events Calendar & Dispatch Roster', description: 'Read-only access to scheduled displays, event timings, and resource allocations' },
      { key: 'events:manage', label: 'Create, Edit & Dispatch Events & Invoices', description: 'Schedule bookings, allocate keepers and birds, and manage Xero billing records' },
    ],
  },
  {
    module: 'Ticketing & Gate (Vouchers)',
    description: 'Visitor experience vouchers, gift ticket redemption, and gate verification',
    actions: [
      { key: 'vouchers:read', label: 'View Voucher Directory & Search Experience Codes', description: 'Browse issued experience vouchers and redemption history' },
      { key: 'vouchers:scan', label: 'Scan & Validate Digital QR Tickets at Gate', description: 'Operate tablet camera scanner for live admission' },
      { key: 'vouchers:manage', label: 'Issue Vouchers, Manual Overrides & View Purchaser PII', description: 'Generate custom codes, adjust expirations, and access customer details' },
    ],
  },
  {
    module: 'Safety & Operations',
    description: 'Incident investigations, emergency drills, first aid logs, and work orders',
    actions: [
      { key: 'safety:read', label: 'View Incident Reports, Drills & Maintenance Logs', description: 'Read-only access to safety ledger and drill records' },
      { key: 'safety:write', label: 'Submit Incidents, Log First Aid & Record Drills', description: 'File operational breach reports, clinical first aid, and fire/escape drills' },
      { key: 'safety:manage', label: 'Resolve Incidents & Authorize Risk Assessments', description: 'Sign off and close active compliance incidents and drills' },
      { key: 'maintenance:write', label: 'Submit & Update Facility Maintenance Work Orders', description: 'Report enclosure damage, plumbing, heating, and mesh defects' },
      { key: 'maintenance:manage', label: 'Assign, Update & Formally Close Work Orders', description: 'Direct maintenance technicians and certify containment repairs' },
    ],
  },
  {
    module: 'Staff Hub, Rota & Timesheets',
    description: 'Staff scheduling, shift rotas, attendance tracking, and leave management',
    actions: [
      { key: 'rota:view', label: 'View Public Staff Schedule & Team Calendar', description: 'Access operational rota matrix and working allocations' },
      { key: 'rota:manage', label: 'Assign Daily Shifts, Overrides & Shift Allocations', description: 'Create ad-hoc shifts and adjust operational rosters' },
      { key: 'shifts:manage', label: 'Access 90-Day Shift Pattern Generator & Global Purge', description: 'Automated batch scheduling engine and roster management' },
      { key: 'staff:manage', label: 'Manage Staff Rosters, Leave Approvals & Directory', description: 'Approve team leave requests and manage user profile records' },
      { key: 'timesheet:self', label: 'Clock In / Clock Out (Personal Timesheet Only)', description: 'Daily attendance punch clock for individual staff' },
      { key: 'timesheet:manage', label: 'Review & Formally Approve Staff Timesheets', description: 'Approve overtime and finalize workforce hours for payroll' },
      { key: 'hr:read', label: 'View Leave Calendar & Time-Off Requests', description: 'Inspect upcoming staff holidays and absence schedules' },
      { key: 'hr:approve', label: 'Formally Approve / Reject Leave Applications', description: 'Approve or reject annual leave, sick, and training requests' },
      { key: 'hr:sensitive', label: 'View Private HR Medical Disclosures & Emergency Contacts', description: 'Access confidential medical notes, home addresses, and next of kin' },
    ],
  },
  {
    module: 'Reports & Statutory Audits',
    description: 'Statutory Zoo Licensing Act (ZLA) report generation and data compilation',
    actions: [
      { key: 'reports:view', label: 'View Live Operational Data Previews & Summaries', description: 'Inspect census statistics and telemetry summaries' },
      { key: 'reports:export', label: 'Compile & Export ZLA Inspection Packs & .DOCX', description: 'Generate formal regulatory audit documentation' },
    ],
  },
  {
    module: 'System Administration',
    description: 'Global site configuration, user provisioning, and RBAC governance',
    actions: [
      { key: 'admin:users', label: 'Provision, Suspend & Modify Staff User Accounts', description: 'Create user profiles and manage active account status' },
      { key: 'users:manage', label: 'Manage Access Control & Reset Offline PINs', description: 'Assign roles, adjust PIN codes, and configure credentials' },
      { key: 'admin:settings', label: 'Modify System Preferences & Operational Global Lists', description: 'Manage taxonomic drop-downs, food types, and feed methods' },
      { key: 'admin:system', label: 'Full System Root Control & Audit Logs', description: 'Unrestricted master access across all database domains' },
    ],
  },
];

const ROLES = ['SENIOR_KEEPER', 'KEEPER', 'VOLUNTEER', 'DIRECTOR', 'ADMIN'] as const;
type AppRole = typeof ROLES[number];

// ------------------------------------------------------------------
// 4. MAIN COMPONENT
// ------------------------------------------------------------------
export function RbacSettings() {
  const queryClient = useQueryClient();
  const { profile, hasPermission } = useAuth();

  const isDirectorOrAdmin = 
    hasPermission('admin:system') || 
    hasPermission('users:manage') || 
    ['DIRECTOR', 'ADMIN'].includes(profile?.role || '');

  const [selectedRole, setSelectedRole] = useState<AppRole>('KEEPER');
  const [matrixState, setMatrixState] = useState<Record<string, Set<string>>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Supabase Realtime Sync
  useEffect(() => {
    const channel = supabase
      .channel('rbac-matrix-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rbac_matrix' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rbac_matrix'] });
          queryClient.invalidateQueries({ queryKey: ['rbac_permissions'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: dbMatrix = [], isLoading } = useQuery(rbacMatrixOptions);

  // Synchronize database records into local state safely
  useEffect(() => {
    if (dbMatrix && dbMatrix.length > 0) {
      const state: Record<string, Set<string>> = {};
      dbMatrix.forEach((row: any) => {
        let perms: string[] = [];
        if (Array.isArray(row.permissions)) {
          perms = row.permissions;
        } else if (typeof row.permissions === 'string') {
          try {
            const parsed = JSON.parse(row.permissions);
            if (Array.isArray(parsed)) {
              perms = parsed;
            } else {
              perms = row.permissions.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
            }
          } catch {
            perms = row.permissions.split(',').map((s: string) => s.trim().replace(/^["'\[\]]|["'\[\]]$/g, ''));
          }
        }
        state[row.role] = new Set(perms);
      });
      setMatrixState(state);
    }
  }, [dbMatrix]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(matrixState).map(([role, permSet]) => ({
        role,
        permissions: Array.from(permSet),
      }));

      const { error } = await supabase
        .from('rbac_matrix')
        .upsert(updates, { onConflict: 'role' });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Permission matrix successfully updated.');
      queryClient.invalidateQueries({ queryKey: ['rbac_matrix'] });
      queryClient.invalidateQueries({ queryKey: ['rbac_permissions'] });
    },
    onError: (err: any) => {
      toast.error(`Failed to update permissions: ${err.message || 'Database error'}`);
    },
  });

  const handleToggle = (role: string, permKey: string) => {
    setMatrixState((prev) => {
      const currentSet = new Set(prev[role] || []);
      if (currentSet.has(permKey)) {
        currentSet.delete(permKey);
      } else {
        currentSet.add(permKey);
      }
      return { ...prev, [role]: currentSet };
    });
  };

  const handleToggleModuleAll = (role: string, moduleActions: PermissionAction[], enableAll: boolean) => {
    setMatrixState((prev) => {
      const currentSet = new Set(prev[role] || []);
      moduleActions.forEach(act => {
        if (enableAll) {
          currentSet.add(act.key);
        } else {
          currentSet.delete(act.key);
        }
      });
      return { ...prev, [role]: currentSet };
    });
  };

  const activePermissions = matrixState[selectedRole] || new Set();
  const isSelectedRoleRoot = selectedRole === 'ADMIN' || selectedRole === 'DIRECTOR';

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return RBAC_MODULES;
    const q = searchQuery.toLowerCase();
    return RBAC_MODULES.map(mod => {
      const matchingActions = mod.actions.filter(act => 
        act.label.toLowerCase().includes(q) || 
        act.key.toLowerCase().includes(q) || 
        (act.description && act.description.toLowerCase().includes(q))
      );
      if (mod.module.toLowerCase().includes(q) || matchingActions.length > 0) {
        return {
          ...mod,
          actions: matchingActions.length > 0 ? matchingActions : mod.actions
        };
      }
      return null;
    }).filter(Boolean) as PermissionModule[];
  }, [searchQuery]);

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'DIRECTOR': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'SENIOR_KEEPER': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'KEEPER': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (!isDirectorOrAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-sans">
        <ShieldAlert size={48} className="mb-4 opacity-20 text-slate-500" />
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Restricted Security Area</h2>
        <p className="text-xs font-medium text-slate-500 mt-1 max-w-sm text-center">
          Only Directors and System Administrators hold clearance to modify the global Role-Based Access Control matrix.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16 font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-500 shrink-0" size={22} />
            <h1 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
              Role-Based Access Control (RBAC)
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Configure granular feature permissions and module capabilities across operational roles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isLoading}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
        >
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="text-emerald-400" />}
          <span>Save Matrix</span>
        </button>
      </div>

      {/* Role Switcher & Filter Deck */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-200 shadow-inner">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {ROLES.map((role) => {
            const isSelected = selectedRole === role;
            const count = (matrixState[role] || new Set()).size;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{role.replace(/_/g, ' ')}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                  {role === 'ADMIN' ? 'ROOT' : count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <input
            type="text"
            placeholder="Search permissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 outline-none placeholder:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      {/* Target Role Identity Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
            <Users size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-tight text-slate-900">
                Target Role: {selectedRole.replace(/_/g, ' ')}
              </h2>
              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${getRoleBadgeClass(selectedRole)}`}>
                {selectedRole === 'ADMIN' ? 'System Root' : 'Operational Role'}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              {isSelectedRoleRoot 
                ? 'Administrators and Directors automatically possess complete unrestricted bypass across all modules.' 
                : `Currently assigned ${activePermissions.size} active system capabilities.`}
            </p>
          </div>
        </div>

        {isSelectedRoleRoot && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold shrink-0">
            <Lock size={13} className="text-amber-600" />
            <span>Root Bypass Protected</span>
          </div>
        )}
      </div>

      {/* Main Permissions Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="animate-spin text-slate-600 w-8 h-8" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Permission Matrix...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredModules.map((mod) => {
            const allChecked = mod.actions.every(act => activePermissions.has(act.key));

            return (
              <div key={mod.module} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 pb-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{mod.module}</h3>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">{mod.description}</p>
                    </div>

                    {!isSelectedRoleRoot && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleModuleAll(selectedRole, mod.actions, !allChecked)}
                          className="px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                          {allChecked ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {mod.actions.map((act) => {
                      const isChecked = activePermissions.has(act.key) || isSelectedRoleRoot;
                      return (
                        <label
                          key={act.key}
                          className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all ${
                            isSelectedRoleRoot 
                              ? 'bg-slate-50/50 border-slate-200 text-slate-500 cursor-not-allowed'
                              : isChecked 
                                ? 'bg-emerald-50/60 border-emerald-200 text-slate-900 cursor-pointer' 
                                : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100/50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isSelectedRoleRoot}
                            onChange={() => !isSelectedRoleRoot && handleToggle(selectedRole, act.key)}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold leading-tight">{act.label}</p>
                            {act.description && (
                              <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-snug">{act.description}</p>
                            )}
                            <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">{act.key}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security Architecture Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3 shadow-inner">
        <div className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600 shrink-0 shadow-sm">
          <Info size={16} />
        </div>
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-900">
            Realtime Propagation &amp; Security Protocol
          </h4>
          <p className="text-[11px] font-medium text-slate-600 mt-0.5 leading-relaxed">
            Saving matrix changes immediately broadcasts PostgreSQL Write-Ahead Log events over Supabase Realtime, refreshing capability sets across active staff tablets without requiring page reloads.
          </p>
        </div>
      </div>

    </div>
  );
}

export default RbacSettings;