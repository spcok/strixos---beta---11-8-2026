import React, { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { 
  ShieldCheck, UserPlus, Key, Mail, Loader2, X, AlertTriangle, 
  WifiOff, Phone, MapPin, Calendar, HeartPulse, CheckCircle2, Lock, Edit2, Save
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { createClient } from '@supabase/supabase-js';

export const Route = createFileRoute('/settings/access')({
  component: AccessControlPage,
});

// ------------------------------------------------------------------
// UPDATED GRANULAR RBAC DEFINITIONS (5-Tier)
// ------------------------------------------------------------------
const ROLE_PERMISSIONS: Record<string, { desc: string, grants: string[], restrictions: string[] }> = {
  VOLUNTEER: {
    desc: "Restricted entry-level access. Primarily read-only with basic logging capabilities.",
    grants: ["Read Daily Logs", "Read Feeding Records", "View Rotas"],
    restrictions: ["Cannot write medical records", "Cannot edit animal profiles", "Cannot access HR data"]
  },
  KEEPER: {
    desc: "Standard operational staff. Focused on daily animal care and husbandry.",
    grants: ["Read/Write Daily Logs", "Read/Write Feeding Records", "View Animal Profiles", "Log Basic Maintenance"],
    restrictions: ["Cannot alter medical/clinical records", "Cannot view organizational HR data", "Cannot approve internal movements"]
  },
  SENIOR_KEEPER: {
    desc: "Elevated operational control. Oversees standard keepers and approves logistics.",
    grants: ["All Keeper Permissions", "Approve Internal Movements", "Create Rotas & Assign Shifts", "Access Clinical & Medical Records"],
    restrictions: ["Cannot manage user access", "Cannot alter ZLA configuration"]
  },
  DIRECTOR: {
    desc: "Facility Director / Owner. Unrestricted operational and logistical access.",
    grants: ["All Senior Keeper Permissions", "Manage Financial/Audit Logs", "Alter ZLA Organization Profile", "Approve External Transfers"],
    restrictions: ["Cannot modify core system engineering"]
  },
  ADMIN: {
    desc: "System Administrator. Absolute root control over the StrixOS instance.",
    grants: ["Provision & Suspend Users", "Alter Granular RBAC Configurations", "Access Raw System Audits", "Bypass all constraints"],
    restrictions: ["None (Root Access)"]
  }
};

export function AccessControlPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  const [modalState, setModalState] = useState<{ isOpen: boolean, userToEdit?: any }>({ isOpen: false });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['system_users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    meta: { persist: true }
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'DIRECTOR': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'SENIOR_KEEPER': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'KEEPER': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200'; // VOLUNTEER
    }
  };

  if (profile?.role !== 'ADMIN' && profile?.role !== 'DIRECTOR') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <ShieldCheck size={48} className="mb-4 opacity-20" />
        <h2 className="text-lg font-black uppercase tracking-widest">Unauthorized Area</h2>
        <p className="text-sm font-bold mt-2">Only Directors and Administrators can access account provisioning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      
      {!isOnline && (
        <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center text-center max-w-sm">
            <WifiOff className="text-rose-600 mb-4" size={32} />
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Network Required</h2>
            <p className="text-xs font-bold text-slate-500">Managing secure user accounts requires a direct connection to the backend. Please reconnect.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-slate-200 pb-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-emerald-600" size={24} /> Access & Provisioning
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Manage Staff Profiles & RBAC Definitions</p>
        </div>
        <button 
          onClick={() => setModalState({ isOpen: true, userToEdit: null })}
          disabled={!isOnline}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm shrink-0"
        >
          <UserPlus size={16} /> Provision New Account
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[1000px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">System Role</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Offline PIN</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600 uppercase shrink-0 border border-slate-300">
                          {u.initials || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 flex items-center gap-2">
                            {u.name}
                            {u.is_active === false && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[8px] uppercase tracking-widest font-black">Suspended</span>}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 font-mono">ID: {u.id.split('-')[0]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                         <span className="text-xs font-medium text-slate-600">{u.email || 'No email linked'}</span>
                         <span className="text-[10px] font-bold text-slate-400">{u.phone || 'No phone linked'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${getRoleBadge(u.role)}`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Key size={14} className={u.pin ? "text-emerald-500" : "text-slate-300"} />
                        <span className="font-mono text-xs font-bold text-slate-600 tracking-widest">
                          {u.pin ? '****' : 'UNSET'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setModalState({ isOpen: true, userToEdit: u })}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                        title="Edit User Profile"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalState.isOpen && (
        <UnifiedUserModal 
          existingUser={modalState.userToEdit}
          onClose={() => setModalState({ isOpen: false })} 
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// UNIFIED MODAL (CREATE & EDIT) - StrixOS Utilitarian Styling
// ------------------------------------------------------------------
function UnifiedUserModal({ existingUser, onClose }: { existingUser?: any, onClose: () => void }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isEditing = !!existingUser;

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      let targetUserId = existingUser?.id;

      // SCENARIO 1: NEW USER PROVISIONING
      if (!isEditing) {
        // EXACT MIRROR OF src/lib/supabase.ts ENVIRONMENT LOGIC
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Critical Infrastructure Failure: Missing Supabase Environment Variables');
        }

        const authClient = createClient(supabaseUrl, supabaseAnonKey, { 
          auth: { persistSession: false, autoRefreshToken: false } 
        });

        const { data: authData, error: authError } = await authClient.auth.signUp({
          email: payload.email,
          password: payload.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Authentication identity creation failed.");
        targetUserId = authData.user.id;
      }

      // SCENARIO 2: DATABASE UPSERT (Shared logic for both New & Edit)
      const initials = payload.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
      
      const dbPayload = {
        id: targetUserId,
        email: payload.email, 
        name: payload.name,
        initials: initials,
        role: payload.role,
        pin: payload.pin || null,
        phone: payload.phone || null,
        address: payload.address || null,
        dob: payload.dob || null,
        emergency_contact_name: payload.emergency_contact_name || null,
        emergency_contact_phone: payload.emergency_contact_phone || null,
        start_date: payload.start_date || null,
        hr_notes: payload.hr_notes || null,
        is_active: payload.is_active
      };

      const { error: dbError } = await supabase.from('users').upsert([dbPayload]);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system_users'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || `Failed to ${isEditing ? 'update' : 'provision'} account.`)
  });

  const form = useForm({
    defaultValues: { 
      name: existingUser?.name || '', 
      email: existingUser?.email || '', 
      password: '', // Always empty, cannot be edited here
      role: existingUser?.role || 'KEEPER', 
      pin: existingUser?.pin || '',
      phone: existingUser?.phone || '', 
      address: existingUser?.address || '', 
      dob: existingUser?.dob || '', 
      emergency_contact_name: existingUser?.emergency_contact_name || '', 
      emergency_contact_phone: existingUser?.emergency_contact_phone || '', 
      start_date: existingUser?.start_date || new Date().toISOString().split('T')[0], 
      hr_notes: existingUser?.hr_notes || '',
      is_active: existingUser?.is_active ?? true
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      if (value.pin && value.pin.length !== 4) {
        setErrorMsg("Offline PIN must be exactly 4 digits.");
        return;
      }
      if (!isEditing && (!value.password || value.password.length < 6)) {
        setErrorMsg("New accounts require a temporary password (min 6 characters).");
        return;
      }
      await mutation.mutateAsync(value);
    }
  });

  const inputClass = "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all";
  const disabledClass = "opacity-60 bg-slate-100 cursor-not-allowed";
  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5";
  const sectionTitleClass = "text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4 pb-2 border-b border-slate-100";

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        
        {/* Utilitarian Header */}
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 text-lg">
              {isEditing ? <Edit2 size={20} className="text-emerald-600" /> : <UserPlus size={20} className="text-emerald-600" />}
              {isEditing ? 'Edit Staff Profile' : 'Comprehensive Staff Onboarding'}
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
              {isEditing ? `Managing ID: ${existingUser.id.split('-')[0]}` : 'Guided account generation & HR profile setup'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT: THE FORM */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
            <form id="provisioning-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-8 max-w-2xl mx-auto">
              
              {errorMsg && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-bold flex items-center gap-3">
                  <AlertTriangle size={18} className="shrink-0" /> {errorMsg}
                </div>
              )}

              {/* SECTION 1: Authentication */}
              <div>
                <h4 className={sectionTitleClass}><Lock size={16} className="text-slate-400" /> Secure Authentication</h4>
                {isEditing && (
                   <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-4 bg-amber-50 p-2 rounded border border-amber-200">
                     Login Credentials (Email/Password) are locked by Auth security protocols.
                   </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <form.Field name="email" children={(field) => (
                    <div>
                      <label className={labelClass}>Login Email *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="email" required disabled={isEditing} placeholder="name@kentowlacademy.com" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9 ${isEditing ? disabledClass : ''}`} />
                      </div>
                    </div>
                  )} />
                  <form.Field name="password" children={(field) => (
                    <div>
                      <label className={labelClass}>{isEditing ? 'Password (Locked)' : 'Temporary Password *'}</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="password" required={!isEditing} disabled={isEditing} placeholder={isEditing ? '********' : 'Min. 6 characters'} value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9 font-mono text-sm ${isEditing ? disabledClass : ''}`} />
                      </div>
                    </div>
                  )} />
                  <form.Field name="pin" children={(field) => (
                    <div className="md:col-span-2">
                      <label className={labelClass}>Offline Tablet PIN (Optional)</label>
                      <input type="password" maxLength={4} placeholder="4-Digit Code (e.g., 1234)" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value.replace(/\D/g, ''))} className={`${inputClass} font-mono tracking-widest`} />
                    </div>
                  )} />
                </div>
              </div>

              {/* SECTION 2: Personal Details */}
              <div>
                <h4 className={sectionTitleClass}><UserPlus size={16} className="text-slate-400" /> Personal Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <form.Field name="name" children={(field) => (
                    <div className="md:col-span-2">
                      <label className={labelClass}>Full Legal Name *</label>
                      <input required placeholder="e.g. John Doe" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )} />
                  <form.Field name="phone" children={(field) => (
                    <div>
                      <label className={labelClass}>Mobile Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="tel" placeholder="+44 7000 000000" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  )} />
                  <form.Field name="dob" children={(field) => (
                    <div>
                      <label className={labelClass}>Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  )} />
                  <form.Field name="address" children={(field) => (
                    <div className="md:col-span-2">
                      <label className={labelClass}>Home Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 text-slate-400" size={14} />
                        <textarea rows={2} placeholder="Full physical address..." value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} pl-9 py-2`} />
                      </div>
                    </div>
                  )} />
                </div>
              </div>

              {/* SECTION 3: Emergency & HR */}
              <div>
                <h4 className={sectionTitleClass}><HeartPulse size={16} className="text-slate-400" /> Emergency & HR Data</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <form.Field name="emergency_contact_name" children={(field) => (
                    <div>
                      <label className={labelClass}>Emergency Contact Name</label>
                      <input type="text" placeholder="e.g. Jane Doe (Wife)" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )} />
                  <form.Field name="emergency_contact_phone" children={(field) => (
                    <div>
                      <label className={labelClass}>Emergency Contact Phone</label>
                      <input type="tel" placeholder="Primary phone number" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )} />
                  <form.Field name="start_date" children={(field) => (
                    <div>
                      <label className={labelClass}>Employment Start Date</label>
                      <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )} />
                  {isEditing && (
                    <form.Field name="is_active" children={(field) => (
                      <div>
                        <label className={labelClass}>Account Status</label>
                        <select value={field.state.value ? 'true' : 'false'} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value === 'true')} className={inputClass}>
                          <option value="true">ACTIVE</option>
                          <option value="false">SUSPENDED</option>
                        </select>
                      </div>
                    )} />
                  )}
                  <form.Field name="hr_notes" children={(field) => (
                    <div className="md:col-span-2">
                      <label className={labelClass}>HR Notes / Medical Disclosures</label>
                      <textarea rows={2} placeholder="Allergies, conditions, or HR specific notes..." value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                    </div>
                  )} />
                </div>
              </div>

            </form>
          </div>

          {/* RIGHT: RBAC VISUALIZER */}
          <div className="w-96 bg-slate-50 border-l border-slate-200 p-6 flex flex-col shrink-0">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6">
              <ShieldCheck size={16} className="text-emerald-500" /> Base RBAC Assignment
            </h4>
            
            <form.Subscribe selector={(state) => state.values.role}>
              {(selectedRole) => {
                const matrix = ROLE_PERMISSIONS[selectedRole] || ROLE_PERMISSIONS['KEEPER'];
                
                return (
                  <div className="space-y-6 flex-1">
                    <form.Field name="role" children={(field) => (
                      <div>
                        <label className={labelClass}>Assign Base System Role</label>
                        <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer">
                          <option value="VOLUNTEER">VOLUNTEER</option>
                          <option value="KEEPER">KEEPER</option>
                          <option value="SENIOR_KEEPER">SENIOR KEEPER</option>
                          <option value="DIRECTOR">DIRECTOR</option>
                          <option value="ADMIN">SYSTEM ADMIN</option>
                        </select>
                      </div>
                    )} />

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <p className="text-xs font-bold text-slate-600 leading-relaxed">{matrix.desc}</p>
                      </div>
                      
                      <div className="p-4 space-y-4">
                        <div>
                          <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 size={12} /> Standard Capabilities</h5>
                          <ul className="space-y-1.5">
                            {matrix.grants.map((grant, idx) => (
                              <li key={idx} className="text-[11px] font-bold text-slate-600 flex items-start gap-2">
                                <span className="text-emerald-500 mt-0.5">•</span> {grant}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h5 className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Lock size={12} /> Hard Restrictions</h5>
                          <ul className="space-y-1.5">
                            {matrix.restrictions.map((restriction, idx) => (
                              <li key={idx} className="text-[11px] font-bold text-slate-600 flex items-start gap-2">
                                <span className="text-rose-500 mt-0.5">×</span> {restriction}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }}
            </form.Subscribe>

            {/* Footer Actions */}
            <div className="pt-6 border-t border-slate-200">
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <button type="submit" form="provisioning-form" disabled={!canSubmit || isSubmitting as boolean || mutation.isPending} className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50">
                    {(isSubmitting || mutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : (isEditing ? <><Save size={16} /> Save Changes</> : <><UserPlus size={16} /> Provision Account</>)}
                  </button>
                )}
              </form.Subscribe>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}