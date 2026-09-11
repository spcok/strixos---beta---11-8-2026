import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { BriefcaseMedical, Plus, X, Search, Activity, Save, Loader2, Stethoscope, UserCircle, Ambulance, AlertTriangle } from 'lucide-react';
import { format, parseISO, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { firstAidService, StaffMember } from '../services/firstAidService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const firstAidLogsOptions = queryOptions({
  queryKey: ['first_aid_logs'],
  queryFn: () => firstAidService.getFirstAidLogs(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => firstAidService.getStaffMembers(),
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching)
// ------------------------------------------------------------------
export const Route = createFileRoute('/safety/first-aid')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([
        queryClient.ensureQueryData(firstAidLogsOptions),
        queryClient.ensureQueryData(staffMembersOptions)
      ]);
    }
  },
  component: FirstAidPage,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function FirstAidPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('first-aid-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'first_aid_logs' },
        (payload) => {
          console.log('[Sync Engine] External mutation detected. Purging local cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['first_aid_logs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: logs = [], isLoading } = useQuery(firstAidLogsOptions);
  const { data: staffMembers = [] } = useQuery(staffMembersOptions);

  const staffMap = useMemo(() => new Map(staffMembers.map((s: StaffMember) => [s.id, s])), [staffMembers]);

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const lowerQuery = searchQuery.toLowerCase();
    return logs.filter((log: any) => 
      (log.person_involved_name || '').toLowerCase().includes(lowerQuery) ||
      (log.treatment_provided || '').toLowerCase().includes(lowerQuery)
    );
  }, [logs, searchQuery]);

  // ------------------------------------------------------------------
  // 4. WINDOW VIRTUALIZER (DOM PROTECTION WITHOUT UI/UX SHIFT)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredLogs.length,
    estimateSize: () => 100, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <BriefcaseMedical className="text-emerald-600" size={24} /> First Aid Register
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Clinical Administration & Treatment Logging</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search patient or treatment..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          >
            <Plus size={16} /> Log Treatment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="w-full overflow-x-auto relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
            </div>
          )}

          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/6">Date & Time</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/5">Patient Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Injury Assessment</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/4">Treatment & Admin</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Escalation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    No medical records found matching these parameters.
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={5} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const log = filteredLogs[virtualRow.index];
                    const dateObj = new Date(log.incident_date);
                    const firstAider = staffMap.get(log.administered_by);

                    return (
                      <tr key={log.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {format(dateObj, 'dd MMM yyyy')} | {format(dateObj, 'HH:mm')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{log.person_involved_name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{log.person_type}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-medium text-slate-600 line-clamp-2">{log.injury_description || '--'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-1.5 text-emerald-700">
                              <Stethoscope size={14} className="shrink-0 mt-0.5" />
                              <p className="text-[11px] font-bold leading-relaxed line-clamp-2">{log.treatment_provided}</p>
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                              By: {firstAider ? `${firstAider.name} (${firstAider.initials})` : 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end gap-2">
                            {log.referral_needed && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[9px] font-black text-rose-700 uppercase tracking-widest w-fit shadow-sm">
                                <Ambulance size={12} /> External Care
                              </div>
                            )}
                            {log.incident_id && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-200 bg-amber-50 text-[9px] font-black text-amber-700 uppercase tracking-widest w-fit shadow-sm">
                                <AlertTriangle size={12} /> Incident Logged
                              </div>
                            )}
                            {!log.referral_needed && !log.incident_id && (
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Isolated Event</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={5} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <FirstAidModal 
          onClose={() => setIsModalOpen(false)} 
          userId={user?.id}
          staffMembers={staffMembers}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPOUND MODAL COMPONENT 
// ---------------------------------------------------------------------------
function FirstAidModal({ onClose, userId, staffMembers }: { onClose: () => void, userId?: string, staffMembers: StaffMember[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveCompoundMutation = useMutation({
    mutationFn: async (payloads: { firstAid: any, incident?: any }) => {
      await firstAidService.commitFirstAidLog(payloads.firstAid, payloads.incident);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['first_aid_logs'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to sync clinical record.');
    }
  });

  const form = useForm({
    defaultValues: {
      incident_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      person_involved_name: '',
      person_type: 'KEEPER',
      administered_by: userId || '',
      injury_description: '',
      treatment_provided: '',
      referral_needed: false,
      referral_details: '',
      escalate_to_incident: false,
      incident_title: '',
      incident_type: 'ANIMAL_BEHAVIOR',
      severity: 'MEDIUM',
      incident_description: '',
      immediate_action_taken: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      // ENTERPRISE FIX: Strict ISO output with timezone offset retained
      const parsedDate = formatISO(parseISO(value.incident_date));

      const firstAidPayload = {
        incident_date: parsedDate,
        person_involved_name: value.person_involved_name,
        person_type: value.person_type,
        administered_by: value.administered_by,
        injury_description: value.injury_description,
        treatment_provided: value.treatment_provided,
        referral_needed: value.referral_needed,
        referral_details: value.referral_needed ? value.referral_details : null,
      };

      let incidentPayload = undefined;

      if (value.escalate_to_incident) {
        incidentPayload = {
          title: value.incident_title,
          incident_date: parsedDate,
          incident_type: value.incident_type,
          severity: value.severity,
          description: value.incident_description,
          immediate_action_taken: value.immediate_action_taken
        };
      }

      await saveCompoundMutation.mutateAsync({ firstAid: firstAidPayload, incident: incidentPayload });
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center z-20 shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <BriefcaseMedical size={20} className="text-emerald-600" /> Clinical Assessment
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form id="compound-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="incident_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Date & Time of Treatment</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="person_type">
              {(field) => (
                <div>
                  <label className={labelClass}>Patient Category</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="KEEPER">Staff / Keeper</option>
                    <option value="PUBLIC">Public / Visitor</option>
                    <option value="CONTRACTOR">Contractor</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="person_involved_name">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Patient Full Name</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. John Doe" className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-5">
            <form.Field name="injury_description">
              {(field) => (
                <div>
                  <label className={labelClass}>Nature of Injury / Symptoms</label>
                  <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none h-20`} placeholder="E.g., Laceration on left index finger, approx 2cm long..." />
                </div>
              )}
            </form.Field>
            
            <form.Field name="treatment_provided">
              {(field) => (
                <div>
                  <label className={`${labelClass} flex items-center gap-2`}><Activity size={14} className="text-emerald-600" /> Treatment Administered & Kit Usage</label>
                  <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none h-24 bg-emerald-50/30 border-emerald-200 focus:border-emerald-500`} placeholder="E.g., Cleaned wound with sterile wipe, applied plaster. Patient rested for 10 mins..." />
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-4 border-t border-slate-100">
            <form.Field name="administered_by">
              {(field) => (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                  <label className={`${labelClass} text-emerald-700`}><UserCircle size={14} className="inline mr-1 mb-0.5" /> Attending First Aider</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} required className={inputClass}>
                    <option value="">-- Select First Aider --</option>
                    {staffMembers.map((staff: StaffMember) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name || staff.email} {staff.initials ? `(${staff.initials})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form.Field>

            <div className="space-y-4">
              <form.Field name="referral_needed">
                {(field) => (
                  <label className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100 transition-colors shadow-sm">
                    <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 bg-white" />
                    <span className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-2"><Ambulance size={16} /> External Medical Care Required</span>
                  </label>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.referral_needed}>
                {(referralNeeded) => referralNeeded && (
                  <form.Field name="referral_details">
                    {(field) => (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className={labelClass}>Hospital / Paramedic Details</label>
                        <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Ambulance called at 14:30..." className={`${inputClass} border-rose-200 focus:border-rose-500 focus:ring-rose-500/20`} />
                      </div>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <form.Field name="escalate_to_incident">
              {(field) => (
                <label className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors shadow-sm">
                  <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 bg-white" />
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={16} /> Incident?
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 mt-0.5">Check this if the injury resulted from an animal attack, facility breach, or compliance failure.</span>
                  </div>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.escalate_to_incident}>
              {(escalate) => escalate && (
                <div className="mt-4 p-5 bg-white border-2 border-amber-200 rounded-2xl shadow-sm space-y-5 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Linked Incident Report</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <form.Field name="incident_title">
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Incident Title</label>
                          <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g., European Eagle Owl Strike in Aviary B" className={`${inputClass} border-amber-200 focus:border-amber-500 focus:ring-amber-500/20`} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="incident_type">
                      {(field) => (
                        <div>
                          <label className={labelClass}>Incident Classification</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-amber-200 focus:border-amber-500`} required>
                            <option value="ANIMAL_BEHAVIOR">Animal Attack / Strike</option>
                            <option value="ESCAPE">Animal Escape</option>
                            <option value="INFRASTRUCTURE">Facility Failure / Equipment</option>
                            <option value="SLIP_TRIP_FALL">Slip, Trip, or Fall</option>
                            <option value="OTHER">Other Operational Breach</option>
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="severity">
                      {(field) => (
                        <div>
                          <label className={labelClass}>Severity Matrix</label>
                          <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-amber-200 focus:border-amber-500`} required>
                            <option value="LOW">LOW - Minor disruption</option>
                            <option value="MEDIUM">MEDIUM - Controlled breach</option>
                            <option value="HIGH">HIGH - Severe incident</option>
                            <option value="CRITICAL">CRITICAL - Emergency protocols initiated</option>
                          </select>
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="incident_description">
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Operational Description</label>
                          <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none border-amber-200 focus:border-amber-500`} placeholder="Detailed breakdown of how the operational breach occurred..." />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="immediate_action_taken">
                      {(field) => (
                        <div className="md:col-span-2">
                          <label className={labelClass}>Immediate Operational Actions Taken</label>
                          <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none border-amber-200 focus:border-amber-500`} placeholder="E.g., Aviary locked down, birds isolated in holding pen, area cordoned off..." />
                        </div>
                      )}
                    </form.Field>
                  </div>
                </div>
              )}
            </form.Subscribe>
          </div>

        </form>
        
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-20 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.values.escalate_to_incident]}>
            {([canSubmit, isSubmitting, isEscalating]) => (
              <button 
                type="submit" 
                form="compound-form" 
                disabled={!canSubmit || isSubmitting as boolean || saveCompoundMutation.isPending} 
                className={`px-8 py-2.5 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg disabled:opacity-50 ${
                  isEscalating 
                    ? 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 shadow-[0_0_15px_rgba(217,119,6,0.2)]'
                    : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                }`}
              >
                {isSubmitting || saveCompoundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isEscalating ? 'Commit Linked Reports' : 'Commit Medical Record'}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}